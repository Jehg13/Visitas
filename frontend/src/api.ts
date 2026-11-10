const retryableServiceStatuses = new Set([502, 503, 504]);
const maxReadAttempts = 3;

function getRequestMethod(
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 250 * 2 ** attempt);
  });
}

export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string" && input.startsWith("/api/")
      ? `/api/v1/${input.slice("/api/".length)}`
      : input;
  const retrySafe = ["GET", "HEAD"].includes(getRequestMethod(input, init));
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);

  return sendRequest();

  async function sendRequest(): Promise<Response> {
    for (let attempt = 0; attempt < maxReadAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await globalThis.fetch(url, init);
      } catch (error) {
        if (
          !retrySafe ||
          !(error instanceof TypeError) ||
          signal?.aborted ||
          attempt >= maxReadAttempts - 1
        ) {
          throw error;
        }
        await retryDelay(attempt);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        continue;
      }

      if (
        retrySafe &&
        retryableServiceStatuses.has(response.status) &&
        attempt < maxReadAttempts - 1
      ) {
        await retryDelay(attempt);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        continue;
      }
      return response;
    }

    throw new Error("Request retry loop ended unexpectedly.");
  }
}

export function apiEventSource(path: string): EventSource {
  const versionedPath = path.startsWith("/api/")
    ? `/api/v1/${path.slice("/api/".length)}`
    : path;
  return new EventSource(versionedPath);
}
