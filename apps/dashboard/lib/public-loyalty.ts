import type {
  ExperienceLocaleV1,
  PublicEarningEffectV1,
  PublicEarningMethodV1,
  PublicEarningSourceV1,
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

export function formatPublicEarningSource(
  source: PublicEarningSourceV1,
): string {
  if (source === "purchase") return "Shopping";
  if (source === "account_created") return "Membership";
  if (source === "birthday") return "Birthday";
  if (source === "verified_product_review") return "Verified review";
  return "Referral";
}

export function formatPublicEarningEffect(
  effect: PublicEarningEffectV1,
  locale: ExperienceLocaleV1,
): string {
  if (effect.kind === "base_rate") {
    return `${formatPublicPoints(effect.pointsPerMajorUnit, locale)} points / €1`;
  }
  if (effect.kind === "fixed_bonus") {
    const amount = formatPublicPoints(effect.points, locale);
    return `${amount} bonus ${effect.points === "1" ? "point" : "points"}`;
  }
  const whole = Math.floor(effect.multiplierBasisPoints / 10_000);
  const remainder = effect.multiplierBasisPoints % 10_000;
  const fraction = remainder.toString().padStart(4, "0").replace(/0+$/u, "");
  return `${whole}${fraction ? `.${fraction}` : ""}× points`;
}

export function formatPublicEarningWindow(
  method: PublicEarningMethodV1,
  locale: ExperienceLocaleV1,
): string {
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  if (!method.availableNow) {
    return method.startsAt
      ? `Available from ${date(method.startsAt)}`
      : "Currently unavailable";
  }
  return method.endsAt
    ? `Available until ${date(method.endsAt)}`
    : "Available now";
}
