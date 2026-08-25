import { describe, expect, it } from "vitest";
import { customerLoyaltyExperienceV1 } from "./customer-experience";

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
