import {
  merchantActivityDeliveryEnvelopeV1,
  verifyMerchantActivityDelivery,
  type MerchantActivitySignatureHeaders,
} from "@starfiniti/contracts";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "@/lib/server/bounded-request-body";
import { getDatabase } from "@/lib/server/database";
import { getSigningKey } from "@/lib/server/signing-material";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 65_536;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type SourceRow = {
  id: string;
  organization_id: string;
  public_id: string;
  current_key_version: string;
  signing_material_ref: string;
};
type ReceiptRow = { receipt_id: string; outcome: "accepted" | "duplicate" };
type NormalizationRow = {
  canonical_event_id: string;
  outcome: "created" | "duplicate";
};

export async function POST(request: Request): Promise<Response> {
  const headers = signatureHeaders(request.headers);
  if (!headers || !UUID.test(headers.sourceId)) {
    return problem(401, "invalid_signature_headers");
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      return problem(error.code === "body_too_large" ? 413 : 400, error.code);
    }
    return problem(400, "body_read_failed");
  }

  try {
    const sql = getDatabase();
    const sources = await sql<SourceRow[]>`
      select id, organization_id, public_id, current_key_version,
        signing_material_ref
      from loyalty.commerce_connections
      where public_id = ${headers.sourceId}::uuid
        and platform = 'merchant_activity'
        and status in ('active', 'rotating')
      limit 1
    `;
    const source = sources[0];
    if (!source || source.current_key_version !== headers.keyVersion) {
      return problem(401, "invalid_signature");
    }

    const requestUrl = new URL(request.url);
    const verification = verifyMerchantActivityDelivery({
      requestTarget: `${requestUrl.pathname}${requestUrl.search}`,
      headers,
      rawBody,
      secret: getSigningKey(source.signing_material_ref),
      maxBodyBytes: MAX_BODY_BYTES,
    });
    if (!verification.ok) return problem(401, verification.reason);

    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return problem(400, "invalid_json");
    }
    const envelope = merchantActivityDeliveryEnvelopeV1.safeParse(input);
    if (
      !envelope.success ||
      envelope.data.sourceId !== source.public_id ||
      envelope.data.deliveryId !== headers.deliveryId
    ) {
      return problem(422, "invalid_envelope");
    }

    const event = envelope.data;
    const receipts = await sql<ReceiptRow[]>`
      select receipt_id, outcome
      from loyalty_private.accept_commerce_delivery(
        ${source.organization_id}::bigint,
        ${source.id}::bigint,
        ${event.deliveryId},
        ${event.version},
        ${event.eventId},
        'commerce.activity.recorded',
        ${event.payload.customerId},
        null,
        ${event.occurredAt}::timestamptz,
        ${event.deliveredAt}::timestamptz,
        ${headers.keyVersion},
        ${headers.nonce},
        ${verification.bodySha256},
        ${JSON.stringify(event)}::jsonb
      )
    `;
    const receipt = receipts[0];
    if (!receipt) throw new Error("receipt_unavailable");
    const normalized = await sql<NormalizationRow[]>`
      select canonical_event_id, outcome
      from loyalty_private.normalize_commerce_delivery(
        ${receipt.receipt_id}::uuid,
        'v1'
      )
    `;
    if (!normalized[0]) throw new Error("normalization_unavailable");
    return Response.json(
      { ...receipt, normalization: normalized[0] },
      { status: 202 },
    );
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === "23505" || code === "23514") {
      return problem(409, "idempotency_conflict");
    }
    return problem(503, "ingestion_unavailable");
  }
}

function signatureHeaders(
  headers: Headers,
): MerchantActivitySignatureHeaders | null {
  const values = {
    sourceId: headers.get("x-starfiniti-activity-source-id"),
    deliveryId: headers.get("x-starfiniti-delivery-id"),
    timestamp: headers.get("x-starfiniti-timestamp"),
    nonce: headers.get("x-starfiniti-nonce"),
    keyVersion: headers.get("x-starfiniti-key-version"),
    bodySha256: headers.get("x-starfiniti-body-sha256"),
    signature: headers.get("x-starfiniti-signature"),
  };
  if (Object.values(values).some((value) => value === null)) return null;
  return values as MerchantActivitySignatureHeaders;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function problem(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}
