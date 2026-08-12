import { describe, expect, it } from "vitest";
import {
  customerDataExportFilename,
  customerDataExportHeaders,
  customerExportPath,
  customerExportReauthenticationPath,
  isSupabaseSessionId,
} from "./customer-export";

describe("customer export navigation", () => {
  it("keeps English on the canonical export route", () => {
    expect(customerExportPath("en")).toBe("/account/loyalty/export");
    expect(customerExportReauthenticationPath("en")).toBe(
      "/login?reauth=customer-export&next=%2Faccount%2Floyalty%2Fexport",
    );
  });

  it("preserves Slovenian only in the safe local target", () => {
    const path = customerExportReauthenticationPath("sl-SI");
    expect(path).toContain("reauth=customer-export");
    expect(path).toContain("next=%2Faccount%2Floyalty%2Fexport%3Flang%3Dsl-SI");
    expect(path).toContain("lang=sl-SI");
  });

  it("creates a bounded content-disposition filename", () => {
    expect(customerDataExportFilename("2026-08-12T18:30:00+00:00")).toBe(
      "starfiniti-loyalty-data-2026-08-12.json",
    );
    expect(customerDataExportFilename("unsafe")).toBe(
      "starfiniti-loyalty-data.json",
    );
  });

  it("forces a private one-purpose download response", () => {
    const headers = customerDataExportHeaders("2026-08-12T18:30:00+00:00");
    expect(headers["Cache-Control"]).toBe("private, no-store");
    expect(headers["Content-Disposition"]).toBe(
      'attachment; filename="starfiniti-loyalty-data-2026-08-12.json"',
    );
    expect(headers["Content-Security-Policy"]).toContain("sandbox");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("accepts only canonical Supabase session UUIDs", () => {
    expect(isSupabaseSessionId("a5000000-0000-4000-8000-000000000201")).toBe(
      true,
    );
    expect(isSupabaseSessionId("../other-session")).toBe(false);
    expect(isSupabaseSessionId(null)).toBe(false);
  });
});
