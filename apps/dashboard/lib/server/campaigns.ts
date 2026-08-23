import "server-only";

import {
  audienceDefinitionV1,
  campaignDefinitionV1,
  campaignResultV1,
  type AudienceDefinitionV1,
  type CampaignDefinitionV1,
  type CampaignResultV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

type UnknownRow = Readonly<Record<string, unknown>>;

export type MerchantAudienceVersion = Readonly<{
  id: string;
  versionNumber: number;
  status: "draft" | "published" | "superseded";
  definition: AudienceDefinitionV1;
  definitionSha256: string;
  publishedAt: string | null;
  createdAt: string;
}>;

export type MerchantAudienceSnapshot = Readonly<{
  id: string;
  audienceVersionId: string;
  state: "building" | "complete";
  snapshotAt: string;
  memberCount: string;
  definitionSha256: string;
}>;

export type MerchantAudience = Readonly<{
  id: string;
  code: string;
  versions: readonly MerchantAudienceVersion[];
  snapshots: readonly MerchantAudienceSnapshot[];
}>;

export type MerchantCampaignVersion = Readonly<{
  id: string;
  versionNumber: number;
  status:
    "draft" | "scheduled" | "active" | "paused" | "cancelled" | "completed";
  definition: CampaignDefinitionV1;
  definitionSha256: string;
  approvedAt: string | null;
  statusChangedAt: string;
  createdAt: string;
}>;

export type MerchantCampaign = Readonly<{
  id: string;
  code: string;
  versions: readonly MerchantCampaignVersion[];
}>;

export type MerchantCampaignReward = Readonly<{
  id: string;
  code: string;
  name: string;
  kind:
    "fixed_discount" | "percentage_discount" | "free_shipping" | "free_product";
}>;

export type CampaignWorkspaceRead = Readonly<{
  audiences: readonly MerchantAudience[];
  campaigns: readonly MerchantCampaign[];
  rewards: readonly MerchantCampaignReward[];
  results: readonly CampaignResultV1[];
  catalogueAvailable: boolean;
  resultsAvailable: boolean;
}>;

function byteaHex(value: unknown): string {
  if (typeof value !== "string") throw new Error("campaign_read_unavailable");
  return value.startsWith("\\x") ? value.slice(2) : value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("campaign_read_unavailable");
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("campaign_read_unavailable");
  }
  return value;
}

function exactNonNegativeInteger(value: unknown): string {
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error("campaign_read_unavailable");
}

function rows(
  data: unknown,
  errorCode = "campaign_read_unavailable",
): UnknownRow[] {
  if (!Array.isArray(data)) throw new Error(errorCode);
  return data as UnknownRow[];
}

