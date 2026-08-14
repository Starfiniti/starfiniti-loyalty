import "server-only";
import {
  referralReviewCaseV1,
  type ReferralReviewCaseV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

function reviewCaseFromRow(row: UnknownRow): ReferralReviewCaseV1 {
  return referralReviewCaseV1.parse({
    kind: row.review_kind,
    reviewId: row.review_id,
    attributionId: row.attribution_id,
    advocateReference: row.advocate_reference,
    friendReference: row.friend_reference,
    sourceOrderReference: row.source_order_reference,
    state: row.state,
    riskCodes: row.risk_codes,
    qualificationDecision: row.qualification_decision,
    coolingEndsAt: row.cooling_ends_at,
    attemptCount: row.attempt_count,
    reviewCycle: row.review_cycle,
    errorCode: row.error_code,
    createdAt: row.created_at,
  });
}

export async function getReferralReviewCases(
  programmeId: string,
): Promise<readonly ReferralReviewCaseV1[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("list_referral_review_cases", {
      target_programme_public_id: programmeId,
      target_kind: null,
      target_limit: 100,
    });
  if (error) throw new Error("referral_review_read_unavailable");
  const rows = Array.isArray(data) ? (data as UnknownRow[]) : [];
  return rows.map(reviewCaseFromRow);
}
