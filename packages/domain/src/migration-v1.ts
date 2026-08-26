import {
  migrationDryRunInputV1,
  migrationDryRunResultV1,
  type MigrationDryRunInputV1,
  type MigrationDryRunIssueCodeV1,
  type MigrationDryRunResultV1,
} from "@starfiniti/contracts/migration";

export type MigrationSha256 = (canonicalValue: string) => string;

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function hashCanonical(sha256: MigrationSha256, value: unknown): string {
  const digest = sha256(canonicalJson(value as CanonicalValue));
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error("migration SHA-256 provider returned an invalid digest");
  }
  return digest;
}

function compareOpaqueReferences(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function fingerprintMigrationIdentityV1(
  identity: MigrationDryRunInputV1["document"]["rows"][number]["identity"],
  sha256: MigrationSha256,
): string {
  return hashCanonical(sha256, { schemaVersion: "1", identity });
}

export function previewMigrationDryRunV1(
  untrustedInput: unknown,
  sha256: MigrationSha256,
): MigrationDryRunResultV1 {
  const input = migrationDryRunInputV1.parse(untrustedInput);
  const document = {
    ...input.document,
    rows: [...input.document.rows]
      .sort((left, right) =>
        compareOpaqueReferences(left.sourceRowId, right.sourceRowId),
      )
      .map((row) => ({
        ...row,
        balance: {
          ...row.balance,
          lots: [...row.balance.lots].sort((left, right) =>
            compareOpaqueReferences(left.sourceLotId, right.sourceLotId),
          ),
        },
        sourceHistory: [...row.sourceHistory].sort((left, right) =>
          compareOpaqueReferences(left.sourceEntryId, right.sourceEntryId),
        ),
      })),
  };
  const canonicalResolutions = [...input.resolutions].sort((left, right) =>
    compareOpaqueReferences(left.sourceRowId, right.sourceRowId),
  );
  const issues: Array<{
    code: MigrationDryRunIssueCodeV1;
    sourceRowId: string;
  }> = [];
  const issueCounts = new Map<MigrationDryRunIssueCodeV1, number>();
  const addIssue = (
    code: MigrationDryRunIssueCodeV1,
    sourceRowId: string,
  ): void => {
    issueCounts.set(code, (issueCounts.get(code) ?? 0) + 1);
    if (issues.length < 2500) {
      issues.push({ code, sourceRowId });
    }
  };

  const rowIds = new Set(document.rows.map(({ sourceRowId }) => sourceRowId));
  const resolutionByRow = new Map(
    canonicalResolutions.map((resolution) => [
      resolution.sourceRowId,
      resolution,
    ]),
  );

  for (const resolution of canonicalResolutions) {
    if (!rowIds.has(resolution.sourceRowId)) {
      addIssue("unknown_source_row", resolution.sourceRowId);
    }
  }

  const identityRows = new Map<string, string[]>();
  for (const row of document.rows) {
    const identitySha256 = fingerprintMigrationIdentityV1(row.identity, sha256);
    const relatedRows = identityRows.get(identitySha256) ?? [];
    relatedRows.push(row.sourceRowId);
    identityRows.set(identitySha256, relatedRows);
  }
  for (const relatedRows of identityRows.values()) {
    if (relatedRows.length > 1) {
      for (const sourceRowId of relatedRows) {
        addIssue("duplicate_source_identity", sourceRowId);
      }
    }
  }

  const targetRows = new Map<string, string[]>();
  let matchedCount = 0;
  let createCount = 0;
  let unresolvedCount = 0;

  for (const row of document.rows) {
    const resolution = resolutionByRow.get(row.sourceRowId);
    if (resolution === undefined) {
      unresolvedCount += 1;
      addIssue("missing_resolution", row.sourceRowId);
      continue;
    }

    const expectedIdentitySha256 = fingerprintMigrationIdentityV1(
      row.identity,
      sha256,
    );
    if (resolution.identitySha256 !== expectedIdentitySha256) {
      addIssue("identity_fingerprint_mismatch", row.sourceRowId);
    }

    switch (resolution.outcome) {
      case "matched_existing": {
        matchedCount += 1;
        const targetCustomerId = resolution.targetCustomerId;
        if (targetCustomerId !== null) {
          const relatedRows = targetRows.get(targetCustomerId) ?? [];
          relatedRows.push(row.sourceRowId);
          targetRows.set(targetCustomerId, relatedRows);
        }
        break;
      }
      case "create_new":
        createCount += 1;
        break;
      case "unresolved":
        unresolvedCount += 1;
        addIssue("unresolved_identity", row.sourceRowId);
        break;
      case "ambiguous":
        unresolvedCount += 1;
        addIssue("ambiguous_identity", row.sourceRowId);
        break;
    }
  }

  for (const relatedRows of targetRows.values()) {
    if (relatedRows.length > 1) {
      for (const sourceRowId of relatedRows) {
        addIssue("duplicate_target_customer", sourceRowId);
      }
    }
  }

  const availablePoints = document.rows.reduce(
    (sum, row) => sum + BigInt(row.balance.availablePoints),
    0n,
  );
  const pendingPoints = document.rows.reduce(
    (sum, row) => sum + BigInt(row.balance.pendingPoints),
    0n,
  );
  const canonicalDocumentSha256 = hashCanonical(sha256, document);
  const resolutionSha256 = hashCanonical(sha256, canonicalResolutions);
  const status = issues.length === 0 ? "valid" : "invalid";
  const engineSha256 = hashCanonical(sha256, {
    schemaVersion: "1",
    canonicalDocumentSha256,
    resolutionSha256,
    programmeGroupId: document.programmeGroupId,
    programmeVersionId: document.programmeVersionId,
    expiryPolicy: document.expiryPolicy,
    rowCount: document.rows.length,
    matchedCount,
    createCount,
    unresolvedCount,
    availablePoints: availablePoints.toString(),
    pendingPoints: pendingPoints.toString(),
    status,
    issues,
  });

  return migrationDryRunResultV1.parse({
    schemaVersion: "1",
    status,
    sourceSystem: document.source.system,
    sourceExportSha256: document.source.exportSha256,
    canonicalDocumentSha256,
    resolutionSha256,
    engineSha256,
    rowCount: document.rows.length,
    matchedCount,
    createCount,
    unresolvedCount,
    availablePoints: availablePoints.toString(),
    pendingPoints: pendingPoints.toString(),
    issueCounts: Object.fromEntries(issueCounts),
    issues,
  });
}
