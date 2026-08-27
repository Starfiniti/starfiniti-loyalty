import {
  migrationAdapterExecutionResultV1,
  migrationAdapterRegistryV1 as migrationAdapterRegistrySchemaV1,
  resolveMigrationAdapterRequestV1,
  resolveMigrationAdapterResultV1,
  type MigrationAdapterRefusalReasonV1,
  type MigrationAdapterExecutionResultV1,
  type MigrationAdapterRegistryV1,
  type ResolveMigrationAdapterResultV1,
} from "@starfiniti/contracts/migration";

import {
  adaptGenericMigrationCsvV1,
  adaptWooRewardsJsonV1,
  adaptWPLoyaltyCsvV1,
  genericMigrationCsvHeaderV1,
  migrationAdapterLimitsV1,
  migrationAdapterIssuesCsvV1,
  type MigrationAdapterSha256V1,
} from "./migration-adapters-v1";

export {
  genericMigrationCsvHeaderV1,
  migrationAdapterIssuesCsvV1,
  type MigrationAdapterSha256V1,
};

export const migrationAdapterRegistryV1: MigrationAdapterRegistryV1 =
  migrationAdapterRegistrySchemaV1.parse({
    schemaVersion: "1",
    entries: [
      {
        sourceSystem: "generic_csv",
        supportStatus: "supported",
        adapterId: "generic_csv_v1",
        adapterVersion: "1",
        format: "csv",
        evidenceKind: "internal_contract",
        evidenceReference: "docs/integrations/MIGRATIONS.md",
        evidenceCheckedAt: "2026-08-26",
        referenceFixtureSha256:
          "a49d1de9cfaf2817a83bfaa93186ab31169ae538683b968e31ff559c3ae03547",
        requiredExpiryPolicy: "merchant_selected",
        maxInputBytes: migrationAdapterLimitsV1.maxInputBytes,
        maxPhysicalRows: migrationAdapterLimitsV1.maxPhysicalRows.genericCsv,
        maxCanonicalRows: migrationAdapterLimitsV1.maxCanonicalRows,
      },
      {
        sourceSystem: "wployalty",
        supportStatus: "supported",
        adapterId: "wployalty_csv_v1",
        adapterVersion: "1",
        format: "csv",
        evidenceKind: "official_documentation",
        evidenceReference:
          "https://docs.wployalty.net/customers-levels-and-vip/importing-customers-and-points",
        evidenceCheckedAt: "2026-08-26",
        referenceFixtureSha256:
          "ce587afa3e1f4d07d8f9b2b1974e878b9cae48e04ad3200c4e4c2d6cfcc28323",
        requiredExpiryPolicy: "apply_default",
        maxInputBytes: migrationAdapterLimitsV1.maxInputBytes,
        maxPhysicalRows: migrationAdapterLimitsV1.maxPhysicalRows.wployaltyCsv,
        maxCanonicalRows: migrationAdapterLimitsV1.maxCanonicalRows,
      },
      {
        sourceSystem: "yith_points_and_rewards",
        supportStatus: "fixture_required",
        adapterId: null,
        adapterVersion: null,
        format: "csv",
        evidenceKind: "owner_fixture_required",
        evidenceReference:
          "https://yithemes.com/themes/plugins/yith-woocommerce-points-and-rewards/",
        evidenceCheckedAt: "2026-08-26",
        referenceFixtureSha256: null,
        requiredExpiryPolicy: null,
        maxInputBytes: null,
        maxPhysicalRows: null,
        maxCanonicalRows: null,
      },
      {
        sourceSystem: "woorewards",
        supportStatus: "supported",
        adapterId: "woorewards_json_v1",
        adapterVersion: "1",
        format: "json",
        evidenceKind: "official_documentation",
        evidenceReference:
          "https://plugins.longwatchstudio.com/kb/data-management/",
        evidenceCheckedAt: "2026-08-26",
        referenceFixtureSha256:
          "4b527fd1961bb88d859be9df6a8d3aa0c9e1df835e1ceddae8cbbf923e439bf5",
        requiredExpiryPolicy: "apply_default",
        maxInputBytes: migrationAdapterLimitsV1.maxInputBytes,
        maxPhysicalRows:
          migrationAdapterLimitsV1.maxPhysicalRows.woorewardsJson,
        maxCanonicalRows: migrationAdapterLimitsV1.maxCanonicalRows,
      },
    ],
  });

function refusal(
  sourceSystem: ResolveMigrationAdapterResultV1["sourceSystem"],
  refusalReason: MigrationAdapterRefusalReasonV1,
): ResolveMigrationAdapterResultV1 {
  return resolveMigrationAdapterResultV1.parse({
    schemaVersion: "1",
    registryVersion: "1",
    sourceSystem,
    status: "refused",
    adapterId: null,
    adapterVersion: null,
    refusalReason,
  });
}

export function resolveMigrationAdapterV1(
  untrustedRequest: unknown,
): ResolveMigrationAdapterResultV1 {
  const request = resolveMigrationAdapterRequestV1.parse(untrustedRequest);
  const entry = migrationAdapterRegistryV1.entries.find(
    ({ sourceSystem }) => sourceSystem === request.sourceSystem,
  );
  if (entry === undefined) {
    throw new Error("migration adapter registry is incomplete");
  }
  if (entry.supportStatus === "fixture_required") {
    return refusal(request.sourceSystem, "source_fixture_required");
  }
  if (entry.adapterId !== request.requestedAdapterId) {
    return refusal(request.sourceSystem, "adapter_id_mismatch");
  }
  if (entry.adapterVersion !== request.requestedAdapterVersion) {
    return refusal(request.sourceSystem, "adapter_version_mismatch");
  }
  return resolveMigrationAdapterResultV1.parse({
    schemaVersion: "1",
    registryVersion: "1",
    sourceSystem: request.sourceSystem,
    status: "selected",
    adapterId: entry.adapterId,
    adapterVersion: entry.adapterVersion,
    refusalReason: null,
  });
}

export function adaptMigrationSourceV1(
  untrustedRequest: unknown,
  input: Uint8Array,
  untrustedContext: unknown,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterExecutionResultV1 {
  const selection = resolveMigrationAdapterV1(untrustedRequest);
  if (selection.status === "refused") {
    return migrationAdapterExecutionResultV1.parse({
      schemaVersion: "1",
      selection,
      adapterResult: null,
    });
  }

  let adapterResult;
  switch (selection.adapterId) {
    case "generic_csv_v1":
      adapterResult = adaptGenericMigrationCsvV1(
        input,
        untrustedContext,
        sha256,
      );
      break;
    case "wployalty_csv_v1":
      adapterResult = adaptWPLoyaltyCsvV1(input, untrustedContext, sha256);
      break;
    case "woorewards_json_v1":
      adapterResult = adaptWooRewardsJsonV1(input, untrustedContext, sha256);
      break;
    default:
      throw new Error("selected migration adapter is not executable");
  }

  return migrationAdapterExecutionResultV1.parse({
    schemaVersion: "1",
    selection,
    adapterResult,
  });
}
