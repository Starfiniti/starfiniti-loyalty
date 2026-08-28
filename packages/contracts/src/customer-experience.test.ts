import { describe, expect, it } from "vitest";
import {
  customerLoyaltyExperienceV1,
  customerLoyaltyExperienceV2,
  customerLoyaltyExperienceV3,
} from "./customer-experience";
import { canonicalExperienceSectionOrderV2 } from "./experience";

const accountId = "89000000-0000-4000-8000-000000000001";

function validExperience() {
  return {
    version: "1" as const,
    asOf: "2026-08-25T10:00:00Z",
    accountId,
    workspaceId: "89000000-0000-4000-8000-000000000002",
    programmeId: "89000000-0000-4000-8000-000000000003",
    storeName: "Example store",
    programmeName: "Example loyalty",
    accountStatus: "ready" as const,
    enhancementsEnabled: true,
    balances: { pending: "25", available: "9007199254740993", reserved: "0" },
    currentTier: { code: "bloom", name: "Bloom" },
    nextExpiry: {
      points: "250",
      expiresAt: "2026-10-01T00:00:00Z",
    },
    earningMethods: [
      {
        code: "purchase-base",
        name: "Every purchase",
        source: "purchase" as const,
        effect: { kind: "base_rate" as const, pointsPerMajorUnit: "5" },
        cap: {
          perEventPoints: null,
          perMemberPoints: null,
          memberPeriod: null,
          rollingDays: null,
        },
        hasRestrictions: true,
        startsAt: null,
        endsAt: null,
        availableNow: true,
      },
    ],
    rewards: [
      {
        code: "five-off",
        name: "Five off",
        kind: "fixed_discount" as const,
        costPoints: "9007199254740993",
        affordable: true,
      },
    ],
    reservations: [],
    activity: [
      {
        id: "89000000-0000-4000-8000-000000000004",
        kind: "award" as const,
        points: "9007199254740993",
        effectiveAt: "2026-08-24T10:00:00Z",
      },
    ],
    tierProgress: null,
    referral: null,
  };
}

function validExperienceV2() {
  return {
    ...validExperience(),
    version: "2" as const,
    presentation: {
      version: "2" as const,
      theme: {
        version: "2" as const,
        brandColor: "#4f46e5",
        displayFont: "modern-serif" as const,
        cardRadiusPx: 14 as const,
        heroText: "Rewards that move with you",
        pointsLabel: "Points",
        showTier: true,
        showRewards: true,
        widgetPosition: "right" as const,
        density: "comfortable" as const,
        heroAsset: "sparkles" as const,
        showReferrals: true,
        sectionOrder: [...canonicalExperienceSectionOrderV2],
      },
      copy: {
        version: "2" as const,
        locale: "en" as const,
        heroText: "Rewards that move with you",
        pointsLabel: "Points",
        balanceLabel: "Your balance",
        rewardsLabel: "Your rewards",
        redeemLabel: "Redeem",
        joinLabel: "Join free",
        earnMessage: "Earn points on every eligible order.",
      },
    },
  };
}

function validExperienceV3() {
  return {
    ...validExperienceV2(),
    version: "3" as const,
    campaignOpportunities: [
      {
        code: "offer-a7f39c2d",
        name: "Summer points boost",
        description: "Earn more on eligible purchases this week.",
        state: "active" as const,
        startsAt: "2026-08-24T00:00:00Z",
        endsAt: "2026-09-01T00:00:00Z",
        hasPurchaseRestrictions: true,
        effect: {
          kind: "purchase_multiplier" as const,
          multiplierBasisPoints: 20_000,
          combination: "highest_eligible_multiplier" as const,
        },
      },
      {
        code: "offer-b8e40d3e",
        name: "September bonus",
        description: null,
        state: "scheduled" as const,
        startsAt: "2026-09-02T00:00:00Z",
        endsAt: "2026-09-10T00:00:00Z",
        hasPurchaseRestrictions: false,
        effect: {
          kind: "bonus_points" as const,
          points: "9007199254740993",
          combination: "additive_bonus" as const,
        },
      },
    ],
  };
}

