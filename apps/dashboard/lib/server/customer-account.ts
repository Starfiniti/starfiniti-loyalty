import "server-only";
import {
  customerTierProgressV1,
  type CustomerTierProgressV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerReward = Readonly<{
  code: string;
  name: string;
  kind: string;
  costPoints: string;
  affordable: boolean;
}>;

export type CustomerReservation = Readonly<{
  id: string;
  rewardName: string;
  state: string;
  costPoints: string;
  expiresAt: string;
}>;

export type CustomerActivity = Readonly<{
  id: string;
  kind: string;
  points: string;
  effectiveAt: string;
}>;

export type CustomerLoyaltyAccount = Readonly<{
  account_id: string;
  customer_id: string;
  workspace_id: string;
  programme_id: string | null;
  store_name: string;
  programme_name: string | null;
  account_status: string;
  pending_points: string;
  available_points: string;
  reserved_points: string;
  tier_code: string | null;
  tier_name: string | null;
  next_expiry_points: string | null;
  next_expiry_at: string | null;
  rewards: CustomerReward[];
  reservations: CustomerReservation[];
  activity: CustomerActivity[];
  tier_progress: CustomerTierProgressV1 | null;
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
  const asOf = new Date().toISOString();
  const [result, progressResult] = await Promise.all([
    supabase.schema("loyalty").rpc("get_my_loyalty_accounts"),
    supabase
      .schema("loyalty")
      .rpc("get_my_tier_progress_v1", { target_as_of: asOf }),
  ]);
  if (result.error || progressResult.error) {
    throw new Error("customer_account_unavailable");
  }
  const progressByAccount = new Map<string, CustomerTierProgressV1>();
  for (const raw of (progressResult.data ?? []) as ReadonlyArray<
    Readonly<{ account_id?: unknown; tier_progress?: unknown }>
  >) {
    if (typeof raw.account_id !== "string") {
      throw new Error("customer_account_unavailable");
    }
    const parsed = customerTierProgressV1.safeParse(raw.tier_progress);
    if (!parsed.success || progressByAccount.has(raw.account_id)) {
      throw new Error("customer_account_unavailable");
    }
    progressByAccount.set(raw.account_id, parsed.data);
  }
  return {
    kind: "ready",
    accounts: (
      (result.data ?? []) as Omit<CustomerLoyaltyAccount, "tier_progress">[]
    ).map((account) => ({
      ...account,
      tier_progress: progressByAccount.get(account.account_id) ?? null,
    })),
  };
}
