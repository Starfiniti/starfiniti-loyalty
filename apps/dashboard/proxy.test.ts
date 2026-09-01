import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("dashboard proxy security policy", () => {
  it("returns a distinct strict nonce policy for each document request", async () => {
    const request = () =>
      new NextRequest(
        "https://loyalty.example.test/loyalty/a1000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002",
      );
    const first = await proxy(request());
    const second = await proxy(request());
    const firstPolicy = first.headers.get("content-security-policy");
    const secondPolicy = second.headers.get("content-security-policy");

    expect(firstPolicy).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/]{48}' 'strict-dynamic'/u,
    );
    expect(firstPolicy).toContain("frame-ancestors 'none'");
    expect(firstPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(secondPolicy).not.toBe(firstPolicy);
  });
});
