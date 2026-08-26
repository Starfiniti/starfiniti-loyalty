import { serviceActivityCommandV1 } from "@starfiniti/contracts";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "@/lib/server/bounded-request-body";
import { getDatabase } from "@/lib/server/database";
import {
  invalidServiceApiCredentialProblem,
  problem,
  serviceApiCredential,
  serviceApiProblem,
  serviceApiRateHeaders,
} from "@/lib/server/service-api-http";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 65_536;

type ActivityRow = Readonly<{
  receipt_id: string;
  receipt_outcome: "accepted" | "duplicate";
  canonical_event_id: string;
  canonical_outcome: "created" | "duplicate";
  quota_limit: number;
  quota_remaining: number;
  quota_reset_at: string;
}>;

export async function POST(request: Request): Promise<Response> {
  const credential = serviceApiCredential(request);
  if (!credential) return invalidServiceApiCredentialProblem();
  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      return problem(error.code === "body_too_large" ? 413 : 400, error.code);
    }
    return problem(400, "body_read_failed");
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return problem(400, "invalid_json");
  }
  const command = serviceActivityCommandV1.safeParse(input);
  if (!command.success) return problem(422, "invalid_command");

  try {
    const sql = getDatabase();
    const rows = await sql<ActivityRow[]>`
      select receipt_id, receipt_outcome, canonical_event_id,
        canonical_outcome, quota_limit, quota_remaining, quota_reset_at
      from loyalty_private.accept_service_activity_v1(
        ${credential.credentialId}::uuid,
        ${Buffer.from(credential.tokenSha256, "hex")},
        ${command.data.externalCustomerId},
        ${command.data.eventId},
        ${command.data.occurredAt}::timestamptz,
        ${command.data.source},
        ${command.data.activityCode},
        ${command.data.productId},
        ${command.data.categoryIds}::text[],
        ${command.data.idempotencyKey},
        ${command.data.correlationId}::uuid
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("service_activity_result_unavailable");
    const headers = serviceApiRateHeaders({
      limit: Number(row.quota_limit),
      remaining: Number(row.quota_remaining),
      resetAt: row.quota_reset_at,
    });
    return Response.json(
      {
        version: "1",
        receiptId: row.receipt_id,
        outcome: row.receipt_outcome,
        canonicalEventId: row.canonical_event_id,
        canonicalOutcome: row.canonical_outcome,
        correlationId: command.data.correlationId,
      },
      { status: 202, headers },
    );
  } catch (error) {
    return serviceApiProblem(error);
  }
}
