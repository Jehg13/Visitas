import { describe, expect, it } from "bun:test";
import {
  generateTabletPairingCode,
  handleTabletPairingRequest,
  hashTabletPairingCode,
} from "./tablet-pairing";

describe("tablet pairing codes", () => {
  it("generates a ten-character code formatted for manual entry", () => {
    const code = generateTabletPairingCode();

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it("hashes codes consistently regardless of formatting or letter case", () => {
    expect(hashTabletPairingCode("abcde-fghjk"))
      .toBe(hashTabletPairingCode("ABCDEFGHJK"));
    expect(hashTabletPairingCode("abcde-fghjk"))
      .toMatch(/^[a-f\d]{64}$/);
  });

  it("rejects malformed pairing attempts before touching stored codes", async () => {
    const request = new Request(
      "https://example.test/api/tablet-pairing-codes/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "not-a-code",
          deviceToken: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
        }),
      },
    );
    const response = await handleTabletPairingRequest(
      request,
      new URL(request.url),
      async () => null,
      "pairing-test-address",
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error: "El código no es válido, venció o ya fue utilizado.",
    });
  });

  it("restricts pairing-code management to global administrators", async () => {
    const request = new Request("https://example.test/api/tablet-pairing-codes");
    const url = new URL(request.url);
    const deleteRequest = new Request(
      "https://example.test/api/tablet-pairing-codes/12",
      { method: "DELETE" },
    );
    const revokeRequest = new Request(
      "https://example.test/api/tablet-pairing-codes/12/revoke",
      { method: "POST" },
    );
    const deniedUsers = [
      null,
      {
        login: "company-admin",
        name: "Company admin",
        email: null,
        role: null,
        isAdmin: false,
        isCompanyAdmin: true,
        companyId: 7,
        companyRole: "administrador_empresa" as const,
        mustChangePassword: false,
        sessionKey: "session-key",
      },
    ];

    for (const user of deniedUsers) {
      const response = await handleTabletPairingRequest(
        request,
        url,
        async () => user,
      );
      expect(response?.status).toBe(403);
    }

    for (const deniedRequest of [deleteRequest, revokeRequest]) {
      const response = await handleTabletPairingRequest(
        deniedRequest,
        new URL(deniedRequest.url),
        async () => null,
      );
      expect(response?.status).toBe(403);
    }
  });
});
