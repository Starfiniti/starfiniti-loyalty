import { describe, expect, it } from "vitest";
import {
  API_CONTENT_SECURITY_POLICY,
  BASE_SECURITY_HEADERS,
  contentSecurityPolicy,
} from "./security-headers";

const nonce = "MjQ3MmQzZTktZWUzZS00MzA3LWI2NjYtNzRjZmJjZTE4NWRm";

describe("dashboard security headers", () => {
  it("builds a strict request-bound script policy", () => {
    const policy = contentSecurityPolicy(nonce);

    expect(policy).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toMatch(/https?:|wss?:|\*/u);
  });

  it("rejects attacker-controlled or unbounded nonces", () => {
    expect(() => contentSecurityPolicy("short")).toThrow(/nonce/u);
    expect(() =>
      contentSecurityPolicy(`${nonce}'; script-src https://evil.test`),
    ).toThrow(/nonce/u);
    expect(() => contentSecurityPolicy("a".repeat(129))).toThrow(/nonce/u);
  });

  it("denies framing and MIME sniffing on every response", () => {
    expect(BASE_SECURITY_HEADERS).toContainEqual({
      key: "X-Frame-Options",
      value: "DENY",
    });
    expect(BASE_SECURITY_HEADERS).toContainEqual({
      key: "X-Content-Type-Options",
      value: "nosniff",
    });
    expect(API_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
    );
  });
});
