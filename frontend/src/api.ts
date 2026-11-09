export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === "string" && input.startsWith("/api/")) {
    const versionedUrl = `/api/v1/${input.slice("/api/".length)}`;
    return globalThis.fetch(versionedUrl, init);
  }

  return globalThis.fetch(input, init);
}

export function apiEventSource(path: string): EventSource {
  const versionedPath = path.startsWith("/api/")
    ? `/api/v1/${path.slice("/api/".length)}`
    : path;
  return new EventSource(versionedPath);
}
