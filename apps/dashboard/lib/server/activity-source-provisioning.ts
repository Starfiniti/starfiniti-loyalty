import "server-only";
import { randomInt } from "node:crypto";
import {
  merchantActivitySourcePackageV1,
  merchantProvisionActivitySourceResultV1,
  type MerchantActivitySourcePackageV1,
  type MerchantProvisionActivitySourceCommandV1,
} from "@starfiniti/contracts";
import { getDatabase } from "./database";
import { getSigningKey, getSigningPoolReferences } from "./signing-material";

type ProvisioningRow = Readonly<{
  source_public_id: string;
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

export async function provisionMerchantActivitySource(
  actorUserId: string,
  command: MerchantProvisionActivitySourceCommandV1,
  endpoint: string,
): Promise<
  Readonly<{
    result: ReturnType<typeof merchantProvisionActivitySourceResultV1.parse>;
    sourcePackage: MerchantActivitySourcePackageV1;
  }>
> {
  const sql = getDatabase();
  const usedRows = await sql<ReadonlyArray<{ signing_material_ref: string }>>`
    select signing_material_ref from loyalty.commerce_connections
  `;
  const used = new Set(usedRows.map((row) => row.signing_material_ref));
  const pool = getSigningPoolReferences();
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
        select source_public_id, key_version, signing_material_ref, outcome
        from loyalty_private.provision_merchant_activity_source(
          ${actorUserId}::uuid,
          ${command.workspaceId}::uuid,
          ${command.programmeId}::uuid,
          ${command.displayName},
          ${reference},
          ${command.idempotencyKey},
          ${command.correlationId}::uuid
        )
      `;
      const row = rows[0];
      if (!row) throw new Error("activity_source_provisioning_unavailable");
      const result = merchantProvisionActivitySourceResultV1.parse({
        resourceId: row.source_public_id,
        keyVersion: row.key_version,
        outcome: row.outcome,
      });
      const sourcePackage = merchantActivitySourcePackageV1.parse({
        version: "1",
        endpoint,
        sourceId: result.resourceId,
        keyVersion: result.keyVersion,
        signingKey: Buffer.from(
          getSigningKey(row.signing_material_ref),
        ).toString("base64"),
      });
      return { result, sourcePackage };
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
