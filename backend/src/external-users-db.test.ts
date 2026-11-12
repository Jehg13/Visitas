import { describe, expect, it } from "bun:test";
import { buildExternalUsersPoolOptions } from "./external-users-db";

const baseEnvironment = {
  DB_EXTERNAL_HOST: "db.example.test",
  DB_EXTERNAL_DATABASE: "users",
  DB_EXTERNAL_USERNAME: "application",
  DB_EXTERNAL_PASSWORD: "test-password",
};

describe("external users database TLS configuration", () => {
  it("preserves existing non-TLS environments unless TLS is enabled", () => {
    const options = buildExternalUsersPoolOptions(baseEnvironment);
    expect(options.host).toBe("db.example.test");
    expect(options.ssl).toBeUndefined();
  });

  it("enables certificate and hostname validation when TLS is requested", () => {
    const options = buildExternalUsersPoolOptions({
      ...baseEnvironment,
      DB_EXTERNAL_SSL: "true",
    });
    expect(options.ssl).toMatchObject({
      rejectUnauthorized: true,
      verifyIdentity: true,
    });
  });

  it("trusts a supplied CA without disabling certificate validation", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----";
    const options = buildExternalUsersPoolOptions({
      ...baseEnvironment,
      DB_EXTERNAL_SSL: "true",
      DB_EXTERNAL_SSL_CA: ca,
    });
    expect(options.ssl).toMatchObject({
      ca,
      rejectUnauthorized: true,
      verifyIdentity: true,
    });
  });

  it("rejects invalid TLS configuration", () => {
    expect(() =>
      buildExternalUsersPoolOptions({
        ...baseEnvironment,
        DB_EXTERNAL_SSL: "maybe",
      }),
    ).toThrow("DB_EXTERNAL_SSL must be set to true or false.");
    expect(() =>
      buildExternalUsersPoolOptions({
        ...baseEnvironment,
        DB_EXTERNAL_SSL_CA: "not a certificate",
      }),
    ).toThrow("DB_EXTERNAL_SSL_CA requires DB_EXTERNAL_SSL=true.");
    expect(() =>
      buildExternalUsersPoolOptions({
        ...baseEnvironment,
        DB_EXTERNAL_HOST: "192.0.2.10",
        DB_EXTERNAL_SSL: "true",
      }),
    ).toThrow("DB_EXTERNAL_HOST must be a DNS hostname when TLS is enabled.");
  });
});
