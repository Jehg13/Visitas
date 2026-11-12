export const kioskDraftTtlMs = 30 * 60 * 1000;

type KioskStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function writeExpiringKioskDraft<T extends Record<string, unknown>>(
  storage: KioskStorage,
  key: string,
  draft: T,
  now = Date.now(),
): number {
  const expiresAt = now + kioskDraftTtlMs;
  storage.setItem(key, JSON.stringify({ ...draft, expiresAt }));
  return expiresAt;
}

export function readExpiringKioskDraft(
  storage: KioskStorage,
  key: string,
  now = Date.now(),
): unknown | null {
  const saved = storage.getItem(key);
  if (saved === null) return null;

  const parsed: unknown = JSON.parse(saved);
  if (!isRecord(parsed)) {
    storage.removeItem(key);
    return null;
  }

  if (parsed.expiresAt === undefined && parsed.version === 1) {
    return { ...parsed, expiresAt: now + kioskDraftTtlMs };
  }

  if (
    !Number.isSafeInteger(parsed.expiresAt) ||
    Number(parsed.expiresAt) <= now
  ) {
    storage.removeItem(key);
    return null;
  }

  return parsed;
}

export function clearKioskStorage(
  storage: KioskStorage,
  draftKey: string,
  pendingKey: string,
): void {
  clearKioskDraft(storage, draftKey);
  storage.removeItem(pendingKey);
}

export function clearKioskDraft(storage: KioskStorage, draftKey: string): void {
  storage.removeItem(draftKey);
}
