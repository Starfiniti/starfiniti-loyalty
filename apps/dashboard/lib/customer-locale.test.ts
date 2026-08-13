import { describe, expect, it } from "vitest";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerLocale,
  resolveCustomerNavigationLocale,
} from "./customer-locale";

describe("English-only hosted customer presentation", () => {
  it("ignores legacy and unsupported locale selectors", () => {
    expect(resolveCustomerLocale("en")).toBe("en");
    expect(resolveCustomerLocale("sl-SI")).toBe("en");
    expect(resolveCustomerLocale(["sl-SI"])).toBe("en");
  });

  it("canonicalizes safe local paths without a language parameter", () => {
    expect(customerLocalePath("/account/loyalty", "en")).toBe(
      "/account/loyalty",
    );
    expect(
      customerLocalePath("/account/loyalty?linked=1&lang=sl-SI", "sl-SI"),
    ).toBe("/account/loyalty?linked=1");
  });

  it("does not recover a language from login continuations", () => {
    expect(
      resolveCustomerNavigationLocale(undefined, "/account/loyalty?lang=sl-SI"),
    ).toBe("en");
    expect(resolveCustomerNavigationLocale("sl-SI", "/")).toBe("en");
  });

  it("retains complete English customer copy", () => {
    expect(CUSTOMER_COPY.en.signInTitle).toBeTruthy();
    expect(CUSTOMER_COPY.en.accountTitle).toBeTruthy();
  });
});
