import "server-only";
import {
  customerLoyaltyExperienceV1,
  type CustomerActivityV1,
  type CustomerEarningMethodV1,
  type CustomerLoyaltyExperienceV1,
  type CustomerReferralExperienceV1,
  type CustomerReservationV1,
  type CustomerRewardV1,
  type CustomerTierProgressV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerReward = CustomerRewardV1;
export type CustomerReservation = CustomerReservationV1;
export type CustomerActivity = CustomerActivityV1;
export type CustomerEarningMethod = CustomerEarningMethodV1;

export type CustomerLoyaltyAccount = Readonly<{
  account_id: string;
  workspace_id: string;
  programme_id: string | null;
  store_name: string;
  programme_name: string | null;
  account_status: CustomerLoyaltyExperienceV1["accountStatus"];
  enhancements_enabled: boolean;
  pending_points: string;
  available_points: string;
  reserved_points: string;
  tier_code: string | null;
  tier_name: string | null;
  next_expiry_points: string | null;
  next_expiry_at: string | null;
  earning_methods: CustomerEarningMethod[];
  rewards: CustomerReward[];
  reservations: CustomerReservation[];
  activity: CustomerActivity[];
  tier_progress: CustomerTierProgressV1 | null;
  referral: CustomerReferralExperienceV1 | null;
}>;

export type CustomerAccountState =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "ready"; accounts: CustomerLoyaltyAccount[] }>;

export async function getCustomerLoyaltyAccounts(): Promise<CustomerAccountState> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    return { kind: "unauthenticated" };
  }

  const result = await supabase
    .schema("loyalty")
    .rpc("get_my_loyalty_experiences_v1");
  if (result.error) throw new Error("customer_account_unavailable");

  const accounts: CustomerLoyaltyAccount[] = [];
  const accountIds = new Set<string>();
  for (const raw of (result.data ?? []) as ReadonlyArray<
    Readonly<{ account_id?: unknown; experience?: unknown }>
  >) {
    const parsed = customerLoyaltyExperienceV1.safeParse(raw.experience);
    if (
      !parsed.success ||
      raw.account_id !== parsed.data.accountId ||
      accountIds.has(parsed.data.accountId)
    ) {
      throw new Error("customer_account_unavailable");
    }
    accountIds.add(parsed.data.accountId);
    accounts.push(toCustomerLoyaltyAccount(parsed.data));
  }
  return { kind: "ready", accounts };
}

function toCustomerLoyaltyAccount(
  experience: CustomerLoyaltyExperienceV1,
): CustomerLoyaltyAccount {
  return {
    account_id: experience.accountId,
    workspace_id: experience.workspaceId,
    programme_id: experience.programmeId,
    store_name: experience.storeName,
    programme_name: experience.programmeName,
    account_status: experience.accountStatus,
    enhancements_enabled: experience.enhancementsEnabled,
    pending_points: experience.balances.pending,
    available_points: experience.balances.available,
    reserved_points: experience.balances.reserved,
    tier_code: experience.currentTier?.code ?? null,
    tier_name: experience.currentTier?.name ?? null,
    next_expiry_points: experience.nextExpiry?.points ?? null,
    next_expiry_at: experience.nextExpiry?.expiresAt ?? null,
    earning_methods: experience.earningMethods,
    rewards: experience.rewards,
    reservations: experience.reservations,
    activity: experience.activity,
    tier_progress: experience.tierProgress,
    referral: experience.referral,
  };
}
