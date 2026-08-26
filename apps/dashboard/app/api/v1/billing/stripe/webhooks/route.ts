import {
  managedBillingWebhookReceiptV1,
  type StripeBillingWebhookEventV1,
} from "@starfiniti/contracts/billing";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "@/lib/server/bounded-request-body";
import { getDatabase } from "@/lib/server/database";
import {
  normalizeStripeBillingWebhook,
  readStripeBillingWebhookSecret,
  STRIPE_BILLING_WEBHOOK_MAX_BODY_BYTES,
  StripeBillingWebhookError,
  verifyStripeBillingWebhook,
} from "@/lib/server/stripe-billing-webhook";

export const runtime = "nodejs";
export const maxDuration = 15;

type GateRow = {
  deployment_mode: "self_hosted" | "managed";
  enabled: boolean;
};

type ReceiptRow = {
  receipt_public_id: string;
  outcome: "accepted" | "duplicate";
};

export async function POST(request: Request): Promise<Response> {
  let sql: ReturnType<typeof getDatabase>;
  try {
    sql = getDatabase();
    const gates = await sql<GateRow[]>`
      select deployment_mode, enabled
      from loyalty_private.get_managed_billing_webhook_gate_v1()
    `;
    const gate = gates[0];
    if (!gate || gate.deployment_mode !== "managed" || !gate.enabled) {
      return problem(404, "billing_webhook_unavailable");
    }
  } catch {
    return problem(503, "billing_webhook_unavailable", 30);
  }

  if (mediaType(request.headers.get("content-type")) !== "application/json") {
    return problem(415, "unsupported_media_type");
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedRequestBody(
      request,
      STRIPE_BILLING_WEBHOOK_MAX_BODY_BYTES,
    );
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      return problem(error.code === "body_too_large" ? 413 : 400, error.code);
    }
    return problem(400, "body_read_failed");
  }

  let event: StripeBillingWebhookEventV1;
  try {
    const verification = verifyStripeBillingWebhook({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      secret: readStripeBillingWebhookSecret(),
    });
    event = normalizeStripeBillingWebhook(rawBody, verification);
  } catch (error) {
    if (!(error instanceof StripeBillingWebhookError)) {
      return problem(503, "billing_webhook_unavailable", 30);
    }
    if (error.code === "signing_secret_unavailable") {
      return problem(503, "billing_webhook_unavailable", 30);
    }
    if (error.code === "unsupported_event") {
      return new Response(null, {
        status: 204,
        headers: responseHeaders(),
      });
    }
    if (error.code === "invalid_json") {
      return problem(400, "invalid_json");
    }
    if (error.code === "invalid_event") {
      return problem(422, "invalid_billing_event");
    }
    return problem(401, "invalid_signature");
  }

  try {
    const receipts = await acceptWebhook(sql, event);
    const receipt = receipts[0];
    if (!receipt) throw new Error("billing_webhook_receipt_unavailable");
    const response = managedBillingWebhookReceiptV1.parse({
      receiptId: receipt.receipt_public_id,
      outcome: receipt.outcome,
    });
    return Response.json(response, {
      status: 202,
      headers: responseHeaders(),
    });
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === "23505") {
      return problem(409, "billing_webhook_conflict");
    }
    if (code === "42501") {
      return problem(404, "billing_webhook_unavailable");
    }
    if (code === "22023" || code === "23514") {
      return problem(422, "billing_webhook_rejected");
    }
    return problem(503, "billing_webhook_unavailable", 30);
  }
}

async function acceptWebhook(
  sql: ReturnType<typeof getDatabase>,
  event: StripeBillingWebhookEventV1,
): Promise<ReceiptRow[]> {
  return sql<ReceiptRow[]>`
    select receipt_public_id, outcome
    from loyalty_private.accept_managed_billing_webhook_v1(
      ${event.eventId},
      ${event.eventType},
      ${event.liveMode},
      ${event.objectId},
      ${event.customerId},
      ${event.subscriptionId},
      ${event.subscriptionStatus},
      ${event.eventCreatedAt}::timestamptz,
      ${event.currentPeriodEndsAt}::timestamptz,
      ${event.trialEndsAt}::timestamptz,
      ${event.signatureCreatedAt}::timestamptz,
      ${Buffer.from(event.bodySha256, "hex")}::bytea
    )
  `;
}

function mediaType(value: string | null): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function responseHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}

function problem(status: number, code: string, retryAfter?: number): Response {
  const headers = new Headers(responseHeaders());
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  return Response.json({ error: { code } }, { status, headers });
}
