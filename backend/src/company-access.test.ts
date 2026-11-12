import { describe, expect, test } from "bun:test";
import { canCompanyAccountAccessApi } from "./company-access";

describe("company account API boundaries", () => {
  test("allows company roles only the explicitly scoped operational APIs", () => {
    for (const isCompanyAdmin of [false, true]) {
      expect(canCompanyAccountAccessApi(isCompanyAdmin, "GET", "/api/appointments")).toBe(true);
      expect(canCompanyAccountAccessApi(isCompanyAdmin, "GET", "/api/daily-log")).toBe(true);
      expect(canCompanyAccountAccessApi(isCompanyAdmin, "GET", "/api/business-partners")).toBe(true);
      expect(canCompanyAccountAccessApi(isCompanyAdmin, "GET", "/api/visitor-kiosk/settings")).toBe(false);
      expect(canCompanyAccountAccessApi(isCompanyAdmin, "GET", "/api/app/releases")).toBe(false);
    }
  });

  test("allows company administrators only company configuration and user management APIs", () => {
    expect(canCompanyAccountAccessApi(true, "GET", "/api/companies")).toBe(true);
    expect(canCompanyAccountAccessApi(true, "PATCH", "/api/departments/4")).toBe(true);
    expect(canCompanyAccountAccessApi(true, "POST", "/api/company-users")).toBe(true);
    expect(canCompanyAccountAccessApi(true, "GET", "/api/department-hosts")).toBe(true);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/companies")).toBe(false);
  });

  test("limits company reception to the agenda and daily-log workflows", () => {
    const role = "recepcion";
    expect(canCompanyAccountAccessApi(false, "GET", "/api/appointments", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/daily-log", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "POST", "/api/daily-log", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/departments", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/business-partners", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "POST", "/api/appointments/12/send-qr", role)).toBe(true);
    expect(canCompanyAccountAccessApi(false, "PATCH", "/api/business-partners/4", role)).toBe(false);
    expect(canCompanyAccountAccessApi(false, "POST", "/api/appointments", role)).toBe(false);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/equipment/declarations", role)).toBe(false);
    expect(canCompanyAccountAccessApi(false, "GET", "/api/company-users", role)).toBe(false);
  });

  test("keeps company host operational access separate from reception", () => {
    expect(canCompanyAccountAccessApi(false, "GET", "/api/business-partners", "anfitrion")).toBe(true);
    expect(canCompanyAccountAccessApi(false, "PATCH", "/api/business-partners/4", "anfitrion")).toBe(true);
  });

  test("allows a signed-in company account to change its temporary password", () => {
    expect(canCompanyAccountAccessApi(false, "POST", "/api/auth/change-password")).toBe(true);
  });
});
