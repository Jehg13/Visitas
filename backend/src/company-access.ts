export function canCompanyAccountAccessApi(
  isCompanyAdmin: boolean,
  method: string,
  pathname: string,
) {
  if (method === "POST" && pathname === "/api/auth/change-password") return true;
  if (
    ["GET", "POST", "PATCH", "DELETE"].includes(method) &&
    /^\/api\/(companies|departments|company-users)(?:\/\d+|\/[^/]+)?$/.test(pathname)
  ) return isCompanyAdmin;
  if (method === "GET" && ["/api/company-metrics", "/api/department-hosts"].includes(pathname)) {
    return isCompanyAdmin;
  }
  if (
    ["GET", "POST", "PATCH", "DELETE"].includes(method) &&
    /^\/api\/(business-partners|general-visitors|external-staff)(?:\/\d+)?$/.test(pathname)
  ) return true;
  if (["GET", "POST"].includes(method) && pathname === "/api/host-visitors") return true;
  if (["GET", "POST", "PATCH", "DELETE"].includes(method) &&
    /^\/api\/appointments(?:\/\d+)?$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/appointments\/\d+\/send-qr$/.test(pathname)) return true;
  if (method === "GET" && pathname === "/api/appointments/history") return true;
  if (method === "GET" && pathname === "/api/daily-log/stats") return true;
  if (["GET", "POST", "DELETE"].includes(method) && /^\/api\/daily-log(?:\/\d+)?$/.test(pathname)) return true;
  if (method === "GET" && pathname === "/api/daily-log/timers") return true;
  if (method === "POST" && /^\/api\/daily-log\/timers\/\d+$/.test(pathname)) return true;
  if (
    ["GET", "POST", "PUT", "DELETE"].includes(method) &&
    /^\/api\/equipment\/declarations(?:\/\d+(?:\/(?:link|revoke|inspections\/(?:entrada|salida)))?)?$/.test(pathname)
  ) return true;
  if (method === "GET" && pathname === "/api/equipment/options") return true;
  return false;
}
