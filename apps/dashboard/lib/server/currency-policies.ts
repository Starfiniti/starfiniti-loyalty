import "server-only";
import {
  programmeCurrencyPoliciesV1,
  type ProgrammeCurrencyPoliciesV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProgrammeCurrencyPoliciesState =
  | Readonly<{ kind: "ready"; value: ProgrammeCurrencyPoliciesV1 }>
  | Readonly<{ kind: "unavailable" }>;

export async function getProgrammeCurrencyPolicies(
  programmeVersionId: string,
): Promise<ProgrammeCurrencyPoliciesState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_programme_currency_policies_v1", {
      target_programme_version_public_id: programmeVersionId,
    });

  if (error || !Array.isArray(data)) return { kind: "unavailable" };
  const policies = data.map((row) =>
    row && typeof row === "object" && "policy" in row
      ? (row as { policy?: unknown }).policy
      : undefined,
  );
  const parsed = programmeCurrencyPoliciesV1.safeParse({
    version: "1",
    programmeVersionId,
    policies,
  });
  return parsed.success
    ? { kind: "ready", value: parsed.data }
    : { kind: "unavailable" };
}
