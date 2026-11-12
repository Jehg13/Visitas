export function canCompanyAccountAccessApi(
  isCompanyAdmin: boolean,
  method: string,
  pathname: string,
  companyRole?: "administrador_empresa" | "recepcion" | "anfitrion" | "sin_acceso" | null,
) {
  if (method === "POST" && pathname === "/api/auth/change-password") return true;
  if (!isCompanyAdmin && companyRole === "recepcion") {
    if (
      method === "GET" &&
      [
        "/api/departments",
        "/api/department-hosts",
        "/api/business-partners",
        "/api/general-visitors",
        "/api/external-staff",
        "/api/appointments",
        "/api/appointments/history",
        "/api/daily-log",
        "/api/daily-log/stats",
        "/api/daily-log/timers",
        "/api/events",
      ].includes(pathname)
    ) return true;
    if (method === "GET" && /^\/api\/appointments\/\d+\/employees$/.test(pathname)) return true;
    if (method === "POST" && pathname === "/api/daily-log") return true;
    if (method === "POST" && /^\/api\/daily-log\/timers\/\d+$/.test(pathname)) return true;
    if (method === "POST" && /^\/api\/appointments\/\d+\/send-qr$/.test(pathname)) return true;
    return false;
  }
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
