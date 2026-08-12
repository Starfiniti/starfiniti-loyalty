import { describe, expect, it } from "vitest";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  merchantTranslationEntries,
  resolveMerchantLocale,
} from "./merchant-locale";

describe("merchant locale", () => {
  it("allows only the explicit launch locales", () => {
    expect(resolveMerchantLocale("sl-SI")).toBe("sl-SI");
    expect(resolveMerchantLocale("sl")).toBe("en");
    expect(resolveMerchantLocale(["sl-SI"])).toBe("en");
  });

  it("preserves Slovenian on merchant navigation", () => {
    expect(merchantLocalePath("/programme", "sl-SI")).toBe(
      "/programme?lang=sl-SI",
    );
    expect(merchantLocalePath("/?range=90", "sl-SI")).toBe(
      "/?range=90&lang=sl-SI",
    );
    expect(merchantLocalePath("/operations", "en")).toBe("/operations");
  });

  it("uses the matching Intl locale and safe English fallback", () => {
    expect(merchantIntlLocale("sl-SI")).toBe("sl-SI");
    expect(merchantIntlLocale("en")).toBe("en-GB");
    expect(merchantText("sl-SI", "Overview")).toBe("Pregled");
    expect(merchantText("en", "Overview")).toBe("Overview");
    expect(merchantText("sl-SI", "Tenant supplied name")).toBe(
      "Tenant supplied name",
    );
  });

  it("contains bounded control-free Slovenian shell copy", () => {
    const entries = merchantTranslationEntries();
    expect(entries.length).toBeGreaterThan(40);
    expect(new Set(entries.map(([source]) => source)).size).toBe(
      entries.length,
    );
    for (const [source, translated] of entries) {
      expect(source.length).toBeGreaterThan(0);
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toMatch(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u,
      );
    }
  });
});
