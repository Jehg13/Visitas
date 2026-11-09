import { describe, expect, it } from "bun:test";
import { normalizeApiPath } from "./api-version";

describe("normalizeApiPath", () => {
  it("maps v1 API paths to the current handlers", () => {
    expect(normalizeApiPath("/api/v1/appointments")).toBe("/api/appointments");
    expect(normalizeApiPath("/api/v1/daily-log/stats")).toBe(
      "/api/daily-log/stats",
    );
    expect(normalizeApiPath("/api/v1")).toBe("/api");
  });

  it("does not rewrite legacy or unrelated paths", () => {
    expect(normalizeApiPath("/api/appointments")).toBe("/api/appointments");
    expect(normalizeApiPath("/api/v10/appointments")).toBe(
      "/api/v10/appointments",
    );
    expect(normalizeApiPath("/health")).toBe("/health");
  });
});
