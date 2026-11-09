export const apiV1Prefix = "/api/v1";

export function normalizeApiPath(pathname: string): string {
  if (pathname === apiV1Prefix) return "/api";
  if (pathname.startsWith(`${apiV1Prefix}/`)) {
    return `/api${pathname.slice(apiV1Prefix.length)}`;
  }
  return pathname;
}
