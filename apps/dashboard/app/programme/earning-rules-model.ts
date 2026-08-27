import {
  programmeDefinitionV1,
  programmeDefinitionV2,
  type EarningRuleConditionsV2,
  type EarningRuleV2,
  type ProgrammeDefinitionV2,
  type PurchaseExclusionsV2,
} from "@starfiniti/contracts";

export type EarningRuleTemplate =
  | "purchase_multiplier"
  | "purchase_bonus"
  | "account_created"
  | "birthday"
  | "verified_product_review"
  | "referral"
  | "custom_activity";

export const emptyRuleConditions: EarningRuleConditionsV2 = {
  productIds: [],
  categoryIds: [],
  currencyCodes: [],
  markets: [],
  channels: [],
  activityCodes: [],
  segmentCodes: [],
  tierCodes: [],
  startsAt: null,
  endsAt: null,
};

export const defaultPurchaseExclusions: PurchaseExclusionsV2 = {
  productIds: [],
  categoryIds: [],
  shipping: true,
  tax: true,
  fees: true,
  giftCardPayments: true,
  storeCreditPayments: true,
  discounts: true,
};

const fallbackTier = {
  code: "rose",
  name: "Rose",
  minimumEligibleSpendMinor: "0",
  pointsPerMajorUnit: "5",
};

export function initialProgrammeDefinitionV2(value: unknown): Readonly<{
  definition: ProgrammeDefinitionV2;
  migratedFromV1: boolean;
}> {
  const current = programmeDefinitionV2.safeParse(value);
  if (current.success) {
    return {
      definition: {
        ...current.data,
        pointsExpiryPolicy:
          current.data.pointsExpiryPolicy ??
          defaultPointExpiryPolicy(current.data.pointsExpireAfterDays),
      },
      migratedFromV1: false,
    };
  }
  const legacy = programmeDefinitionV1.safeParse(value);
  const tiers = legacy.success ? legacy.data.tiers : [fallbackTier];
  const rewards = legacy.success ? legacy.data.rewards : [];
  const baseRate = tiers[0]?.pointsPerMajorUnit ?? "5";
  return {
    migratedFromV1: legacy.success,
    definition: programmeDefinitionV2.parse({
      version: "2",
      currencyCode: "EUR",
      currencyMinorUnitDigits: 2,
      pendingDays: 30,
      pointsExpireAfterDays: 365,
      pointsExpiryPolicy: defaultPointExpiryPolicy(365),
      tiers,
      rewards,
      earningRules: [
        {
          code: "purchase-base",
          name: "Base purchase points",
          source: "purchase",
          enabled: true,
          priority: 0,
          stackable: false,
          effect: { kind: "base_rate", pointsPerMajorUnit: baseRate },
          conditions: emptyRuleConditions,
          purchaseExclusions: defaultPurchaseExclusions,
          cap: {
            perEventPoints: null,
            perMemberPoints: null,
            memberPeriod: null,
            rollingDays: null,
          },
        },
      ],
    }),
  };
}

export function defaultPointExpiryPolicy(expireAfterDays: number) {
  return {
    version: "2" as const,
    method: "earned_date" as const,
    expireAfterDays,
    notificationLeadDays: [30, 14, 7].filter(
      (leadDays) => leadDays < expireAfterDays,
    ),
  };
}

const templateDetails: Record<
  EarningRuleTemplate,
  Readonly<{
    code: string;
    name: string;
    source: EarningRuleV2["source"];
    priority: number;
    points: string;
  }>
> = {
  purchase_multiplier: {
    code: "double-points",
    name: "Double points",
    source: "purchase",
    priority: 100,
    points: "0",
  },
  purchase_bonus: {
    code: "purchase-bonus",
    name: "Purchase bonus",
    source: "purchase",
    priority: 10,
    points: "100",
  },
  account_created: {
    code: "account-created",
    name: "Create an account",
    source: "account_created",
    priority: 10,
    points: "100",
  },
  birthday: {
    code: "birthday",
    name: "Birthday reward",
    source: "birthday",
    priority: 10,
    points: "250",
  },
  verified_product_review: {
    code: "verified-review",
    name: "Verified product review",
    source: "verified_product_review",
    priority: 10,
    points: "100",
  },
  referral: {
    code: "successful-referral",
    name: "Successful referral",
    source: "referral",
    priority: 10,
    points: "500",
  },
  custom_activity: {
    code: "custom-activity",
    name: "Verified custom activity",
    source: "custom_activity",
    priority: 10,
    points: "100",
  },
};

export function createEarningRuleTemplate(
  template: EarningRuleTemplate,
  existingRules: readonly EarningRuleV2[],
): EarningRuleV2 {
  const details = templateDetails[template];
  const code = uniqueCode(
    details.code,
    existingRules.map((rule) => rule.code),
  );
  const purchase = details.source === "purchase";
  const multiplier = template === "purchase_multiplier";
  return {
    code,
    name: details.name,
    source: details.source,
    enabled: true,
    priority: details.priority,
    stackable: !multiplier,
    effect: multiplier
      ? { kind: "multiplier", multiplierBasisPoints: 20_000 }
      : { kind: "fixed_bonus", points: details.points },
    conditions: {
      ...emptyRuleConditions,
      activityCodes: template === "custom_activity" ? ["custom_activity"] : [],
    },
    purchaseExclusions: purchase ? { ...defaultPurchaseExclusions } : null,
    cap: {
      perEventPoints: multiplier ? null : details.points,
      perMemberPoints:
        template === "account_created" || template === "birthday"
          ? details.points
          : null,
      memberPeriod:
        template === "account_created"
          ? "lifetime"
          : template === "birthday"
            ? "calendar_year"
            : null,
      rollingDays: null,
    },
  };
}

export function selectorList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

export function decimalToMinor(value: string, digits: number): string | null {
  const match = /^(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/u.exec(value.trim());
  if (!match || (match[1]?.length ?? 0) > digits) return null;
  const [major = "0"] = value.trim().split(".");
  const fraction = (match[1] ?? "").padEnd(digits, "0");
  return (
    BigInt(major) * 10n ** BigInt(digits) +
    BigInt(fraction || "0")
  ).toString();
}

function uniqueCode(seed: string, existing: readonly string[]): string {
  if (!existing.includes(seed)) return seed;
  let suffix = 2;
  while (existing.includes(`${seed}-${suffix}`)) suffix += 1;
  return `${seed}-${suffix}`;
}
