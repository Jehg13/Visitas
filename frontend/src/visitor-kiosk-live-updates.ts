export type KioskStatusScheduler = {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(timer: number): void;
};

const pollingIntervalMs = 15_000;
const initialReconnectDelayMs = 1_000;
const maxReconnectDelayMs = 30_000;

const browserScheduler: KioskStatusScheduler = {
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer),
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: (timer) => window.clearInterval(timer),
};

export function createKioskStatusUpdates(
  connect: () => EventSource,
  refresh: () => void | Promise<void>,
  scheduler: KioskStatusScheduler = browserScheduler,
) {
  let active = false;
  let eventSource: EventSource | null = null;
  let pollingTimer: number | undefined;
  let reconnectTimer: number | undefined;
  let reconnectAttempts = 0;

  function clearReconnectTimer() {
    if (reconnectTimer === undefined) return;
    scheduler.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function startPolling() {
    if (pollingTimer !== undefined) return;
    pollingTimer = scheduler.setInterval(() => {
      void refresh();
    }, pollingIntervalMs);
  }

  function scheduleReconnect() {
    if (!active || reconnectTimer !== undefined) return;
    const delay = Math.min(
      initialReconnectDelayMs * 2 ** reconnectAttempts,
      maxReconnectDelayMs,
    );
    reconnectAttempts += 1;
    reconnectTimer = scheduler.setTimeout(() => {
      reconnectTimer = undefined;
      connectToEvents();
    }, delay);
  }

  function handleConnectionFailure(source?: EventSource) {
    if (!active || (source && eventSource !== source)) return;
    if (source) {
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();
      eventSource = null;
    }
    startPolling();
    void refresh();
    scheduleReconnect();
  }

  function connectToEvents() {
    if (!active || eventSource) return;
    try {
      const source = connect();
      eventSource = source;
      source.onopen = () => {
        if (!active || eventSource !== source) return;
        reconnectAttempts = 0;
        clearReconnectTimer();
        if (pollingTimer !== undefined) {
          scheduler.clearInterval(pollingTimer);
          pollingTimer = undefined;
        }
        void refresh();
      };
      source.onmessage = () => {
        if (active && eventSource === source) void refresh();
      };
      source.onerror = () => handleConnectionFailure(source);
    } catch {
      handleConnectionFailure();
    }
  }

  function start() {
    if (active) return;
    active = true;
    connectToEvents();
  }

  function reconnectNow() {
    if (!active || eventSource) return;
    clearReconnectTimer();
    reconnectAttempts = 0;
    connectToEvents();
  }

  function stop() {
    active = false;
    clearReconnectTimer();
    if (pollingTimer !== undefined) {
      scheduler.clearInterval(pollingTimer);
      pollingTimer = undefined;
    }
    if (eventSource) {
      eventSource.onopen = null;
      eventSource.onmessage = null;
      eventSource.onerror = null;
      eventSource.close();
      eventSource = null;
    }
    reconnectAttempts = 0;
  }

  return { start, stop, reconnectNow };
}
