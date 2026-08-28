import type {
  ExperienceLocaleV1,
  PublicVipQualificationThresholdV1,
  TierQualificationPeriodV2,
} from "@starfiniti/contracts";

export const PUBLIC_LOYALTY_ACCOUNT_PATH =
  "/login?next=%2Faccount%2Floyalty" as const;

export function isPublicId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

export function resolvePublicLocale(value: unknown): "en" {
  void value;
  return "en";
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

export function formatPublicVipThreshold(
  threshold: PublicVipQualificationThresholdV1,
  locale: ExperienceLocaleV1,
): string {
  if (threshold.metric === "eligible_spend") {
    return `Spend ${formatEurMinor(threshold.minimum, locale)}`;
  }
  const amount = formatPublicPoints(threshold.minimum, locale);
  const singular = threshold.minimum === "1";
  if (threshold.metric === "earned_points") {
    return `Earn ${amount} ${singular ? "point" : "points"}`;
  }
  if (threshold.metric === "order_count") {
    return `Place ${amount} ${singular ? "order" : "orders"}`;
  }
  if (threshold.metric === "referral_count") {
    return `Refer ${amount} ${singular ? "friend" : "friends"}`;
  }
  return `Complete ${amount} qualifying ${singular ? "activity" : "activities"}`;
}

export function formatPublicVipPeriod(
  period: TierQualificationPeriodV2,
): string {
  if (period.kind === "lifetime") return "Lifetime activity";
  if (period.kind === "rolling_days") {
    return `Your latest ${period.days} ${period.days === 1 ? "day" : "days"}`;
  }
  return `Calendar year · ${period.timeZone}`;
}
