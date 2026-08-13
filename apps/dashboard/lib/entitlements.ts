import {
  entitlementSnapshotV1,
  type EntitlementCapabilityKey,
  type EntitlementSnapshotV1,
} from "@starfiniti/contracts";

export type EntitlementRow = Readonly<Record<string, unknown>>;

export function parseEntitlementSnapshot(
  rows: readonly EntitlementRow[],
  expectedOrganizationId: string,
): EntitlementSnapshotV1 {
  if (rows.length === 0) throw new Error("entitlement_snapshot_empty");
  const capabilities = rows.map((row) => ({
    schemaVersion: row.schema_version,
    organizationId: row.organization_public_id,
    deploymentMode: row.deployment_mode,
    catalogueVersion: row.catalogue_version,
    capabilityKey: row.capability_key,
    enabled: row.enabled,
    protectedValuePath: row.protected_value_path,
    limitValue: row.limit_value,
    rolloutBasisPoints: row.rollout_basis_points,
    source: row.source,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
  }));
  const first = capabilities[0];
  const uniqueKeys = new Set(
    capabilities.map(({ capabilityKey }) => capabilityKey),
  );
  if (
    !first ||
    first.organizationId !== expectedOrganizationId ||
    uniqueKeys.size !== capabilities.length ||
    capabilities.some(
      (capability) =>
        capability.organizationId !== first.organizationId ||
        capability.deploymentMode !== first.deploymentMode ||
        capability.catalogueVersion !== first.catalogueVersion,
    )
  ) {
    throw new Error("entitlement_snapshot_inconsistent");
  }
  return entitlementSnapshotV1.parse({
    schemaVersion: "1",
    organizationId: first.organizationId,
    deploymentMode: first.deploymentMode,
    catalogueVersion: first.catalogueVersion,
    capabilities,
  });
}

export function hasEntitlement(
  snapshot: EntitlementSnapshotV1,
  capabilityKey: EntitlementCapabilityKey,
): boolean {
  return (
    snapshot.capabilities.find(
      (capability) => capability.capabilityKey === capabilityKey,
    )?.enabled ?? false
  );
}
