import "server-only";
import { createHash } from "node:crypto";
import {
  verifyWooCommerceCustomerClaim,
  wooCommerceCustomerClaimV1,
  type WooCommerceCustomerClaimV1,
} from "@starfiniti/contracts";
import { getDatabase } from "./database";
import { getWooCommerceSigningKey } from "./signing-material";
import { customerLocalePath, type CustomerLocale } from "@/lib/customer-locale";

type ClaimSource = Record<string, string | string[] | undefined> | FormData;

type ConnectionRow = {
  id: string;
  organization_id: string;
  public_id: string;
  display_name: string;
  current_key_version: string;
  signing_material_ref: string;
};

type ClaimResultRow = {
  link_public_id: string | null;
  customer_public_id: string | null;
  outcome:
    | "linked"
    | "already_linked"
    | "rejected_identity"
    | "rejected_user_conflict"
    | "rejected_customer_conflict";
};

export function parseWooCommerceCustomerClaim(
  source: ClaimSource,
): WooCommerceCustomerClaimV1 | null {
  const value = (name: keyof WooCommerceCustomerClaimV1) => {
    const candidate =
      source instanceof FormData ? source.get(name) : source[name];
    return typeof candidate === "string" ? candidate : undefined;
  };
  const parsed = wooCommerceCustomerClaimV1.safeParse({
    connectionId: value("connectionId"),
    externalCustomerId: value("externalCustomerId"),
    issuedAt: value("issuedAt"),
    nonce: value("nonce"),
    keyVersion: value("keyVersion"),
    signature: value("signature"),
  });
  return parsed.success ? parsed.data : null;
}

export function customerClaimPath(
  claim: WooCommerceCustomerClaimV1,
  locale: CustomerLocale = "en",
): string {
  const query = new URLSearchParams(claim);
  return customerLocalePath(`/claim/woocommerce?${query.toString()}`, locale);
}

export async function verifyCustomerClaim(
  claim: WooCommerceCustomerClaimV1,
): Promise<ConnectionRow> {
  const sql = getDatabase();
  const connections = await sql<ConnectionRow[]>`
    select id, organization_id, public_id, display_name,
      current_key_version, signing_material_ref
    from loyalty.commerce_connections
    where public_id = ${claim.connectionId}::uuid
      and status in ('active', 'rotating')
      and current_key_version = ${claim.keyVersion}
    limit 1
  `;
  const connection = connections[0];
  if (!connection) throw new Error("invalid_customer_claim");
  const verified = verifyWooCommerceCustomerClaim({
    claim,
    secret: getWooCommerceSigningKey(connection.signing_material_ref),
  });
  if (!verified.ok) throw new Error("invalid_customer_claim");
  return connection;
}

export async function consumeCustomerClaim(
  claim: WooCommerceCustomerClaimV1,
  authUserId: string,
): Promise<ClaimResultRow> {
  const connection = await verifyCustomerClaim(claim);
  const nonceHash = createHash("sha256").update(claim.nonce).digest();
  const proofHash = createHash("sha256")
    .update(Buffer.from(claim.signature, "hex"))
    .digest();
  const issuedAt = new Date(Number(claim.issuedAt) * 1000).toISOString();
  const sql = getDatabase();
  const rows = await sql<ClaimResultRow[]>`
    select link_public_id, customer_public_id, outcome
    from loyalty_private.claim_woocommerce_customer_identity(
      ${connection.public_id}::uuid,
      ${claim.externalCustomerId},
      ${authUserId}::uuid,
      ${claim.keyVersion},
      ${issuedAt}::timestamptz,
      ${nonceHash}::bytea,
      ${proofHash}::bytea
    )
  `;
  const result = rows[0];
  if (!result) throw new Error("customer_claim_unavailable");
  return result;
}
