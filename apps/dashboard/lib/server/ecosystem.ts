import "server-only";
import {
  programmeGroupSharingPolicyV1,
  type ProgrammeGroupSharingPolicyV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProgrammeGroupSharingState =
  | Readonly<{ kind: "ready"; policy: ProgrammeGroupSharingPolicyV1 }>
  | Readonly<{ kind: "not_configured" }>
  | Readonly<{ kind: "unavailable" }>;

export async function getProgrammeGroupSharingPolicy(
  programmeGroupId: string,
): Promise<ProgrammeGroupSharingState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_programme_group_sharing_policy_v1", {
      target_programme_group_public_id: programmeGroupId,
    });

  if (error) {
    return { kind: "unavailable" };
  }
  if (!Array.isArray(data) || data.length > 1) {
    return { kind: "unavailable" };
  }
  if (data.length === 0) {
    return { kind: "not_configured" };
  }

  const row = data[0];
  const parsed = programmeGroupSharingPolicyV1.safeParse(
    row && typeof row === "object" && "policy" in row
      ? (row as { policy?: unknown }).policy
      : undefined,
  );
  return parsed.success
    ? { kind: "ready", policy: parsed.data }
    : { kind: "unavailable" };
}
