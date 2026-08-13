import { describe, expect, it } from "vitest";
import {
  merchantActivityEventEndpoint,
  serializeMerchantActivitySourcePackage,
} from "./activity-source-provisioning";

describe("Merchant Activity source provisioning", () => {
  it("derives only the canonical public endpoint", () => {
    expect(
      merchantActivityEventEndpoint("https://loyalty.starfiniti.com"),
    ).toBe("https://loyalty.starfiniti.com/api/v1/activities/events");
    expect(() =>
      merchantActivityEventEndpoint("http://localhost:3000"),
    ).toThrow("dashboard_public_origin_invalid");
  });

  it("serializes the exact one-time package without its secret reference", () => {
    const value = serializeMerchantActivitySourcePackage({
      version: "1",
      endpoint: "https://loyalty.starfiniti.com/api/v1/activities/events",
      sourceId: "10000000-0000-4000-8000-000000000001",
      keyVersion: "v1",
      signingKey: Buffer.alloc(32, 9).toString("base64"),
    });
    expect(Object.keys(JSON.parse(value))).toEqual([
      "version",
      "endpoint",
      "sourceId",
      "keyVersion",
      "signingKey",
    ]);
    expect(value).not.toContain("signing_material_ref");
  });
});