async function getCampaignCatalogue(
  context: TenantContext,
  programmePublicId: string,
): Promise<Pick<CampaignWorkspaceRead, "audiences" | "campaigns" | "rewards">> {
  if (!context.programmeGroup) {
    return { audiences: [], campaigns: [], rewards: [] };
  }
  const supabase = await createSupabaseServerClient();
  const programmeResult = await supabase
    .schema("loyalty")
    .from("programmes")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("public_id", programmePublicId)
    .maybeSingle();
  if (programmeResult.error || !programmeResult.data) {
    throw new Error("campaign_read_unavailable");
  }
  const programmeId = integer((programmeResult.data as UnknownRow).id);

  const [audienceResult, campaignResult, programmeVersionResult] =
    await Promise.all([
      supabase
        .schema("loyalty")
        .from("audiences")
        .select("id,public_id,code")
        .eq("organization_id", context.organization.id)
        .eq("programme_group_id", context.programmeGroup.id)
        .order("id", { ascending: true })
        .limit(100),
      supabase
        .schema("loyalty")
        .from("campaigns")
        .select("id,public_id,code")
        .eq("organization_id", context.organization.id)
        .eq("programme_id", programmeId)
        .order("id", { ascending: true })
        .limit(100),
      supabase
        .schema("loyalty")
        .from("programme_versions")
        .select("id")
        .eq("organization_id", context.organization.id)
        .eq("programme_id", programmeId)
        .in("status", ["published", "scheduled"])
        .order("version_number", { ascending: false })
        .limit(20),
    ]);
  if (
    audienceResult.error ||
    campaignResult.error ||
    programmeVersionResult.error
  ) {
    throw new Error("campaign_read_unavailable");
  }

  const audienceRows = rows(audienceResult.data);
  const campaignRows = rows(campaignResult.data);
  const programmeVersionIds = rows(programmeVersionResult.data).map((row) =>
    integer(row.id),
  );
  const audienceIds = audienceRows.map((row) => integer(row.id));
  const campaignIds = campaignRows.map((row) => integer(row.id));

  const [audienceVersionResult, campaignVersionResult, rewardResult] =
    await Promise.all([
      audienceIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .schema("loyalty")
            .from("audience_versions")
            .select(
              "id,public_id,audience_id,version_number,status,definition,definition_sha256,published_at,created_at",
            )
            .eq("organization_id", context.organization.id)
            .in("audience_id", audienceIds)
            .order("version_number", { ascending: false })
            .limit(500),
      campaignIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .schema("loyalty")
            .from("campaign_versions")
            .select(
              "public_id,campaign_id,version_number,status,definition,definition_sha256,approved_at,status_changed_at,created_at",
            )
            .eq("organization_id", context.organization.id)
            .in("campaign_id", campaignIds)
            .order("version_number", { ascending: false })
            .limit(500),
      programmeVersionIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .schema("loyalty")
            .from("programme_rewards")
            .select("public_id,code,name,reward_kind,configuration")
            .eq("organization_id", context.organization.id)
            .in("programme_version_id", programmeVersionIds)
            .order("id", { ascending: true })
            .limit(200),
    ]);
  if (
    audienceVersionResult.error ||
    campaignVersionResult.error ||
    rewardResult.error
  ) {
    throw new Error("campaign_read_unavailable");
  }

  const audienceVersions = rows(audienceVersionResult.data).map((row) => ({
    internalId: integer(row.id),
    audienceId: integer(row.audience_id),
    value: {
      id: text(row.public_id),
      versionNumber: integer(row.version_number),
      status: text(row.status) as MerchantAudienceVersion["status"],
      definition: audienceDefinitionV1.parse(row.definition),
      definitionSha256: byteaHex(row.definition_sha256),
      publishedAt: row.published_at === null ? null : text(row.published_at),
      createdAt: text(row.created_at),
    },
  }));
  const audienceVersionInternalIds = audienceVersions.map(
    (version) => version.internalId,
  );
  const snapshotResult =
    audienceVersionInternalIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .schema("loyalty")
          .from("audience_snapshots")
          .select(
            "public_id,audience_version_id,state,snapshot_at,member_count,definition_sha256",
          )
          .eq("organization_id", context.organization.id)
          .eq("programme_group_id", context.programmeGroup.id)
          .in("audience_version_id", audienceVersionInternalIds)
          .order("snapshot_at", { ascending: false })
          .limit(500);
  if (snapshotResult.error) throw new Error("campaign_read_unavailable");
  const snapshots = rows(snapshotResult.data).map((row) => ({
    audienceVersionInternalId: integer(row.audience_version_id),
    value: {
      id: text(row.public_id),
      audienceVersionId:
        audienceVersions.find(
          (version) => version.internalId === integer(row.audience_version_id),
        )?.value.id ?? "",
      state: text(row.state) as MerchantAudienceSnapshot["state"],
      snapshotAt: text(row.snapshot_at),
      memberCount: exactNonNegativeInteger(row.member_count),
      definitionSha256: byteaHex(row.definition_sha256),
    },
  }));

  const audiences = audienceRows.map((row) => {
    const internalId = integer(row.id);
    const versions = audienceVersions.filter(
      (version) => version.audienceId === internalId,
    );
    const versionIds = new Set(versions.map((version) => version.internalId));
    return {
      id: text(row.public_id),
      code: text(row.code),
      versions: versions.map((version) => version.value),
      snapshots: snapshots
        .filter((snapshot) =>
          versionIds.has(snapshot.audienceVersionInternalId),
        )
        .map((snapshot) => snapshot.value),
    };
  });

  const campaignVersions = rows(campaignVersionResult.data).map((row) => ({
    campaignId: integer(row.campaign_id),
    value: {
      id: text(row.public_id),
      versionNumber: integer(row.version_number),
      status: text(row.status) as MerchantCampaignVersion["status"],
      definition: campaignDefinitionV1.parse(row.definition),
      definitionSha256: byteaHex(row.definition_sha256),
      approvedAt: row.approved_at === null ? null : text(row.approved_at),
      statusChangedAt: text(row.status_changed_at),
      createdAt: text(row.created_at),
    },
  }));
  const campaigns = campaignRows.map((row) => ({
    id: text(row.public_id),
    code: text(row.code),
    versions: campaignVersions
      .filter((version) => version.campaignId === integer(row.id))
      .map((version) => version.value),
  }));

  const rewardById = new Map<string, MerchantCampaignReward>();
  for (const row of rows(rewardResult.data)) {
    const configuration = row.configuration as UnknownRow | null;
    const kind = text(row.reward_kind);
    if (
      configuration?.version !== "2" ||
      configuration.fulfilmentMode !== "woocommerce_coupon" ||
      ![
        "fixed_discount",
        "percentage_discount",
        "free_shipping",
        "free_product",
      ].includes(kind)
    ) {
      continue;
    }
    const reward: MerchantCampaignReward = {
      id: text(row.public_id),
      code: text(row.code),
      name: text(row.name),
      kind: kind as MerchantCampaignReward["kind"],
    };
    rewardById.set(reward.id, reward);
  }

  return { audiences, campaigns, rewards: [...rewardById.values()] };
}

export async function getCampaignResults(
  programmePublicId: string,
): Promise<readonly CampaignResultV1[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_campaign_results_v1", {
      target_programme_public_id: programmePublicId,
      target_limit: 100,
    });
  if (error) throw new Error("campaign_results_unavailable");
  return rows(data, "campaign_results_unavailable").map((row) =>
    campaignResultV1.parse(row.campaign_result),
  );
}

export async function getCampaignWorkspace(
  context: TenantContext,
  programmePublicId: string,
): Promise<CampaignWorkspaceRead> {
  const [catalogueResult, resultResult] = await Promise.allSettled([
    getCampaignCatalogue(context, programmePublicId),
    getCampaignResults(programmePublicId),
  ]);
  return {
    audiences:
      catalogueResult.status === "fulfilled"
        ? catalogueResult.value.audiences
        : [],
    campaigns:
      catalogueResult.status === "fulfilled"
        ? catalogueResult.value.campaigns
        : [],
    rewards:
      catalogueResult.status === "fulfilled"
        ? catalogueResult.value.rewards
        : [],
    results: resultResult.status === "fulfilled" ? resultResult.value : [],
    catalogueAvailable: catalogueResult.status === "fulfilled",
    resultsAvailable: resultResult.status === "fulfilled",
  };
}
