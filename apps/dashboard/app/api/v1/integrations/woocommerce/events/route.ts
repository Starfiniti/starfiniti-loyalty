import {
  verifyWooCommerceDelivery,
  wooCommerceDeliveryEnvelopeV1,
  type WooCommerceSignatureHeaders,
} from "@starfiniti/contracts";
import { getDatabase } from "@/lib/server/database";
import { getWooCommerceSigningKey } from "@/lib/server/signing-material";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 1_048_576;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ConnectionRow = {
  id: string;
  organization_id: string;
  public_id: string;
  current_key_version: string;
  signing_material_ref: string;
};

type ReceiptRow = { receipt_id: string; outcome: "accepted" | "duplicate" };

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return problem(413, "body_too_large");
  }

  const headers = signatureHeaders(request.headers);
  if (!headers || !UUID.test(headers.connectionId)) {
    return problem(401, "invalid_signature_headers");
  }

  try {
    const sql = getDatabase();
    const connections = await sql<ConnectionRow[]>`
      select id, organization_id, public_id, current_key_version, signing_material_ref
      from loyalty.commerce_connections
      where public_id = ${headers.connectionId}::uuid
        and status in ('active', 'rotating')
      limit 1
    `;
    const connection = connections[0];
    if (!connection || connection.current_key_version !== headers.keyVersion) {
      return problem(401, "invalid_signature");
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    const requestUrl = new URL(request.url);
    const verification = verifyWooCommerceDelivery({
      requestTarget: `${requestUrl.pathname}${requestUrl.search}`,
      headers,
      rawBody,
      secret: getWooCommerceSigningKey(connection.signing_material_ref),
      maxBodyBytes: MAX_BODY_BYTES,
    });
    if (!verification.ok) return problem(401, verification.reason);

    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return problem(400, "invalid_json");
    }
    const envelope = wooCommerceDeliveryEnvelopeV1.safeParse(input);
    if (
      !envelope.success ||
      envelope.data.connectionId !== connection.public_id ||
      envelope.data.deliveryId !== headers.deliveryId
    ) {
      return problem(422, "invalid_envelope");
    }

    const event = envelope.data;
    const receipts = await sql<ReceiptRow[]>`
      select receipt_id, outcome
      from loyalty_private.accept_commerce_delivery(
        ${connection.organization_id}::bigint,
        ${connection.id}::bigint,
        ${event.deliveryId},
        ${event.version},
        ${event.sourceEventId},
        ${event.eventType},
        ${event.sourceObjectId},
        ${event.sourceRevision ?? null},
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
    return Response.json(receipt, { status: 202 });
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
): WooCommerceSignatureHeaders | null {
  const values = {
    connectionId: headers.get("x-starfiniti-connection-id"),
    deliveryId: headers.get("x-starfiniti-delivery-id"),
    timestamp: headers.get("x-starfiniti-timestamp"),
    nonce: headers.get("x-starfiniti-nonce"),
    keyVersion: headers.get("x-starfiniti-key-version"),
    bodySha256: headers.get("x-starfiniti-body-sha256"),
    signature: headers.get("x-starfiniti-signature"),
  };
  if (Object.values(values).some((value) => value === null)) return null;
  return values as WooCommerceSignatureHeaders;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error))
    return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function problem(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}
