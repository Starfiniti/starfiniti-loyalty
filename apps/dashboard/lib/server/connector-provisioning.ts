import "server-only";
import { randomInt } from "node:crypto";
import {
  merchantProvisionWooCommerceConnectionResultV1,
  wooCommerceConnectionPackageV1,
  type MerchantProvisionWooCommerceConnectionCommandV1,
  type WooCommerceConnectionPackageV1,
} from "@starfiniti/contracts";
import { getDatabase } from "./database";
import {
  getWooCommerceSigningKey,
  getWooCommerceSigningPoolReferences,
} from "./signing-material";

type ProvisioningRow = Readonly<{
  connection_public_id: string;
  key_version: string;
  signing_material_ref: string;
  outcome: string;
}>;

function randomized<T>(values: readonly T[]): readonly T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export async function provisionWooCommerceConnection(
  actorUserId: string,
  command: MerchantProvisionWooCommerceConnectionCommandV1,
  endpoint: string,
): Promise<
  Readonly<{
    result: ReturnType<
      typeof merchantProvisionWooCommerceConnectionResultV1.parse
    >;
    connectionPackage: WooCommerceConnectionPackageV1;
  }>
> {
  const sql = getDatabase();
  const usedRows = await sql<ReadonlyArray<{ signing_material_ref: string }>>`
    select signing_material_ref
    from loyalty.commerce_connections
  `;
  const used = new Set(usedRows.map((row) => row.signing_material_ref));
  const pool = getWooCommerceSigningPoolReferences();
  const candidates = [
    ...randomized(pool.filter((reference) => !used.has(reference))),
    ...randomized(pool.filter((reference) => used.has(reference))),
  ];
  if (candidates.length === 0) {
    throw new Error("signing_material_pool_exhausted");
  }

  let lastConflict: unknown;
  for (const reference of candidates) {
    try {
      const rows = await sql<ProvisioningRow[]>`
        select connection_public_id, key_version, signing_material_ref, outcome
        from loyalty_private.provision_woocommerce_connection(
          ${actorUserId}::uuid,
          ${command.workspaceId}::uuid,
          ${command.programmeId}::uuid,
          ${command.externalStoreId},
          ${command.displayName},
          ${reference},
          ${command.idempotencyKey},
          ${command.correlationId}::uuid
        )
      `;
      const row = rows[0];
      if (!row) throw new Error("connector_provisioning_unavailable");
      const result = merchantProvisionWooCommerceConnectionResultV1.parse({
        resourceId: row.connection_public_id,
        keyVersion: row.key_version,
        outcome: row.outcome,
      });
      const signingKey = Buffer.from(
        getWooCommerceSigningKey(row.signing_material_ref),
      ).toString("base64");
      const connectionPackage = wooCommerceConnectionPackageV1.parse({
        version: "1",
        endpoint,
        connectionId: result.resourceId,
        keyVersion: result.keyVersion,
        signingKey,
      });
      return { result, connectionPackage };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23514" &&
        "message" in error &&
        error.message === "connector signing material unavailable"
      ) {
        lastConflict = error;
        continue;
      }
      throw error;
    }
  }
  throw lastConflict ?? new Error("signing_material_pool_exhausted");
}
