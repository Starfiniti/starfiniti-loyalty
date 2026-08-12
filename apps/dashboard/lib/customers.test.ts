import { describe, expect, it } from "vitest";
import {
  escapePostgrestLike,
  formatPointText,
  isUuid,
  pointTextIsCredit,
  maskExternalCustomerId,
  normalizeCustomerSearch,
  parseAdjustmentPoints,
  previewAvailablePoints,
  summarizeWalletBuckets,
} from "./customers";

describe("customer read model helpers", () => {
  it("bounds and removes control characters from customer search", () => {
    expect(normalizeCustomerSearch("  Nina\u0000 Rozman  ")).toBe(
      "Nina Rozman",
    );
    expect(normalizeCustomerSearch("x".repeat(150))).toHaveLength(100);
    expect(normalizeCustomerSearch(null)).toBe("");
  });

  it("escapes PostgREST wildcard input", () => {
    expect(escapePostgrestLike("50%_club\\member")).toBe(
      "50\\%\\_club\\\\member",
    );
  });

  it("builds all wallet buckets without inventing missing balances", () => {
    expect(
      summarizeWalletBuckets([
        { account_kind: "available", points: "125" },
        { account_kind: "pending", points: "75" },
        { account_kind: "available", points: "-25" },
      ]),
    ).toEqual({
      pending: "75",
      available: "100",
      reserved: "0",
      spent: "0",
      expired: "0",
      reversed: "0",
    });
  });

  it("formats and compares point values beyond JavaScript safe integers", () => {
    expect(formatPointText("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(pointTextIsCredit("9007199254740993")).toBe(true);
    expect(pointTextIsCredit("-1")).toBe(false);
    expect(() => formatPointText("1.5")).toThrow("invalid_point_value");
  });

  it("masks channel identifiers while retaining a support suffix", () => {
    expect(maskExternalCustomerId("woocommerce-123456")).toBe("••••3456");
    expect(maskExternalCustomerId("123")).toBe("••••");
  });

  it("accepts only structured UUID resource identifiers", () => {
    expect(isUuid("71000000-0000-4000-8000-000000000101")).toBe(true);
    expect(isUuid("../another-tenant")).toBe(false);
    expect(isUuid("71000000-0000-0000-0000-000000000101")).toBe(false);
  });

  it("previews signed adjustments without floating point loss", () => {
    expect(parseAdjustmentPoints("-250")).toBe(-250n);
    expect(parseAdjustmentPoints("0")).toBeNull();
    expect(parseAdjustmentPoints("1.5")).toBeNull();
    expect(previewAvailablePoints("9007199254740993", "250")).toBe(
      9007199254741243n,
    );
  });
});
