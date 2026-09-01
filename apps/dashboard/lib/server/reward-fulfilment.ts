import "server-only";
import {
  rewardFulfilmentCaseV1,
  rewardFulfilmentSummaryV1,
  type RewardFulfilmentCaseV1,
  type RewardFulfilmentSummaryV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

function caseFromRow(row: UnknownRow): RewardFulfilmentCaseV1 {
  return rewardFulfilmentCaseV1.parse({
    caseId: row.case_id,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    customerReference: row.customer_reference,
    rewardCode: row.reward_code,
    rewardName: row.reward_name,
    costPoints: row.cost_points,
    state: row.state,
    instructions: row.instructions,
    dueAt: row.due_at,
    resultReference: row.result_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function getRewardFulfilmentState(programmeId: string): Promise<
  Readonly<{
    cases: readonly RewardFulfilmentCaseV1[];
    summary: RewardFulfilmentSummaryV1;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const [casesResult, summaryResult] = await Promise.all([
    supabase.schema("loyalty").rpc("list_reward_fulfilment_cases", {
      target_programme_public_id: programmeId,
      target_state: null,
      target_limit: 100,
    }),
    supabase.schema("loyalty").rpc("get_reward_fulfilment_summary", {
      target_programme_public_id: programmeId,
    }),
  ]);
  if (
    casesResult.error ||
    summaryResult.error ||
    !Array.isArray(casesResult.data)
  ) {
    throw new Error("reward_fulfilment_read_unavailable");
  }
  const rows = casesResult.data as UnknownRow[];
  return {
    cases: rows.map(caseFromRow),
    summary: rewardFulfilmentSummaryV1.parse(summaryResult.data),
  };
}
