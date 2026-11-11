export const apiV1Prefix = "/api/v1";
export const apiV2Prefix = "/api/v2";

export type ApiVersion = 1 | 2 | null;

export function getApiVersion(pathname: string): ApiVersion {
  if (pathname === apiV1Prefix || pathname.startsWith(`${apiV1Prefix}/`)) return 1;
  if (pathname === apiV2Prefix || pathname.startsWith(`${apiV2Prefix}/`)) return 2;
  return null;
}

export function normalizeApiPath(pathname: string): string {
  for (const prefix of [apiV1Prefix, apiV2Prefix]) {
    if (pathname === prefix) return "/api";
    if (pathname.startsWith(`${prefix}/`)) {
      return `/api${pathname.slice(prefix.length)}`;
    }
  }
  return pathname;
}
