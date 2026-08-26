import { z } from "zod";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const POSTGRES_BIGINT_MIN = -9_223_372_036_854_775_808n;

const exactNonNegativeInteger = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX, {
    message: "value exceeds PostgreSQL bigint",
  });

const exactSignedInteger = z
  .string()
  .regex(/^-?(?:0|[1-9][0-9]*)$/u)
  .refine(
    (value) => {
      const parsed = BigInt(value);
      return parsed >= POSTGRES_BIGINT_MIN && parsed <= POSTGRES_BIGINT_MAX;
    },
    { message: "value exceeds PostgreSQL bigint" },
  );

const safeReference = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.iso.datetime({ offset: true });

export const migrationSourceSystemV1 = z.enum([
  "generic_csv",
  "wployalty",
  "yith_points_and_rewards",
  "woorewards",
]);

export const migrationIdentityV1 = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("woocommerce_customer_id"),
      value: z.string().regex(/^[1-9][0-9]{0,19}$/u),
    })
    .strict(),
  z.object({ kind: z.literal("customer_public_id"), value: z.uuid() }).strict(),
  z
    .object({ kind: z.literal("source_customer_id"), value: safeReference })
    .strict(),
  z
    .object({
      kind: z.literal("email"),
      value: z
        .email()
        .max(254)
        .refine((value) => value === value.trim().toLowerCase(), {
          message: "email identity must be canonical lowercase",
        }),
    })
    .strict(),
]);

export const migrationPointLotV1 = z
  .object({
    sourceLotId: safeReference,
    bucket: z.enum(["available", "pending"]),
    points: exactNonNegativeInteger.refine((value) => value !== "0"),
    availableAt: timestamp,
    expiresAt: timestamp.nullable(),
  })
  .strict()
  .superRefine((lot, context) => {
    if (
      lot.expiresAt !== null &&
      Date.parse(lot.expiresAt) <= Date.parse(lot.availableAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "lot expiry must follow availability",
      });
    }
  });

const migrationBalanceV1 = z
  .object({
    availablePoints: exactNonNegativeInteger,
    pendingPoints: exactNonNegativeInteger,
    lots: z.array(migrationPointLotV1).max(50),
  })
  .strict()
  .superRefine((balance, context) => {
    if (
      new Set(balance.lots.map(({ sourceLotId }) => sourceLotId)).size !==
      balance.lots.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["lots"],
        message: "source lot IDs must be unique within a row",
      });
    }
  });

const migrationTierStateV1 = z
  .object({
    sourceTierCode: safeReference,
    qualifiedAt: timestamp.nullable(),
  })
  .strict();

const migrationReferralStateV1 = z
  .object({
    sourceReferralId: safeReference,
    state: z.enum(["active", "blocked", "closed"]),
  })
  .strict();

const migrationHistoryEntryV1 = z
  .object({
    sourceEntryId: safeReference,
    kind: z.enum([
      "award",
      "redeem",
      "expire",
      "reversal",
      "adjustment",
      "unknown",
    ]),
    deltaPoints: exactSignedInteger.refine((value) => value !== "0"),
    occurredAt: timestamp,
  })
  .strict();

export const canonicalMigrationRowV1 = z
  .object({
    sourceRowId: safeReference,
    identity: migrationIdentityV1,
    balance: migrationBalanceV1,
    tier: migrationTierStateV1.nullable(),
    referral: migrationReferralStateV1.nullable(),
    sourceHistory: z.array(migrationHistoryEntryV1).max(100),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      new Set(row.sourceHistory.map(({ sourceEntryId }) => sourceEntryId))
        .size !== row.sourceHistory.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceHistory"],
        message: "source history IDs must be unique within a row",
      });
    }
  });

export const migrationExpiryPolicyV1 = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("preserve_exact") }).strict(),
  z.object({ mode: z.literal("apply_default"), expiresAt: timestamp }).strict(),
]);

