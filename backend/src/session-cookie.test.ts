import { describe, expect, test } from "bun:test";
import { sessionCookieAttributes } from "./session-cookie";

describe("session cookie attributes", () => {
  test("keeps the strict same-site policy for native and same-site callers", () => {
    const nativeRequest = new Request("https://api.example.test/api/auth/login");
    const sameSiteRequest = new Request("http://localhost:3000/api/auth/login", {
      headers: {Origin: "http://localhost:59459"},
    });

    expect(sessionCookieAttributes(nativeRequest, true)).toBe(
      "; Path=/; HttpOnly; SameSite=Strict; Secure",
    );
    expect(sessionCookieAttributes(sameSiteRequest, false)).toBe(
      "; Path=/; HttpOnly; SameSite=Strict",
    );
  });

  test("uses secure cross-site cookies only for a browser origin", () => {
    const request = new Request("https://api.example.test/api/auth/login", {
      headers: {Origin: "http://localhost:59459"},
    });

    expect(sessionCookieAttributes(request, true)).toBe(
      "; Path=/; HttpOnly; SameSite=None; Secure",
    );
    expect(sessionCookieAttributes(request, false)).toBe(
      "; Path=/; HttpOnly; SameSite=None; Secure",
    );
  });
});
