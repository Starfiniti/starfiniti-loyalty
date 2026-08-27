import type {
  CustomerActivityV1,
  CustomerEarningMethodV1,
  CustomerRewardV1,
  ExperienceThemeDefinitionV2,
} from "@starfiniti/contracts";
import type { CustomerLoyaltyAccount } from "@/lib/server/customer-account";

export const customerExperienceSections = [
  { id: "overview", label: "Overview" },
  { id: "earning", label: "Ways to earn" },
  { id: "rewards", label: "Rewards" },
  { id: "vip", label: "VIP status" },
  { id: "referrals", label: "Referrals" },
  { id: "history", label: "History" },
  { id: "account", label: "Account" },
] as const;

export function visibleCustomerExperienceSections(
  theme: ExperienceThemeDefinitionV2,
): ExperienceThemeDefinitionV2["sectionOrder"] {
  return theme.sectionOrder.filter((section) =>
    section === "rewards"
      ? theme.showRewards
      : section === "vip"
        ? theme.showTier
        : section === "referrals"
          ? theme.showReferrals
          : true,
  );
}

export function selectCustomerAccount(
  accounts: readonly CustomerLoyaltyAccount[],
  requestedAccountId: unknown,
): CustomerLoyaltyAccount | null {
  if (accounts.length === 0) return null;
  if (typeof requestedAccountId !== "string") return accounts[0] ?? null;
  return (
    accounts.find((account) => account.account_id === requestedAccountId) ??
    accounts[0] ??
    null
  );
}

export function formatCustomerPoints(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-GB");
  } catch {
    return "0";
  }
}

export function formatCustomerDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "Europe/Ljubljana",
      }).format(date);
}

export function customerAccountStatus(status: string): Readonly<{
  label: string;
  detail: string;
  tone: "live" | "pending" | "warning";
}> {
  if (status === "ready") {
    return {
      label: "Live",
      detail: "Your balance and loyalty activity are up to date.",
      tone: "live",
    };
  }
  if (status === "ready_without_activity") {
    return {
      label: "Ready",
      detail: "Your account is connected and ready for its first activity.",
      tone: "pending",
    };
  }
  if (status.startsWith("wallet_")) {
    return {
      label: "Wallet unavailable",
      detail: "Your history is protected. Contact the store before redeeming.",
      tone: "warning",
    };
  }
  return {
    label: "Programme unavailable",
    detail:
      "Your protected account remains linked while the programme is unavailable.",
    tone: "warning",
  };
}

export function earningSourceLabel(
  source: CustomerEarningMethodV1["source"],
): string {
  const labels: Record<CustomerEarningMethodV1["source"], string> = {
    purchase: "Shop and earn",
    account_created: "Create an account",
    birthday: "Birthday reward",
    verified_product_review: "Verified review",
    referral: "Refer a friend",
    custom_activity: "Member activity",
  };
  return labels[source];
}

export function earningEffectLabel(
  effect: CustomerEarningMethodV1["effect"],
): string {
  if (effect.kind === "base_rate") {
    return `${formatCustomerPoints(effect.pointsPerMajorUnit)} points / currency unit`;
  }
  if (effect.kind === "fixed_bonus") {
    return `${formatCustomerPoints(effect.points)} points`;
  }
  const whole = Math.floor(effect.multiplierBasisPoints / 10_000);
  const fraction = effect.multiplierBasisPoints % 10_000;
  const multiplier = fraction
    ? `${whole}.${fraction.toString().padStart(4, "0").replace(/0+$/u, "")}`
    : whole.toString();
  return `${multiplier}× points`;
}

export function earningCapLabel(
  cap: CustomerEarningMethodV1["cap"],
): string | null {
  const labels: string[] = [];
  if (cap.perEventPoints) {
    labels.push(`${formatCustomerPoints(cap.perEventPoints)} per activity`);
  }
  if (cap.perMemberPoints && cap.memberPeriod) {
    const period =
      cap.memberPeriod === "rolling" && cap.rollingDays
        ? `${cap.rollingDays}-day period`
        : cap.memberPeriod.replaceAll("_", " ");
    labels.push(`${formatCustomerPoints(cap.perMemberPoints)} per ${period}`);
  }
  return labels.length ? `Maximum ${labels.join(" · ")}` : null;
}

export function rewardKindLabel(kind: CustomerRewardV1["kind"]): string {
  const labels: Record<CustomerRewardV1["kind"], string> = {
    fixed_discount: "Order discount",
    percentage_discount: "Percentage discount",
    free_product: "Free product",
    free_shipping: "Free shipping",
    store_credit: "Legacy reward",
    exclusive_access: "Exclusive access",
    custom: "Member perk",
  };
  return labels[kind];
}

export function activityPresentation(item: CustomerActivityV1): Readonly<{
  label: string;
  sign: "+" | "−" | "";
  tone: "positive" | "negative" | "neutral";
}> {
  const presentations: Record<
    CustomerActivityV1["kind"],
    Readonly<{
      label: string;
      sign: "+" | "−" | "";
      tone: "positive" | "negative" | "neutral";
    }>
  > = {
    award: { label: "Points earned", sign: "+", tone: "positive" },
    release: { label: "Points became available", sign: "+", tone: "positive" },
    reserve: { label: "Reward reserved", sign: "−", tone: "neutral" },
    capture: { label: "Reward used", sign: "−", tone: "negative" },
    cancel: { label: "Reservation released", sign: "+", tone: "positive" },
    expire: { label: "Points expired", sign: "−", tone: "negative" },
    refund_reversal: {
      label: "Refund adjustment",
      sign: "−",
      tone: "negative",
    },
    manual_adjustment: {
      label: "Account adjustment",
      sign: "",
      tone: "neutral",
    },
  };
  return presentations[item.kind];
}
