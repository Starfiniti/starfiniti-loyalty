import "server-only";
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
    .rpc("get_my_loyalty_accounts");
  if (result.error) throw new Error("customer_account_unavailable");
  return {
    kind: "ready",
    accounts: (result.data ?? []) as CustomerLoyaltyAccount[],
  };
}