export const canonicalMigrationDocumentV1 = z
  .object({
    schemaVersion: z.literal("1"),
    source: z
      .object({
        system: migrationSourceSystemV1,
        exportId: safeReference,
        exportSha256: sha256Hex,
        exportedAt: timestamp,
      })
      .strict(),
    programmeGroupId: z.uuid(),
    programmeVersionId: z.uuid(),
    expiryPolicy: migrationExpiryPolicyV1,
    rows: z.array(canonicalMigrationRowV1).min(1).max(500),
  })
  .strict()
  .superRefine((document, context) => {
    if (
      new Set(document.rows.map(({ sourceRowId }) => sourceRowId)).size !==
      document.rows.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["rows"],
        message: "source row IDs must be unique",
      });
    }

    if (
      document.expiryPolicy.mode === "apply_default" &&
      Date.parse(document.expiryPolicy.expiresAt) <=
        Date.parse(document.source.exportedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiryPolicy", "expiresAt"],
        message: "default expiry must follow the source export",
      });
    }

    document.rows.forEach((row, rowIndex) => {
      const availableLots = row.balance.lots
        .filter(({ bucket }) => bucket === "available")
        .reduce((sum, { points }) => sum + BigInt(points), 0n);
      const pendingLots = row.balance.lots
        .filter(({ bucket }) => bucket === "pending")
        .reduce((sum, { points }) => sum + BigInt(points), 0n);

      if (document.expiryPolicy.mode === "preserve_exact") {
        if (availableLots !== BigInt(row.balance.availablePoints)) {
          context.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "balance", "lots"],
            message: "available lots must reconcile to the available balance",
          });
        }
        if (pendingLots !== BigInt(row.balance.pendingPoints)) {
          context.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "balance", "lots"],
            message: "pending lots must reconcile to the pending balance",
          });
        }
        row.balance.lots.forEach((lot, lotIndex) => {
          if (
            lot.bucket === "available" &&
            (Date.parse(lot.availableAt) >
              Date.parse(document.source.exportedAt) ||
              (lot.expiresAt !== null &&
                Date.parse(lot.expiresAt) <=
                  Date.parse(document.source.exportedAt)))
          ) {
            context.addIssue({
              code: "custom",
              path: ["rows", rowIndex, "balance", "lots", lotIndex],
              message: "available source lots must be live at export time",
            });
          }
          if (
            lot.bucket === "pending" &&
            Date.parse(lot.availableAt) <=
              Date.parse(document.source.exportedAt)
          ) {
            context.addIssue({
              code: "custom",
              path: ["rows", rowIndex, "balance", "lots", lotIndex],
              message: "pending source lots must become available after export",
            });
          }
        });
      } else {
        if (row.balance.lots.length !== 0) {
          context.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "balance", "lots"],
            message: "default expiry imports must not mix source lot evidence",
          });
        }
        if (row.balance.pendingPoints !== "0") {
          context.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "balance", "pendingPoints"],
            message: "pending balances require exact availability-lot evidence",
          });
        }
      }
    });

    const availableTotal = document.rows.reduce(
      (sum, row) => sum + BigInt(row.balance.availablePoints),
      0n,
    );
    const pendingTotal = document.rows.reduce(
      (sum, row) => sum + BigInt(row.balance.pendingPoints),
      0n,
    );
    if (
      availableTotal > POSTGRES_BIGINT_MAX ||
      pendingTotal > POSTGRES_BIGINT_MAX
    ) {
      context.addIssue({
        code: "custom",
        path: ["rows"],
        message: "migration batch totals exceed PostgreSQL bigint",
      });
    }
  });

export const migrationAdapterIdV1 = z.enum([
  "generic_csv_v1",
  "wployalty_csv_v1",
  "woorewards_json_v1",
]);

export const migrationAdapterContextV1 = z
  .object({
    schemaVersion: z.literal("1"),
    exportId: safeReference,
    exportedAt: timestamp,
    programmeGroupId: z.uuid(),
    programmeVersionId: z.uuid(),
    expiryPolicy: migrationExpiryPolicyV1,
  })
  .strict();

export const migrationAdapterIssueCodeV1 = z.enum([
  "empty_file",
  "file_too_large",
  "invalid_utf8",
  "invalid_line_ending",
  "invalid_csv",
  "invalid_json",
  "unsupported_header",
  "unsupported_property",
  "duplicate_property",
  "too_many_rows",
  "wrong_column_count",
  "formula_like_value",
  "invalid_field",
  "invalid_points",
  "duplicate_source_identity",
  "duplicate_source_row",
  "conflicting_source_row",
  "duplicate_lot",
  "invalid_document",
]);