describe("CustomerLoyaltyExperienceV1", () => {
  it("retains exact PostgreSQL bigint values in a strict bounded container", () => {
    const parsed = customerLoyaltyExperienceV1.parse(validExperience());
    expect(parsed.balances.available).toBe("9007199254740993");
    expect(parsed.earningMethods).toHaveLength(1);
  });

  it("rejects affordability that disagrees with the exact balance", () => {
    const value = validExperience();
    value.rewards[0]!.affordable = false;
    expect(customerLoyaltyExperienceV1.safeParse(value).success).toBe(false);
  });

  it("preserves an exact negative balance after a reversal", () => {
    const value = validExperience();
    value.balances.available = "-25";
    value.rewards[0]!.affordable = false;
    expect(customerLoyaltyExperienceV1.parse(value).balances.available).toBe(
      "-25",
    );
  });

  it("rejects scheduled availability that disagrees with the canonical instant", () => {
    const source = validExperience();
    const value = {
      ...source,
      earningMethods: [
        {
          ...source.earningMethods[0]!,
          startsAt: "2026-08-26T00:00:00Z",
        },
      ],
    };
    expect(customerLoyaltyExperienceV1.safeParse(value).success).toBe(false);
  });

  it("rejects duplicate public identifiers and cross-account referral state", () => {
    const duplicate = validExperience();
    duplicate.activity.push({ ...duplicate.activity[0]! });
    expect(customerLoyaltyExperienceV1.safeParse(duplicate).success).toBe(
      false,
    );

    const crossed = {
      ...validExperience(),
      referral: {
        accountId: "89000000-0000-4000-8000-000000000099",
        sharingState: "available" as const,
        shareUrl: null,
        advocateRewardPoints: "500",
        friendRewardPoints: "250",
        minimumEligibleSpendMinor: "3000",
        currencyCode: "EUR",
        currencyMinorUnitDigits: 2,
        qualificationStatus: "completed" as const,
        coolingDays: 14,
        counts: {
          total: "0",
          pending: "0",
          qualified: "0",
          rejected: "0",
          reversed: "0",
        },
        history: [],
      },
    };
    expect(customerLoyaltyExperienceV1.safeParse(crossed).success).toBe(false);
  });

  it("rejects markup, private extensions, oversized lists, and bigint overflow", () => {
    expect(
      customerLoyaltyExperienceV1.safeParse({
        ...validExperience(),
        storeName: "<script>store</script>",
      }).success,
    ).toBe(false);
    expect(
      customerLoyaltyExperienceV1.safeParse({
        ...validExperience(),
        customerEmail: "private@example.test",
      }).success,
    ).toBe(false);
    expect(
      customerLoyaltyExperienceV1.safeParse({
        ...validExperience(),
        rewards: Array.from({ length: 21 }, (_, index) => ({
          code: `reward-${index}`,
          name: `Reward ${index}`,
          kind: "custom",
          costPoints: "1",
          affordable: true,
        })),
      }).success,
    ).toBe(false);
    expect(
      customerLoyaltyExperienceV1.safeParse({
        ...validExperience(),
        balances: {
          pending: "0",
          available: "9223372036854775808",
          reserved: "0",
        },
      }).success,
    ).toBe(false);
  });
});

