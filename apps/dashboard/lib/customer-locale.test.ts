import { describe, expect, it } from "vitest";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerLocale,
  resolveCustomerNavigationLocale,
} from "./customer-locale";

describe("hosted customer locale", () => {
  it("allows only the explicit Slovenian locale", () => {
    expect(resolveCustomerLocale("sl-SI")).toBe("sl-SI");
    expect(resolveCustomerLocale("sl")).toBe("en");
    expect(resolveCustomerLocale(["sl-SI"])).toBe("en");
  });

  it("preserves Slovenian across safe local customer paths", () => {
    expect(customerLocalePath("/account/loyalty", "sl-SI")).toBe(
      "/account/loyalty?lang=sl-SI",
    );
    expect(customerLocalePath("/account/loyalty?linked=1", "sl-SI")).toBe(
      "/account/loyalty?linked=1&lang=sl-SI",
    );
    expect(customerLocalePath("/account/loyalty?lang=sl-SI", "sl-SI")).toBe(
      "/account/loyalty?lang=sl-SI",
    );
    expect(customerLocalePath("/account/loyalty", "en")).toBe(
      "/account/loyalty",
    );
  });

  it("recovers locale from only a safe local login continuation", () => {
    expect(
      resolveCustomerNavigationLocale(undefined, "/account/loyalty?lang=sl-SI"),
    ).toBe("sl-SI");
    expect(
      resolveCustomerNavigationLocale(undefined, "//evil.test/?lang=sl-SI"),
    ).toBe("en");
    expect(
      resolveCustomerNavigationLocale(undefined, "/account\\?lang=sl-SI"),
    ).toBe("en");
  });

  it("contains distinct complete launch-locale copy", () => {
    expect(Object.keys(CUSTOMER_COPY.en)).toEqual(
      Object.keys(CUSTOMER_COPY["sl-SI"]),
    );
    expect(CUSTOMER_COPY.en.signIn).not.toBe(CUSTOMER_COPY["sl-SI"].signIn);
  });
});