export const migrationAdapterIssueFieldV1 = z.enum([
  "file",
  "header",
  "row",
  "object",
  "property",
  "email",
  "points",
  "referral_code",
  "source_row_id",
  "identity_kind",
  "identity_value",
  "available_points",
  "pending_points",
  "source_lot_id",
  "lot_bucket",
  "lot_points",
  "available_at",
  "expires_at",
  "source_tier_code",
  "tier_qualified_at",
  "source_referral_id",
  "referral_state",
]);

export const migrationAdapterIssueV1 = z
  .object({
    rowNumber: z.number().int().min(1).max(1_000_001),
    code: migrationAdapterIssueCodeV1,
    field: migrationAdapterIssueFieldV1,
  })
  .strict();

export const migrationAdapterResultV1 = z
  .object({
    schemaVersion: z.literal("1"),
    adapterId: migrationAdapterIdV1,
    adapterVersion: z.literal("1"),
    status: z.enum(["valid", "invalid"]),
    sourceExportSha256: sha256Hex.nullable(),
    inputBytes: z.number().int().min(0),
    physicalRowCount: z.number().int().min(0).max(25_001),
    rowCount: z.number().int().min(0).max(500),
    document: canonicalMigrationDocumentV1.nullable(),
    canonicalDocumentSha256: sha256Hex.nullable(),
    issueCount: z.number().int().min(0),
    truncatedIssueCount: z.number().int().min(0),
    issues: z.array(migrationAdapterIssueV1).max(100),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.issueCount !==
      result.issues.length + result.truncatedIssueCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["issueCount"],
        message: "adapter issue counts must reconcile",
      });
    }
    if (
      result.status === "valid" &&
      (result.sourceExportSha256 === null ||
        result.document === null ||
        result.canonicalDocumentSha256 === null ||
        result.issueCount !== 0 ||
        result.rowCount < 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "valid adapter results require a canonical document only",
      });
    }
    if (
      result.status === "invalid" &&
      (result.document !== null ||
        result.canonicalDocumentSha256 !== null ||
        result.issueCount < 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "invalid adapter results require minimized issues only",
      });
    }
    if (
      result.document !== null &&
      (result.sourceExportSha256 === null ||
        result.document.source.exportSha256 !== result.sourceExportSha256 ||
        result.document.rows.length !== result.rowCount)
    ) {
      context.addIssue({
        code: "custom",
        path: ["document"],
        message: "adapter result must reconcile to its canonical document",
      });
    }
  });

export const migrationAdapterSupportStatusV1 = z.enum([
  "supported",
  "fixture_required",
]);

export const migrationAdapterEvidenceKindV1 = z.enum([
  "internal_contract",
  "official_documentation",
  "owner_fixture_required",
]);

export const migrationAdapterRequiredExpiryPolicyV1 = z.enum([
  "merchant_selected",
  "apply_default",
]);

const migrationAdapterVersion = z.string().regex(/^[1-9][0-9]{0,5}$/u);

export const migrationAdapterRegistryEntryV1 = z
  .object({
    sourceSystem: migrationSourceSystemV1,
    supportStatus: migrationAdapterSupportStatusV1,
    adapterId: migrationAdapterIdV1.nullable(),
    adapterVersion: migrationAdapterVersion.nullable(),
    format: z.enum(["csv", "json"]),
    evidenceKind: migrationAdapterEvidenceKindV1,
    evidenceReference: z.string().trim().min(1).max(500),
    evidenceCheckedAt: z.iso.date(),
    referenceFixtureSha256: sha256Hex.nullable(),
    requiredExpiryPolicy: migrationAdapterRequiredExpiryPolicyV1.nullable(),
    maxInputBytes: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024)
      .nullable(),
    maxPhysicalRows: z.number().int().positive().max(25_000).nullable(),
    maxCanonicalRows: z.number().int().positive().max(500).nullable(),
  })
  .strict()
  .superRefine((entry, context) => {
    const parserFields = [
      entry.adapterId,
      entry.adapterVersion,
      entry.referenceFixtureSha256,
      entry.requiredExpiryPolicy,
      entry.maxInputBytes,
      entry.maxPhysicalRows,
      entry.maxCanonicalRows,
    ];
    if (
      entry.supportStatus === "supported" &&
      (parserFields.some((value) => value === null) ||
        entry.evidenceKind === "owner_fixture_required")
    ) {
      context.addIssue({
        code: "custom",
        path: ["supportStatus"],
        message: "supported adapters require complete reviewed parser evidence",
      });
    }
    if (
      entry.supportStatus === "fixture_required" &&
      (parserFields.some((value) => value !== null) ||
        entry.evidenceKind !== "owner_fixture_required")
    ) {
      context.addIssue({
        code: "custom",
        path: ["supportStatus"],
        message: "fixture-required sources cannot advertise parser authority",
      });
    }
  });

