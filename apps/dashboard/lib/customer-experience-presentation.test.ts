import { describe, expect, it } from "vitest";
import type { CustomerLoyaltyAccount } from "@/lib/server/customer-account";
import {
  activityPresentation,
  customerExperienceSections,
  earningCapLabel,
  earningEffectLabel,
  formatCustomerPoints,
  selectCustomerAccount,
} from "./customer-experience-presentation";

function account(accountId: string): CustomerLoyaltyAccount {
  return {
    account_id: accountId,
    workspace_id: "a1000000-0000-4000-8000-000000000001",
    programme_id: null,
    store_name: "Store",
    programme_name: "Rewards",
    account_status: "ready",
    enhancements_enabled: true,
    pending_points: "0",
    available_points: "0",
    reserved_points: "0",
    tier_code: null,
    tier_name: null,
    next_expiry_points: null,
    next_expiry_at: null,
    earning_methods: [],
    rewards: [],
    reservations: [],
    activity: [],
    tier_progress: null,
    referral: null,
  };
}

describe("customer experience presentation", () => {
  it("keeps all seven customer areas in one stable navigation contract", () => {
    expect(customerExperienceSections).toEqual([
      { id: "overview", label: "Overview" },
      { id: "earning", label: "Ways to earn" },
      { id: "rewards", label: "Rewards" },
      { id: "vip", label: "VIP status" },
      { id: "referrals", label: "Referrals" },
      { id: "history", label: "History" },
      { id: "account", label: "Account" },
    ]);
  });

  it("selects only an account already returned by the authorized read", () => {
    const first = account("a1000000-0000-4000-8000-000000000001");
    const second = account("a1000000-0000-4000-8000-000000000002");
    expect(selectCustomerAccount([first, second], second.account_id)).toBe(
      second,
    );
    expect(selectCustomerAccount([first, second], "forged-account")).toBe(
      first,
    );
    expect(selectCustomerAccount([], first.account_id)).toBeNull();
  });

  it("formats bigint values and every earning effect without number coercion", () => {
    expect(formatCustomerPoints("9007199254740993")).toBe(
      "9,007,199,254,740,993",
    );
    expect(
      earningEffectLabel({ kind: "base_rate", pointsPerMajorUnit: "7" }),
    ).toBe("7 points / currency unit");
    expect(
      earningEffectLabel({ kind: "multiplier", multiplierBasisPoints: 12_500 }),
    ).toBe("1.25× points");
    expect(earningEffectLabel({ kind: "fixed_bonus", points: "250" })).toBe(
      "250 points",
    );
  });

  it("explains bounded member caps and immutable activity direction", () => {
    expect(
      earningCapLabel({
        perEventPoints: "500",
        perMemberPoints: "1500",
        memberPeriod: "rolling",
        rollingDays: 30,
      }),
    ).toBe("Maximum 500 per activity · 1,500 per 30-day period");
    expect(
      activityPresentation({
        id: "a1000000-0000-4000-8000-000000000001",
        kind: "refund_reversal",
        points: "100",
        effectiveAt: "2026-08-25T10:00:00Z",
      }),
    ).toMatchObject({ sign: "−", tone: "negative" });
  });
});
