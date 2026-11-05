import { describe, expect, test } from "bun:test";
import {
  addCorsHeaders,
  createCorsPreflightResponse,
  isAllowedRequestOrigin,
  resolveCorsOrigin,
} from "./cors";

const requestUrl = new URL("https://api.example.test/api/auth/login");
const allowedOrigins = new Set(["http://localhost:59459"]);

describe("CORS session support", () => {
  test("allows only exact configured origins", () => {
    expect(
      resolveCorsOrigin("http://localhost:59459", requestUrl, allowedOrigins),
    ).toBe("http://localhost:59459");
    expect(
      resolveCorsOrigin("http://localhost:59460", requestUrl, allowedOrigins),
    ).toBeNull();
    expect(
      resolveCorsOrigin("http://localhost:59459/path", requestUrl, allowedOrigins),
    ).toBeNull();
  });

  test("allows variable localhost ports only when the development pattern is enabled", () => {
    const developmentOrigins = new Set(["http://localhost:*", "http://127.0.0.1:*"]);

    expect(
      resolveCorsOrigin("http://localhost:5175", requestUrl, developmentOrigins, true),
    ).toBe("http://localhost:5175");
    expect(
      resolveCorsOrigin("http://127.0.0.1:61000", requestUrl, developmentOrigins, true),
    ).toBe("http://127.0.0.1:61000");
    expect(
      resolveCorsOrigin("http://localhost:5175", requestUrl, developmentOrigins),
    ).toBeNull();
    expect(
      resolveCorsOrigin("https://localhost:5175", requestUrl, developmentOrigins, true),
    ).toBeNull();
    expect(
      resolveCorsOrigin("http://localhost.attacker.test:5175", requestUrl, developmentOrigins, true),
    ).toBeNull();
  });

  test("permits same-origin and origin-less native requests", () => {
    expect(
      isAllowedRequestOrigin("https://api.example.test", requestUrl, allowedOrigins),
    ).toBe(true);
    expect(isAllowedRequestOrigin(null, requestUrl, allowedOrigins)).toBe(true);
    expect(
      isAllowedRequestOrigin("https://untrusted.example", requestUrl, allowedOrigins),
    ).toBe(false);
  });

  test("handles credentialed JSON preflight requests", async () => {
    const request = new Request(requestUrl, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:59459",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const response = createCorsPreflightResponse(request, "http://localhost:59459");

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:59459",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("content-type");
    expect(await response.text()).toBe("");
  });

  test("rejects unapproved methods and request headers", () => {
    const methodRequest = new Request(requestUrl, {
      method: "OPTIONS",
      headers: {"Access-Control-Request-Method": "TRACE"},
    });
    expect(
      createCorsPreflightResponse(methodRequest, "http://localhost:59459").status,
    ).toBe(405);

    const headerRequest = new Request(requestUrl, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-untrusted",
      },
    });
    expect(
      createCorsPreflightResponse(headerRequest, "http://localhost:59459").status,
    ).toBe(403);
  });

  test("preserves response headers while adding credentialed CORS headers", () => {
    const response = addCorsHeaders(
      new Response("ok", {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": "visitas_session=token; HttpOnly",
        },
      }),
      "http://localhost:59459",
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toBe(
      "visitas_session=token; HttpOnly",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});
