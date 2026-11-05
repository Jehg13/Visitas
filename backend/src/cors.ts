const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const allowedHeaders = new Set(["content-type", "authorization", "x-requested-with"]);
const localOriginPatterns = new Set([
  "http://localhost:*",
  "http://127.0.0.1:*",
]);

export function isSupportedLocalOriginPattern(origin: string) {
  return localOriginPatterns.has(origin);
}

function matchesLocalOriginPattern(
  origin: string,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (![...allowedOrigins].some(isSupportedLocalOriginPattern)) return false;
  try {
    const parsedOrigin = new URL(origin);
    if (
      parsedOrigin.origin !== origin ||
      parsedOrigin.protocol !== "http:" ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      !parsedOrigin.port
    ) {
      return false;
    }
    return (
      (parsedOrigin.hostname === "localhost" && allowedOrigins.has("http://localhost:*")) ||
      (parsedOrigin.hostname === "127.0.0.1" && allowedOrigins.has("http://127.0.0.1:*"))
    );
  } catch {
    return false;
  }
}

export function resolveCorsOrigin(
  origin: string | null,
  requestUrl: URL,
  allowedOrigins: ReadonlySet<string>,
  allowLocalhostWildcard = false,
): string | null {
  if (!origin || origin === requestUrl.origin) return null;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin) return null;
  } catch {
    return null;
  }
  return allowedOrigins.has(origin) ||
      (allowLocalhostWildcard && matchesLocalOriginPattern(origin, allowedOrigins))
    ? origin
    : null;
}

export function createCorsPreflightResponse(
  request: Request,
  allowedOrigin: string | null,
): Response {
  if (!allowedOrigin) {
    return Response.json({ error: "El origen de la solicitud no está permitido." }, {
      status: 403,
    });
  }

  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  if (!requestedMethod || !allowedMethods.has(requestedMethod)) {
    return Response.json({ error: "El método solicitado no está permitido." }, {
      status: 405,
    });
  }

  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => !allowedHeaders.has(header))) {
    return Response.json({ error: "Los encabezados solicitados no están permitidos." }, {
      status: 403,
    });
  }

  const headers = new Headers({
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": [...allowedMethods].join(", "),
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (requestedHeaders.length > 0) {
    headers.set("Access-Control-Allow-Headers", requestedHeaders.join(", "));
  }
  return new Response(null, {
    status: 204,
    headers,
  });
}

export function addCorsHeaders(response: Response, allowedOrigin: string | null): Response {
  if (!allowedOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  const vary = headers.get("Vary");
  headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function isAllowedRequestOrigin(
  origin: string | null,
  requestUrl: URL,
  allowedOrigins: ReadonlySet<string>,
  allowLocalhostWildcard = false,
): boolean {
  return !origin ||
    origin === requestUrl.origin ||
    resolveCorsOrigin(origin, requestUrl, allowedOrigins, allowLocalhostWildcard) !== null;
}

export function isAllowedCorsMethod(method: string | null): boolean {
  return method !== null && allowedMethods.has(method.toUpperCase());
}
