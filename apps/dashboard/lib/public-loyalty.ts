import type {
  ExperienceLocaleV1,
  PublicEarningEffectV1,
  PublicEarningMethodV1,
  PublicEarningSourceV1,
  PublicRewardCurrencyV1,
  PublicRewardOfferV1,
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

export function formatPublicMoneyMinor(
  value: string,
  currency: PublicRewardCurrencyV1,
  locale: ExperienceLocaleV1,
): string {
  const minor = BigInt(value);
  const scale = 10n ** BigInt(currency.minorUnitDigits);
  const major = minor / scale;
  const remainder = minor % scale;
  const majorText = new Intl.NumberFormat(locale).format(major);
  const fraction =
    currency.minorUnitDigits === 0
      ? ""
      : remainder
          .toString()
          .padStart(currency.minorUnitDigits, "0")
          .replace(/0+$/u, "");
  const decimal = locale === "sl-SI" ? "," : ".";
  const symbol =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency.code;
  const amount = `${majorText}${fraction ? `${decimal}${fraction}` : ""}`;
  return symbol === currency.code
    ? `${currency.code} ${amount}`
    : `${symbol}${amount}`;
}

export function formatPublicRewardBenefit(
  offer: PublicRewardOfferV1,
  locale: ExperienceLocaleV1,
): string {
  const benefit = offer.benefit;
  if (benefit.kind === "fixed_discount") {
    return benefit.amountMinor !== null && offer.currency
      ? `${formatPublicMoneyMinor(benefit.amountMinor, offer.currency, locale)} off`
      : "Fixed discount";
  }
  if (benefit.kind === "percentage_discount") {
    if (benefit.percentageBasisPoints === null) return "Percentage discount";
    const whole = Math.floor(benefit.percentageBasisPoints / 100);
    const remainder = benefit.percentageBasisPoints % 100;
    return `${whole}${remainder ? `.${remainder.toString().padStart(2, "0").replace(/0$/u, "")}` : ""}% off`;
  }
  if (benefit.kind === "free_shipping") return "Free shipping";
  if (benefit.kind === "free_product") {
    return benefit.quantity && benefit.quantity > 1
      ? `${benefit.quantity} free products`
      : "Free product";
  }
  if (benefit.kind === "exclusive_access") return "Exclusive access";
  return "Custom perk";
}

export function formatPublicRewardWindow(
  offer: PublicRewardOfferV1,
  locale: ExperienceLocaleV1,
): string {
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  if (offer.state === "confirm_in_account")
    return "Confirm terms in your account";
  if (offer.state === "scheduled") {
    return offer.startsAt
      ? `Available from ${date(offer.startsAt)}`
      : "Scheduled";
  }
  return offer.endsAt
    ? `Available until ${date(offer.endsAt)}`
    : "Available now";
}

export function publicRewardConditionLabels(
  offer: PublicRewardOfferV1,
  locale: ExperienceLocaleV1,
): string[] {
  const labels: string[] = [];
  if (offer.conditions.minimumSpendMinor !== null && offer.currency) {
    labels.push(
      `${formatPublicMoneyMinor(offer.conditions.minimumSpendMinor, offer.currency, locale)} minimum spend`,
    );
  }
  if (offer.conditions.requiredTierNames.length) {
    labels.push(`${offer.conditions.requiredTierNames.join(" or ")} tier`);
  }
  if (offer.conditions.hasProductOrCategoryRestrictions) {
    labels.push("Selected products");
  }
  if (offer.conditions.excludesSaleItems) labels.push("Excludes sale items");
  if (offer.conditions.hasMemberLimit) labels.push("Member limit");
  if (offer.conditions.limitedAvailability) labels.push("Limited availability");
  if (offer.conditions.stacking === "exclusive") labels.push("Used on its own");
  if (offer.conditions.stacking === "combinable") labels.push("Can combine");
  return labels;
}

export function formatPublicRewardDelivery(offer: PublicRewardOfferV1): string {
  if (offer.delivery === "manual") {
    const days = offer.deliveryEstimateDays;
    return days === null
      ? "Sign in for delivery timing"
      : `Delivered by the store within ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (offer.delivery === "woocommerce_coupon") {
    const days = offer.validityDays;
    return days === null
      ? "Sign in for coupon validity"
      : `WooCommerce reward · ${days} ${days === 1 ? "day" : "days"} after claim`;
  }
  return "Sign in for fulfilment details";
}
