import { describe, expect, it } from "bun:test";
import { getApiVersion, normalizeApiPath } from "./api-version";
import { handleApiV2Request } from "./api-v2";

describe("normalizeApiPath", () => {
  it("maps v1 API paths to the current handlers", () => {
    expect(normalizeApiPath("/api/v1/appointments")).toBe("/api/appointments");
    expect(normalizeApiPath("/api/v1/daily-log/stats")).toBe(
      "/api/daily-log/stats",
    );
    expect(normalizeApiPath("/api/v1")).toBe("/api");
  });

  it("maps v2 API paths while preserving the legacy v1 contract", () => {
    expect(normalizeApiPath("/api/v2/appointments")).toBe("/api/appointments");
    expect(normalizeApiPath("/api/v2/daily-log/stats")).toBe(
      "/api/daily-log/stats",
    );
    expect(normalizeApiPath("/api/v2")).toBe("/api");
    expect(normalizeApiPath("/api/v1/appointments")).toBe("/api/appointments");
  });

  it("does not rewrite legacy or unrelated paths", () => {
    expect(normalizeApiPath("/api/appointments")).toBe("/api/appointments");
    expect(normalizeApiPath("/api/v10/appointments")).toBe(
      "/api/v10/appointments",
    );
    expect(normalizeApiPath("/health")).toBe("/health");
  });
});

describe("API version dispatch", () => {
  it("identifies only the supported version prefixes", () => {
    expect(getApiVersion("/api/v1/appointments")).toBe(1);
    expect(getApiVersion("/api/v2/appointments")).toBe(2);
    expect(getApiVersion("/api/appointments")).toBeNull();
    expect(getApiVersion("/api/v20/appointments")).toBeNull();
  });

  it("handles v2-only routes without consuming shared routes", async () => {
    const versionResponse = await handleApiV2Request(
      new Request("https://example.test/api/v2/version"),
      new URL("https://example.test/api/version"),
    );
    expect(versionResponse?.status).toBe(200);
    expect(await versionResponse?.json()).toEqual({ version: 2 });

    const sharedRouteResponse = await handleApiV2Request(
      new Request("https://example.test/api/v2/appointments"),
      new URL("https://example.test/api/appointments"),
    );
    expect(sharedRouteResponse).toBeNull();
  });
});
