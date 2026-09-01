import "server-only";
import {
  customerLoyaltyExperienceV1,
  customerLoyaltyExperienceV2,
  customerLoyaltyExperienceV3,
  type CustomerActivityV1,
  type CustomerEarningMethodV1,
  type CustomerLoyaltyExperienceV1,
  type CustomerLoyaltyExperienceV2,
  type CustomerLoyaltyExperienceV3,
  type CustomerPurchaseCampaignOpportunityV1,
  type CustomerReferralExperienceV1,
  type CustomerReservationV1,
  type CustomerRewardV1,
  type CustomerTierProgressV1,
  type ExperiencePresentationV2,
} from "@starfiniti/contracts";
import { DEFAULT_EXPERIENCE_PRESENTATION_V2 } from "@/lib/experience-theme";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerReward = CustomerRewardV1;
export type CustomerReservation = CustomerReservationV1;
export type CustomerActivity = CustomerActivityV1;
export type CustomerEarningMethod = CustomerEarningMethodV1;
export type CustomerCampaignOpportunity = CustomerPurchaseCampaignOpportunityV1;

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
  campaign_opportunities: CustomerCampaignOpportunity[];
  presentation: ExperiencePresentationV2;
}>;

export type CustomerAccountState =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "ready"; accounts: CustomerLoyaltyAccount[] }>;

type ProjectionContainer = Readonly<{
  account_id?: unknown;
  experience?: unknown;
}>;

type ProjectionError = Readonly<{ code?: string | null }>;

export async function getCustomerLoyaltyAccounts(): Promise<CustomerAccountState> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    return { kind: "unauthenticated" };
  }

  const loyalty = supabase.schema("loyalty");
  const v3 = await loyalty.rpc("get_my_loyalty_experiences_v3");
  if (!v3.error) {
    return mapProjection(v3.data, "3");
  }
  if (!isMissingProjection(v3.error)) return { kind: "unavailable" };

  const v2 = await loyalty.rpc("get_my_loyalty_experiences_v2");
  if (!v2.error) {
    return mapProjection(v2.data, "2");
  }
  if (!isMissingProjection(v2.error)) return { kind: "unavailable" };

  // During an additive rolling deploy, the previous immutable read model is
  // safe to normalize with bounded defaults until every database has V2.
  const v1 = await loyalty.rpc("get_my_loyalty_experiences_v1");
  if (v1.error) return { kind: "unavailable" };
  return mapProjection(v1.data, "1");
}

function mapProjection(
  data: unknown,
  version: "1" | "2" | "3",
): CustomerAccountState {
  if (!Array.isArray(data)) return { kind: "unavailable" };
  const accounts: CustomerLoyaltyAccount[] = [];
  const accountIds = new Set<string>();
  for (const raw of data as ProjectionContainer[]) {
    const parsed =
      version === "3"
        ? customerLoyaltyExperienceV3.safeParse(raw.experience)
        : version === "2"
          ? customerLoyaltyExperienceV2.safeParse(raw.experience)
          : customerLoyaltyExperienceV1.safeParse(raw.experience);
    if (
      !parsed.success ||
      raw.account_id !== parsed.data.accountId ||
      accountIds.has(parsed.data.accountId)
    ) {
      return { kind: "unavailable" };
    }
    accountIds.add(parsed.data.accountId);
    accounts.push(
      version === "3"
        ? toCustomerLoyaltyAccount(parsed.data as CustomerLoyaltyExperienceV3)
        : version === "2"
          ? toCustomerLoyaltyAccount(parsed.data as CustomerLoyaltyExperienceV2)
          : toCustomerLoyaltyAccount(
              parsed.data as CustomerLoyaltyExperienceV1,
              DEFAULT_EXPERIENCE_PRESENTATION_V2,
            ),
    );
  }
  return { kind: "ready", accounts };
}

function isMissingProjection(error: ProjectionError): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

function toCustomerLoyaltyAccount(
  experience:
    | CustomerLoyaltyExperienceV1
    | CustomerLoyaltyExperienceV2
    | CustomerLoyaltyExperienceV3,
  fallbackPresentation?: ExperiencePresentationV2,
): CustomerLoyaltyAccount {
  const presentation =
    "presentation" in experience
      ? experience.presentation
      : (fallbackPresentation ?? DEFAULT_EXPERIENCE_PRESENTATION_V2);
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
    campaign_opportunities:
      "campaignOpportunities" in experience
        ? experience.campaignOpportunities
        : [],
    presentation,
  };
}
