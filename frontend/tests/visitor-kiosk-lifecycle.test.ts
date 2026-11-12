import { describe, expect, it } from "bun:test";
import {
  clearKioskDraft,
  clearKioskStorage,
  kioskDraftTtlMs,
  readExpiringKioskDraft,
  writeExpiringKioskDraft,
} from "../src/visitor-kiosk-lifecycle";
import {
  createKioskStatusUpdates,
  type KioskStatusScheduler,
} from "../src/visitor-kiosk-live-updates";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("visitor kiosk draft storage", () => {
  it("expires drafts after 30 minutes and removes expired personal data", () => {
    const storage = new MemoryStorage();
    const savedAt = 1_000;
    const expiresAt = writeExpiringKioskDraft(
      storage,
      "draft",
      { version: 1, visitorName: "Visitor" },
      savedAt,
    );

    expect(expiresAt).toBe(savedAt + kioskDraftTtlMs);
    expect(readExpiringKioskDraft(storage, "draft", expiresAt - 1)).toMatchObject({
      visitorName: "Visitor",
    });
    expect(readExpiringKioskDraft(storage, "draft", expiresAt)).toBeNull();
    expect(storage.getItem("draft")).toBeNull();
  });

  it("migrates active legacy drafts and clears all kiosk data when abandoned", () => {
    const storage = new MemoryStorage();
    storage.setItem("draft", JSON.stringify({ version: 1, visitorName: "Visitor" }));
    storage.setItem("pending", "receipt");

    expect(readExpiringKioskDraft(storage, "draft", 5_000)).toMatchObject({
      expiresAt: 5_000 + kioskDraftTtlMs,
    });
    clearKioskStorage(storage, "draft", "pending");
    expect(storage.getItem("draft")).toBeNull();
    expect(storage.getItem("pending")).toBeNull();
  });

  it("removes the personal draft when registration succeeds but retains its receipt", () => {
    const storage = new MemoryStorage();
    storage.setItem("draft", "personal data");
    storage.setItem("pending", "receipt");

    clearKioskDraft(storage, "draft");
    expect(storage.getItem("draft")).toBeNull();
    expect(storage.getItem("pending")).toBe("receipt");
  });
});

class ManualScheduler implements KioskStatusScheduler {
  private nextId = 1;
  readonly timeouts = new Map<number, { callback: () => void; delay: number }>();
  readonly intervals = new Map<number, { callback: () => void; delay: number }>();

  setTimeout(callback: () => void, delay: number) {
    const id = this.nextId++;
    this.timeouts.set(id, { callback, delay });
    return id;
  }

  clearTimeout(id: number) {
    this.timeouts.delete(id);
  }

  setInterval(callback: () => void, delay: number) {
    const id = this.nextId++;
    this.intervals.set(id, { callback, delay });
    return id;
  }

  clearInterval(id: number) {
    this.intervals.delete(id);
  }

  runTimeout(id: number) {
    const timer = this.timeouts.get(id);
    if (!timer) return;
    this.timeouts.delete(id);
    timer.callback();
  }
}

class FakeEventSource {
  onopen: ((this: EventSource, event: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, event: MessageEvent) => unknown) | null = null;
  onerror: ((this: EventSource, event: Event) => unknown) | null = null;
  closed = false;

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.call(this as unknown as EventSource, new Event("open"));
  }

  fail() {
    this.onerror?.call(this as unknown as EventSource, new Event("error"));
  }
}

describe("visitor kiosk live status updates", () => {
  it("polls only after SSE fails and stops polling after reconnection", () => {
    const scheduler = new ManualScheduler();
    const sources: FakeEventSource[] = [];
    let refreshes = 0;
    const updates = createKioskStatusUpdates(
      () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source as unknown as EventSource;
      },
      () => {
        refreshes += 1;
      },
      scheduler,
    );

    updates.start();
    expect(sources).toHaveLength(1);
    expect(scheduler.intervals.size).toBe(0);

    sources[0].fail();
    expect(sources[0].closed).toBe(true);
    expect(scheduler.intervals.size).toBe(1);
    expect([...scheduler.intervals.values()][0].delay).toBe(15_000);
    expect([...scheduler.timeouts.values()][0].delay).toBe(1_000);

    const reconnectTimer = [...scheduler.timeouts.keys()][0];
    scheduler.runTimeout(reconnectTimer);
    expect(sources).toHaveLength(2);
    sources[1].open();
    expect(scheduler.intervals.size).toBe(0);
    expect(refreshes).toBeGreaterThan(0);

    updates.stop();
    expect(sources[1].closed).toBe(true);
    expect(scheduler.intervals.size).toBe(0);
    expect(scheduler.timeouts.size).toBe(0);
  });

  it("allows an immediate reconnect when network connectivity returns", () => {
    const scheduler = new ManualScheduler();
    const sources: FakeEventSource[] = [];
    const updates = createKioskStatusUpdates(
      () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source as unknown as EventSource;
      },
      () => {},
      scheduler,
    );

    updates.start();
    sources[0].fail();
    updates.reconnectNow();

    expect(sources).toHaveLength(2);
    expect(scheduler.timeouts.size).toBe(0);
    updates.stop();
  });

  it("increases reconnect delays after repeated failures", () => {
    const scheduler = new ManualScheduler();
    const sources: FakeEventSource[] = [];
    const updates = createKioskStatusUpdates(
      () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source as unknown as EventSource;
      },
      () => {},
      scheduler,
    );

    updates.start();
    sources[0].fail();
    scheduler.runTimeout([...scheduler.timeouts.keys()][0]);
    sources[1].fail();
    expect([...scheduler.timeouts.values()][0].delay).toBe(2_000);
    updates.stop();
  });
});
