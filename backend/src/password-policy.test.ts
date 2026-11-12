import { describe, expect, test } from "bun:test";
import { isValidPassword } from "./password-policy";

describe("password policy", () => {
  test("requires eight characters, upper/lowercase, a number, and a symbol", () => {
    expect(isValidPassword("Abcdef1!")).toBe(true);
    expect(isValidPassword("Abcde1!")).toBe(false);
    expect(isValidPassword("abcdef1!")).toBe(false);
    expect(isValidPassword("ABCDEF1!")).toBe(false);
    expect(isValidPassword("Abcdefgh!")).toBe(false);
    expect(isValidPassword("Abcdef12")).toBe(false);
  });

  test("rejects passwords longer than 128 characters", () => {
    expect(isValidPassword(`Aa1!${"b".repeat(124)}`)).toBe(true);
    expect(isValidPassword(`Aa1!${"b".repeat(125)}`)).toBe(false);
  });
});
