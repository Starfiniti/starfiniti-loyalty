import type { ExperienceLocaleV1 } from "@starfiniti/contracts";

export function isPublicId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

export function resolvePublicLocale(value: unknown): ExperienceLocaleV1 {
  return value === "sl-SI" ? "sl-SI" : "en";
}

export function formatPublicPoints(
  value: string,
  locale: ExperienceLocaleV1,
): string {
  return new Intl.NumberFormat(locale).format(BigInt(value));
}

export function formatEurMinor(
  value: string,
  locale: ExperienceLocaleV1,
): string {
  const minor = BigInt(value);
  const major = minor / 100n;
  const cents = (minor % 100n).toString().padStart(2, "0");
  const majorText = new Intl.NumberFormat(locale).format(major);
  return `€${majorText}${cents === "00" ? "" : `${locale === "sl-SI" ? "," : "."}${cents}`}`;
}
