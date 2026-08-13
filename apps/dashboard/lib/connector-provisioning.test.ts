import { describe, expect, it } from "vitest";
import {
  serializeWooCommerceConnectionPackage,
  wooCommerceEventEndpoint,
} from "./connector-provisioning";

describe("WooCommerce connector provisioning", () => {
  it("derives only the canonical HTTPS event endpoint", () => {
    expect(wooCommerceEventEndpoint("https://loyalty.example.test")).toBe(
      "https://loyalty.example.test/api/v1/integrations/woocommerce/events",
    );
    for (const origin of [
      "http://loyalty.example.test",
      "https://loyalty.example.test/path",
      "https://user:pass@loyalty.example.test",
    ]) {
      expect(() => wooCommerceEventEndpoint(origin)).toThrow(
        "dashboard_public_origin_invalid",
      );
    }
  });

  it("serializes an exact package without internal signing references", () => {
    const serialized = serializeWooCommerceConnectionPackage({
      version: "1",
      endpoint:
        "https://loyalty.example.test/api/v1/integrations/woocommerce/events",
      connectionId: "5abf9309-a530-489f-a63f-51130c4fc024",
      keyVersion: "v1",
      signingKey: Buffer.alloc(32, 9).toString("base64"),
    });
    expect(JSON.parse(serialized)).toEqual({
      version: "1",
      endpoint:
        "https://loyalty.example.test/api/v1/integrations/woocommerce/events",
      connectionId: "5abf9309-a530-489f-a63f-51130c4fc024",
      keyVersion: "v1",
      signingKey: Buffer.alloc(32, 9).toString("base64"),
    });
    expect(serialized).not.toContain("signing_material_ref");
  });
});
