import { describe, expect, it } from "vitest";
import {
  assertAuthConfiguration,
  clearSessionCookie,
  constantTimeBytesEqual,
  createSessionToken,
  sessionCookie,
  verifyAccessCode,
  verifySessionToken,
} from "./auth";
import type { Env } from "./env";

describe("authentication helpers", () => {
  it("rejects an ACCESS_CODE shorter than 20 characters", () => {
    const validConfiguration = {
      ACCESS_CODE: "a".repeat(20),
      SESSION_SECRET: "s".repeat(32),
    } as Env;
    expect(() => assertAuthConfiguration(validConfiguration)).not.toThrow();
    expect(() =>
      assertAuthConfiguration({ ...validConfiguration, ACCESS_CODE: "a".repeat(19) }),
    ).toThrowError(/20文字以上/u);
  });

  it("compares access codes after fixed-length hashing, including Japanese text", async () => {
    await expect(verifyAccessCode("駐車場-1234", "駐車場-1234")).resolves.toBe(true);
    await expect(verifyAccessCode("駐車場-1234", "駐車場-1235")).resolves.toBe(false);
  });

  it("compares equal-length byte arrays without returning early", () => {
    expect(constantTimeBytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeBytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 9, 3]))).toBe(false);
    expect(constantTimeBytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });

  it("signs, verifies, detects tampering, and expires session tokens", async () => {
    const secret = "a-secure-session-secret-that-is-long-enough";
    const token = await createSessionToken(secret, 100, 1_000);
    await expect(verifySessionToken(token, secret, 100, 1_050)).resolves.toBe(true);
    await expect(verifySessionToken(token, secret, 100, 1_100)).resolves.toBe(false);

    const [payload, signature] = token.split(".");
    const replacement = signature[0] === "A" ? "B" : "A";
    const tampered = `${payload}.${replacement}${signature.slice(1)}`;
    await expect(verifySessionToken(tampered, secret, 100, 1_050)).resolves.toBe(false);
    await expect(verifySessionToken(token, `${secret}!`, 100, 1_050)).resolves.toBe(false);
  });

  it("sets and clears a strict secure HttpOnly host cookie", () => {
    const created = sessionCookie("token", 123);
    expect(created).toContain("__Host-home-parking-hub-session=token");
    expect(created).toContain("Max-Age=123");
    expect(created).toContain("HttpOnly");
    expect(created).toContain("Secure");
    expect(created).toContain("SameSite=Strict");
    expect(created).toContain("Path=/");

    const cleared = clearSessionCookie();
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("uses a separate non-secure cookie only for local HTTP development", () => {
    const created = sessionCookie("token", 123, false);
    expect(created).toContain("home-parking-hub-local-session=token");
    expect(created).toContain("HttpOnly");
    expect(created).toContain("SameSite=Strict");
    expect(created).not.toContain("Secure");
    expect(created).not.toContain("__Host-");

    const cleared = clearSessionCookie(false);
    expect(cleared).toContain("home-parking-hub-local-session=");
    expect(cleared).toContain("Max-Age=0");
  });
});
