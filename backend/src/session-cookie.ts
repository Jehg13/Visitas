export function sessionCookieAttributes(
  request: Request,
  isProduction: boolean,
): string {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  let crossSite = false;
  if (origin) {
    try {
      crossSite = new URL(origin).hostname !== requestUrl.hostname;
    } catch {
      crossSite = true;
    }
  }
  const sameSite = crossSite ? "None" : "Strict";
  const secure = isProduction || sameSite === "None";
  return `; Path=/; HttpOnly; SameSite=${sameSite}${secure ? "; Secure" : ""}`;
}