describe("CustomerLoyaltyExperienceV2", () => {
  it("adds one strict controlled presentation while retaining exact value data", () => {
    const parsed = customerLoyaltyExperienceV2.parse(validExperienceV2());
    expect(parsed.balances.available).toBe("9007199254740993");
    expect(parsed.presentation.theme.sectionOrder).toEqual(
      canonicalExperienceSectionOrderV2,
    );
    expect(
      customerLoyaltyExperienceV1.safeParse(validExperienceV2()).success,
    ).toBe(false);
  });

  it("rejects missing sections, non-English copy, and private extensions", () => {
    const base = validExperienceV2();
    expect(
      customerLoyaltyExperienceV2.safeParse({
        ...base,
        presentation: {
          ...base.presentation,
          theme: {
            ...base.presentation.theme,
            sectionOrder: base.presentation.theme.sectionOrder.slice(0, -1),
          },
        },
      }).success,
    ).toBe(false);
    expect(
      customerLoyaltyExperienceV2.safeParse({
        ...base,
        presentation: {
          ...base.presentation,
          copy: { ...base.presentation.copy, locale: "sl-SI" },
        },
      }).success,
    ).toBe(false);
    expect(
      customerLoyaltyExperienceV2.safeParse({
        ...base,
        presentation: { ...base.presentation, customCss: "body{}" },
      }).success,
    ).toBe(false);
  });
});

describe("CustomerLoyaltyExperienceV3", () => {
  it("retains exact campaign benefits and controlled presentation", () => {
    const parsed = customerLoyaltyExperienceV3.parse(validExperienceV3());
    expect(parsed.campaignOpportunities[0]?.effect).toEqual({
      kind: "purchase_multiplier",
      multiplierBasisPoints: 20_000,
      combination: "highest_eligible_multiplier",
    });
    expect(parsed.campaignOpportunities[1]?.effect).toEqual({
      kind: "bonus_points",
      points: "9007199254740993",
      combination: "additive_bonus",
    });
    expect(
      customerLoyaltyExperienceV2.safeParse(validExperienceV3()).success,
    ).toBe(false);
  });

  it("rejects contradictory time states, duplicates, and unsafe extensions", () => {
    const activeBeforeStart = structuredClone(validExperienceV3());
    activeBeforeStart.campaignOpportunities[1]!.state = "active";
    expect(
      customerLoyaltyExperienceV3.safeParse(activeBeforeStart).success,
    ).toBe(false);

    const scheduledAfterStart = structuredClone(validExperienceV3());
    scheduledAfterStart.campaignOpportunities[0]!.state = "scheduled";
    expect(
      customerLoyaltyExperienceV3.safeParse(scheduledAfterStart).success,
    ).toBe(false);

    const duplicate = structuredClone(validExperienceV3());
    duplicate.campaignOpportunities[1]!.code =
      duplicate.campaignOpportunities[0]!.code;
    expect(customerLoyaltyExperienceV3.safeParse(duplicate).success).toBe(
      false,
    );

    const privateExtension = {
      ...validExperienceV3(),
      campaignOpportunities: [
        {
          ...validExperienceV3().campaignOpportunities[0],
          audienceSnapshotId: "89000000-0000-4000-8000-000000000099",
        },
      ],
    };
    expect(
      customerLoyaltyExperienceV3.safeParse(privateExtension).success,
    ).toBe(false);
  });

  it("rejects unsafe text, invalid multipliers, oversized lists, and ended offers", () => {
    const unsafe = structuredClone(validExperienceV3());
    unsafe.campaignOpportunities[0]!.description = "<script>private</script>";
    expect(customerLoyaltyExperienceV3.safeParse(unsafe).success).toBe(false);

    const invalidMultiplier = structuredClone(validExperienceV3());
    invalidMultiplier.campaignOpportunities[0]!.effect.multiplierBasisPoints = 10_000;
    expect(
      customerLoyaltyExperienceV3.safeParse(invalidMultiplier).success,
    ).toBe(false);

    const oversized = {
      ...validExperienceV3(),
      campaignOpportunities: Array.from({ length: 9 }, (_, index) => ({
        ...validExperienceV3().campaignOpportunities[1]!,
        code: `offer-${index}`,
      })),
    };
    expect(customerLoyaltyExperienceV3.safeParse(oversized).success).toBe(
      false,
    );

    const ended = structuredClone(validExperienceV3());
    ended.campaignOpportunities[0]!.endsAt = "2026-08-25T09:59:59Z";
    expect(customerLoyaltyExperienceV3.safeParse(ended).success).toBe(false);
  });
});