export const migrationAdapterRegistryV1 = z
  .object({
    schemaVersion: z.literal("1"),
    entries: z
      .array(migrationAdapterRegistryEntryV1)
      .length(migrationSourceSystemV1.options.length),
  })
  .strict()
  .superRefine((registry, context) => {
    const sourceSystems = registry.entries.map(
      ({ sourceSystem }) => sourceSystem,
    );
    if (new Set(sourceSystems).size !== sourceSystems.length) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: "migration adapter registry source systems must be unique",
      });
    }
    for (const sourceSystem of migrationSourceSystemV1.options) {
      if (!sourceSystems.includes(sourceSystem)) {
        context.addIssue({
          code: "custom",
          path: ["entries"],
          message: "migration adapter registry must cover every source system",
        });
      }
    }
    const supportedAdapterIds = registry.entries.flatMap(({ adapterId }) =>
      adapterId === null ? [] : [adapterId],
    );
    if (new Set(supportedAdapterIds).size !== supportedAdapterIds.length) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: "supported migration adapter IDs must be unique",
      });
    }
  });

const migrationAdapterSelector = z.string().regex(/^[a-z][a-z0-9_]{2,79}$/u);

export const resolveMigrationAdapterRequestV1 = z
  .object({
    schemaVersion: z.literal("1"),
    sourceSystem: migrationSourceSystemV1,
    requestedAdapterId: migrationAdapterSelector,
    requestedAdapterVersion: migrationAdapterVersion,
  })
  .strict();

export const migrationAdapterRefusalReasonV1 = z.enum([
  "source_fixture_required",
  "adapter_id_mismatch",
  "adapter_version_mismatch",
]);

const supportedMigrationAdapterBySourceV1 = {
  generic_csv: { adapterId: "generic_csv_v1", adapterVersion: "1" },
  wployalty: { adapterId: "wployalty_csv_v1", adapterVersion: "1" },
  yith_points_and_rewards: null,
  woorewards: { adapterId: "woorewards_json_v1", adapterVersion: "1" },
} as const;

export const resolveMigrationAdapterResultV1 = z
  .object({
    schemaVersion: z.literal("1"),
    registryVersion: z.literal("1"),
    sourceSystem: migrationSourceSystemV1,
    status: z.enum(["selected", "refused"]),
    adapterId: migrationAdapterIdV1.nullable(),
    adapterVersion: migrationAdapterVersion.nullable(),
    refusalReason: migrationAdapterRefusalReasonV1.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    const supported = supportedMigrationAdapterBySourceV1[result.sourceSystem];
    if (
      result.status === "selected" &&
      (result.adapterId === null ||
        result.adapterVersion === null ||
        result.refusalReason !== null ||
        supported === null ||
        supported.adapterId !== result.adapterId ||
        supported.adapterVersion !== result.adapterVersion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "selected migration adapters require an exact ID and version",
      });
    }
    if (
      result.status === "refused" &&
      (result.adapterId !== null ||
        result.adapterVersion !== null ||
        result.refusalReason === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "refused migration adapters expose only an allowlisted reason",
      });
    }
  });

export const migrationAdapterExecutionResultV1 = z
  .object({
    schemaVersion: z.literal("1"),
    selection: resolveMigrationAdapterResultV1,
    adapterResult: migrationAdapterResultV1.nullable(),
  })
  .strict()
  .superRefine((execution, context) => {
    if (
      execution.selection.status === "refused" &&
      execution.adapterResult !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterResult"],
        message: "refused selections cannot parse a source",
      });
    }
    if (
      execution.selection.status === "selected" &&
      (execution.adapterResult === null ||
        execution.selection.adapterId !== execution.adapterResult.adapterId ||
        execution.selection.adapterVersion !==
          execution.adapterResult.adapterVersion)
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterResult"],
        message:
          "adapter execution must match the exact selected ID and version",
      });
    }
  });

