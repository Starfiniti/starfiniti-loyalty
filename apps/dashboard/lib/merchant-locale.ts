import { customerLocalePath, type CustomerLocale } from "./customer-locale";

export type MerchantLocale = CustomerLocale;

export function resolveMerchantLocale(value: unknown): MerchantLocale {
  void value;
  return "en";
}

export function merchantLocalePath(
  path: string,
  locale: MerchantLocale,
): string {
  void locale;
  return customerLocalePath(path, "en");
}

export function merchantIntlLocale(locale: MerchantLocale): string {
  void locale;
  return "en-GB";
}

export function merchantText(_locale: MerchantLocale, source: string): string {
  return source;
}
