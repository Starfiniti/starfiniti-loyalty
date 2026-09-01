import { describe, expect, it } from "vitest";
import { issueWebhookSigningSecretV1 } from "./webhook-secrets";

describe("issueWebhookSigningSecretV1", () => {
  it("issues a canonical 256-bit secret and only non-reusable evidence", () => {
    const issued = issueWebhookSigningSecretV1(new Uint8Array(32).fill(0x11));
    expect(issued).toEqual({
      secret: `whsec_${"ERERERERERERERERERERERERERERERERERERERERERE="}`,
      fingerprintSha256:
        "02d449a31fbb267c8f352e9968a79e3e5fc95c1bbeaa502fd6454ebde5a4bedc",
      hint: "RERERE",
    });
    expect(() => issueWebhookSigningSecretV1(new Uint8Array(31))).toThrow(
      "32 bytes",
    );
  });

  it("normalizes the non-reusable hint to the database-safe base64url alphabet", () => {
    const slashIssued = issueWebhookSigningSecretV1(
      new Uint8Array(32).fill(0xff),
    );
    expect(slashIssued.secret).toBe(
      `whsec_${Buffer.alloc(32, 0xff).toString("base64")}`,
    );
    expect(slashIssued.hint).toBe("_____8");

    const plusIssued = issueWebhookSigningSecretV1(
      new Uint8Array(32).fill(0xf8),
    );
    expect(plusIssued.hint).toBe("Pj4-Pg");

    for (const issued of [slashIssued, plusIssued]) {
      expect(issued.hint).toMatch(/^[A-Za-z0-9_-]{6}$/u);
    }
  });
});
