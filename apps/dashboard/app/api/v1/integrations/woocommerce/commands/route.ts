import {
  verifyWooCommerceDelivery,
  wooCommerceCommandRequestV1,
  wooCommerceConnectorCommandEnvelope,
  type WooCommerceSignatureHeaders,
} from "@starfiniti/contracts";
import { getDatabase } from "@/lib/server/database";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "@/lib/server/bounded-request-body";
import { getWooCommerceSigningKey } from "@/lib/server/signing-material";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 65_536;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ConnectionRow = {
  public_id: string;
  current_key_version: string;
  signing_material_ref: string;
};
type CommandRow = {
  command_id: string;
  connection_id: string;
  topic: string;
  payload_version: string;
  payload: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const headers = signatureHeaders(request.headers);
  if (!headers || !UUID.test(headers.connectionId)) {
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
    const connections = await sql<ConnectionRow[]>`
      select public_id, current_key_version, signing_material_ref
      from loyalty.commerce_connections
      where public_id = ${headers.connectionId}::uuid
        and status in ('active', 'rotating')
      limit 1
    `;
    const connection = connections[0];
    if (!connection || connection.current_key_version !== headers.keyVersion) {
      return problem(401, "invalid_signature");
    }
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
    const parsed = wooCommerceCommandRequestV1.safeParse(input);
    if (
      !parsed.success ||
      parsed.data.connectionId !== connection.public_id ||
      parsed.data.requestId !== headers.deliveryId
    ) {
      return problem(422, "invalid_command_request");
    }
    if (parsed.data.kind === "acknowledge") {
      await sql`
        select * from loyalty_private.finish_woocommerce_command(
          ${connection.public_id}::uuid,
          ${parsed.data.commandId}::uuid,
          ${parsed.data.outcome},
          ${parsed.data.resultReference},
          ${parsed.data.errorCode},
          ${parsed.data.retryDelaySeconds}
        )
      `;
      return Response.json({ outcome: parsed.data.outcome }, { status: 200 });
    }

    const rows = await sql<CommandRow[]>`
      select command_id::text, connection_id::text, topic, payload_version, payload
      from loyalty_private.claim_woocommerce_commands(
        ${connection.public_id}::uuid,
        ${parsed.data.batchSize},
        60,
        ${sql.array(parsed.data.capabilities)}::text[]
      )
    `;
    const commands = [];
    for (const row of rows) {
      const command = wooCommerceConnectorCommandEnvelope.safeParse({
        version: "1",
        commandId: row.command_id,
        connectionId: row.connection_id,
        topic: row.topic,
        payloadVersion: row.payload_version,
        deliveredAt: new Date().toISOString(),
        payload: row.payload,
      });
      if (command.success) {
        commands.push(command.data);
      } else {
        await sql`
          select * from loyalty_private.finish_woocommerce_command(
            ${connection.public_id}::uuid,
            ${row.command_id}::uuid,
            'dead_letter', null, 'invalid_command_payload', 0
          )
        `;
      }
    }
    return Response.json({ commands }, { status: 200 });
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === "23514" || code === "55000") {
      return problem(409, "command_state_conflict");
    }
    return problem(503, "command_service_unavailable");
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
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function problem(status: number, code: string): Response {
  return Response.json({ error: { code } }, { status });
}