export const migrationIdentityResolutionV1 = z
  .object({
    sourceRowId: safeReference,
    identitySha256: sha256Hex,
    outcome: z.enum([
      "matched_existing",
      "create_new",
      "unresolved",
      "ambiguous",
    ]),
    basis: z
      .enum(["verified_woocommerce_id", "explicit_customer", "explicit_create"])
      .nullable(),
    targetCustomerId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((resolution, context) => {
    if (
      resolution.outcome === "matched_existing" &&
      (resolution.targetCustomerId === null ||
        !["verified_woocommerce_id", "explicit_customer"].includes(
          resolution.basis ?? "",
        ))
    ) {
      context.addIssue({
        code: "custom",
        message: "existing matches require an explicit or verified target",
      });
    }
    if (
      resolution.outcome === "create_new" &&
      (resolution.targetCustomerId !== null ||
        resolution.basis !== "explicit_create")
    ) {
      context.addIssue({
        code: "custom",
        message: "new customers require an explicit create decision",
      });
    }
    if (
      ["unresolved", "ambiguous"].includes(resolution.outcome) &&
      (resolution.targetCustomerId !== null || resolution.basis !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "unresolved identities cannot carry target authority",
      });
    }
  });

export const migrationDryRunInputV1 = z
  .object({
    document: canonicalMigrationDocumentV1,
    resolutions: z.array(migrationIdentityResolutionV1).max(500),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.resolutions.map(({ sourceRowId }) => sourceRowId)).size !==
      input.resolutions.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolutions"],
        message: "each source row may have only one resolution",
      });
    }
  });

export const migrationDryRunIssueCodeV1 = z.enum([
  "missing_resolution",
  "unknown_source_row",
  "identity_fingerprint_mismatch",
  "duplicate_source_identity",
  "duplicate_target_customer",
  "unresolved_identity",
  "ambiguous_identity",
]);

export const migrationDryRunResultV1 = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["valid", "invalid"]),
    sourceSystem: migrationSourceSystemV1,
    sourceExportSha256: sha256Hex,
    canonicalDocumentSha256: sha256Hex,
    resolutionSha256: sha256Hex,
    engineSha256: sha256Hex,
    rowCount: z.number().int().min(1).max(500),
    matchedCount: z.number().int().min(0).max(500),
    createCount: z.number().int().min(0).max(500),
    unresolvedCount: z.number().int().min(0).max(500),
    availablePoints: exactNonNegativeInteger,
    pendingPoints: exactNonNegativeInteger,
    issueCounts: z.partialRecord(
      migrationDryRunIssueCodeV1,
      z.number().int().positive(),
    ),
    issues: z
      .array(
        z
          .object({
            code: migrationDryRunIssueCodeV1,
            sourceRowId: safeReference,
          })
          .strict(),
      )
      .max(2500),
  })
  .strict()
  .superRefine((result, context) => {
    if ((result.issues.length === 0) !== (result.status === "valid")) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "dry-run status must match the issue set",
      });
    }
    if (
      result.matchedCount + result.createCount + result.unresolvedCount !==
      result.rowCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["rowCount"],
        message: "dry-run disposition counts must reconcile",
      });
    }
    const countedIssues = Object.values(result.issueCounts).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    );
    if (countedIssues !== result.issues.length) {
      context.addIssue({
        code: "custom",
        path: ["issueCounts"],
        message: "dry-run issue counts must reconcile to issue evidence",
      });
    }
  });

export const recordMigrationDryRunCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    programmeGroupId: z.uuid(),
    programmeVersionId: z.uuid(),
    result: migrationDryRunResultV1,
    idempotencyKey: safeReference,
    correlationId: z.uuid(),
  })
  .strict();

export const recordMigrationDryRunResultV1 = z
  .object({
    dryRunId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    status: z.enum(["valid", "invalid"]),
    approvalSha256: sha256Hex,
  })
  .strict();

export const applyMigrationOpeningBalanceCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    dryRunId: z.uuid(),
    approvalSha256: sha256Hex,
    document: canonicalMigrationDocumentV1,
    resolutions: z.array(migrationIdentityResolutionV1).min(1).max(500),
    commerceConnectionId: z.uuid().nullable(),
    idempotencyKey: safeReference,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.resolutions.length !== command.document.rows.length) {
      context.addIssue({
        code: "custom",
        path: ["resolutions"],
        message: "application requires exactly one resolution per source row",
      });
    }
    if (
      command.resolutions.some(({ outcome }) =>
        ["unresolved", "ambiguous"].includes(outcome),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolutions"],
        message: "unresolved identities cannot enter value application",
      });
    }
    if (
      command.resolutions.some(
        ({ basis }) => basis === "verified_woocommerce_id",
      ) &&
      command.commerceConnectionId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["commerceConnectionId"],
        message: "verified WooCommerce resolutions require a store connection",
      });
    }
  });

export const applyMigrationOpeningBalanceResultV1 = z
  .object({
    batchId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    customerCount: z.number().int().min(1).max(500),
    createdCustomerCount: z.number().int().min(0).max(500),
    availablePoints: exactNonNegativeInteger,
    pendingPoints: exactNonNegativeInteger,
  })
  .strict();

export const compensateMigrationBatchCommandV1 = z
  .object({
    schemaVersion: z.literal("1"),
    batchId: z.uuid(),
    reason: z.string().trim().min(8).max(500),
    idempotencyKey: safeReference,
    correlationId: z.uuid(),
  })
  .strict();

export const compensateMigrationBatchResultV1 = z
  .object({
    correctionBatchId: z.uuid(),
    originalBatchId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    correctedPoints: exactNonNegativeInteger,
  })
  .strict();

export type CanonicalMigrationDocumentV1 = z.infer<
  typeof canonicalMigrationDocumentV1
>;
export type MigrationAdapterIdV1 = z.infer<typeof migrationAdapterIdV1>;
export type MigrationAdapterContextV1 = z.infer<
  typeof migrationAdapterContextV1
>;
export type MigrationAdapterIssueCodeV1 = z.infer<
  typeof migrationAdapterIssueCodeV1
>;
export type MigrationAdapterIssueFieldV1 = z.infer<
  typeof migrationAdapterIssueFieldV1
>;
export type MigrationAdapterIssueV1 = z.infer<typeof migrationAdapterIssueV1>;
export type MigrationAdapterResultV1 = z.infer<typeof migrationAdapterResultV1>;
export type MigrationAdapterSupportStatusV1 = z.infer<
  typeof migrationAdapterSupportStatusV1
>;
export type MigrationAdapterRegistryEntryV1 = z.infer<
  typeof migrationAdapterRegistryEntryV1
>;
export type MigrationAdapterRegistryV1 = z.infer<
  typeof migrationAdapterRegistryV1
>;
export type ResolveMigrationAdapterRequestV1 = z.infer<
  typeof resolveMigrationAdapterRequestV1
>;
export type MigrationAdapterRefusalReasonV1 = z.infer<
  typeof migrationAdapterRefusalReasonV1
>;
export type ResolveMigrationAdapterResultV1 = z.infer<
  typeof resolveMigrationAdapterResultV1
>;
export type MigrationAdapterExecutionResultV1 = z.infer<
  typeof migrationAdapterExecutionResultV1
>;
export type MigrationIdentityResolutionV1 = z.infer<
  typeof migrationIdentityResolutionV1
>;
export type MigrationDryRunInputV1 = z.infer<typeof migrationDryRunInputV1>;
export type MigrationDryRunIssueCodeV1 = z.infer<
  typeof migrationDryRunIssueCodeV1
>;
export type MigrationDryRunResultV1 = z.infer<typeof migrationDryRunResultV1>;
export type RecordMigrationDryRunCommandV1 = z.infer<
  typeof recordMigrationDryRunCommandV1
>;
export type ApplyMigrationOpeningBalanceCommandV1 = z.infer<
  typeof applyMigrationOpeningBalanceCommandV1
>;
export type ApplyMigrationOpeningBalanceResultV1 = z.infer<
  typeof applyMigrationOpeningBalanceResultV1
>;
export type CompensateMigrationBatchCommandV1 = z.infer<
  typeof compensateMigrationBatchCommandV1
>;
export type CompensateMigrationBatchResultV1 = z.infer<
  typeof compensateMigrationBatchResultV1
>;
