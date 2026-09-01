"use server";

import { createHash } from "node:crypto";
import {
  applyMigrationOpeningBalanceCommandV1,
  applyMigrationOpeningBalanceResultV1,
  compensateMigrationBatchCommandV1,
  compensateMigrationBatchResultV1,
  migrationSourceInspectionV1,
  migrationSourceSystemV1,
  migrationWorkflowMappingV1,
  recordMigrationDryRunCommandV1,
  recordMigrationDryRunResultV1,
  type MigrationAdapterIssueV1,
  type MigrationDryRunResultV1,
  type MigrationSourceInspectionV1,
  type MigrationWorkflowMappingV1,
} from "@starfiniti/contracts";
import {
  adaptMigrationSourceV1,
  canonicalizeMigrationApplicationV1,
  fingerprintMigrationIdentityV1,
  migrationAdapterRegistryV1,
  previewMigrationDryRunV1,
} from "@starfiniti/domain";
import { revalidatePath } from "next/cache";
import { hasEntitlement } from "@/lib/entitlements";
import { getEntitlementSnapshot } from "@/lib/server/entitlements";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionFailure = Readonly<{ kind: "error"; message: string }>;

export type MigrationInspectionActionState =
  | ActionFailure
  | Readonly<{
      kind: "invalid";
      message: string;
      issueCount: number;
      truncatedIssueCount: number;
      issues: readonly MigrationAdapterIssueV1[];
    }>
  | Readonly<{
      kind: "ready";
      message: string;
      inspection: MigrationSourceInspectionV1;
    }>;

export type MigrationDryRunActionState =
  | ActionFailure
  | Readonly<{
      kind: "ready";
      message: string;
      receipt: Readonly<{
        dryRunId: string;
        approvalSha256: string;
        outcome: "created" | "duplicate";
      }>;
      result: MigrationDryRunResultV1;
    }>;

export type MigrationApplyActionState =
  | ActionFailure
  | Readonly<{
      kind: "success";
      message: string;
      batchId: string;
    }>;

export type MigrationCorrectionActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const sha256 = {
  bytes(value: Uint8Array): string {
    return createHash("sha256").update(value).digest("hex");
  },
  text(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  },
};

type ActiveMigrationScope = Readonly<{
  programmeGroupId: string;
  programmeVersionId: string;
}>;

type ParsedSource = Readonly<{
  document: NonNullable<
    NonNullable<
      ReturnType<typeof adaptMigrationSourceV1>["adapterResult"]
    >["document"]
  >;
  adapterId: MigrationSourceInspectionV1["adapterId"];
  adapterVersion: string;
  inputBytes: number;
  sourceExportSha256: string;
}>;

const failure = (message: string): ActionFailure => ({
  kind: "error",
  message,
});

async function activeMigrationScope(): Promise<
  ActiveMigrationScope | ActionFailure
> {
  const tenant = await getAuthenticatedTenantState();
  if (
    tenant.kind !== "ready" ||
    !tenant.context.programmeGroup ||
    !["owner", "admin"].includes(tenant.context.membershipRole)
  ) {
    return failure(
      "A live owner or admin membership is required for migration operations.",
    );
  }
  const [entitlements, programme] = await Promise.all([
    getEntitlementSnapshot(tenant.context),
    getMerchantProgrammeState(tenant.context),
  ]);
  if (!hasEntitlement(entitlements, "migration")) {
    return failure(
      "Migration writes are disabled for this organization. Existing evidence remains available below.",
    );
  }
  const published = programme.versions.find(
    (version) => version.status === "published",
  );
  if (!published) {
    return failure("Publish a loyalty programme before importing value.");
  }
  return {
    programmeGroupId: tenant.context.programmeGroup.public_id,
    programmeVersionId: published.id,
  };
}

async function mayCorrectMigration(): Promise<true | ActionFailure> {
  const tenant = await getAuthenticatedTenantState();
  if (
    tenant.kind !== "ready" ||
    !["owner", "admin"].includes(tenant.context.membershipRole)
  ) {
    return failure(
      "A live owner or admin membership is required for compensating corrections.",
    );
  }
  return true;
}

async function parseSource(
  formData: FormData,
): Promise<ParsedSource | MigrationInspectionActionState> {
  const scope = await activeMigrationScope();
  if ("kind" in scope) return scope;
  const sourceSystem = migrationSourceSystemV1.safeParse(
    formData.get("sourceSystem"),
  );
  if (!sourceSystem.success) return failure("Choose a supported source.");
  const registryEntry = migrationAdapterRegistryV1.entries.find(
    (entry) => entry.sourceSystem === sourceSystem.data,
  );
  if (
    !registryEntry ||
    registryEntry.supportStatus !== "supported" ||
    !registryEntry.adapterId ||
    !registryEntry.adapterVersion
  ) {
    return failure(
      "This source has no reviewed export format yet. No upload was parsed.",
    );
  }
  const sourceFile = formData.get("sourceFile");
  if (
    !sourceFile ||
    typeof sourceFile !== "object" ||
    !("arrayBuffer" in sourceFile) ||
    typeof sourceFile.arrayBuffer !== "function"
  ) {
    return failure("Choose the exact export file to continue.");
  }
  const exportId = String(formData.get("exportId") ?? "");
  const exportedAt = isoInstant(formData.get("exportedAt"));
  const expiryMode = String(formData.get("expiryMode") ?? "");
  const expiresAt = isoInstant(formData.get("expiresAt"));
  if (!exportedAt) {
    return failure("Enter the export time with an explicit time zone.");
  }
  const expiryPolicy =
    expiryMode === "preserve_exact"
      ? { mode: "preserve_exact" as const }
      : expiresAt
        ? { mode: "apply_default" as const, expiresAt }
        : null;
  if (
    !expiryPolicy ||
    (registryEntry.requiredExpiryPolicy === "apply_default" &&
      expiryPolicy.mode !== "apply_default")
  ) {
    return failure(
      "Choose a default expiry for this source. It does not contain exact lot evidence.",
    );
  }
  const bytes = new Uint8Array(await sourceFile.arrayBuffer());
  const execution = adaptMigrationSourceV1(
    {
      schemaVersion: "1",
      sourceSystem: sourceSystem.data,
      requestedAdapterId: registryEntry.adapterId,
      requestedAdapterVersion: registryEntry.adapterVersion,
    },
    bytes,
    {
      schemaVersion: "1",
      exportId,
      exportedAt,
      programmeGroupId: scope.programmeGroupId,
      programmeVersionId: scope.programmeVersionId,
      expiryPolicy,
    },
    sha256,
  );
  const adapter = execution.adapterResult;
  if (!adapter) {
    return failure("The selected source format is unavailable.");
  }
  if (
    adapter.status !== "valid" ||
    !adapter.document ||
    !adapter.sourceExportSha256
  ) {
    return {
      kind: "invalid",
      message:
        "The export failed strict structural validation. No customer or value evidence was stored.",
      issueCount: adapter.issueCount,
      truncatedIssueCount: adapter.truncatedIssueCount,
      issues: adapter.issues,
    };
  }
  return {
    document: adapter.document,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    inputBytes: adapter.inputBytes,
    sourceExportSha256: adapter.sourceExportSha256,
  };
}

export async function inspectMigrationSource(
  formData: FormData,
): Promise<MigrationInspectionActionState> {
  try {
    const parsed = await parseSource(formData);
    if ("kind" in parsed) return parsed;
    const availablePoints = parsed.document.rows.reduce(
      (sum, row) => sum + BigInt(row.balance.availablePoints),
      0n,
    );
    const pendingPoints = parsed.document.rows.reduce(
      (sum, row) => sum + BigInt(row.balance.pendingPoints),
      0n,
    );
    const inspection = migrationSourceInspectionV1.parse({
      schemaVersion: "1",
      sourceSystem: parsed.document.source.system,
      adapterId: parsed.adapterId,
      adapterVersion: parsed.adapterVersion,
      sourceExportSha256: parsed.sourceExportSha256,
      inputBytes: parsed.inputBytes,
      rowCount: parsed.document.rows.length,
      availablePoints: availablePoints.toString(),
      pendingPoints: pendingPoints.toString(),
      rows: parsed.document.rows.map((row) => ({
        sourceRowId: row.sourceRowId,
        identity: row.identity,
        availablePoints: row.balance.availablePoints,
        pendingPoints: row.balance.pendingPoints,
      })),
    });
    return {
      kind: "ready",
      message:
        "Source inspected in memory. Choose an explicit destination for every row before recording a dry run.",
      inspection,
    };
  } catch {
    return failure(
      "The export could not be inspected safely. No source data was retained.",
    );
  }
}

export async function recordMigrationDryRun(
  formData: FormData,
): Promise<MigrationDryRunActionState> {
  try {
    const parsed = await parseSource(formData);
    if ("kind" in parsed) return failure(parsed.message);
    const mappings = parseMappings(formData, parsed.document.rows.length);
    if (!mappings) {
      return failure("Choose one explicit destination for every source row.");
    }
    const resolutions = parsed.document.rows.map((row) => {
      const mapping = mappings.get(row.sourceRowId);
      if (!mapping) {
        return {
          sourceRowId: row.sourceRowId,
          identitySha256: fingerprintMigrationIdentityV1(
            row.identity,
            sha256.text,
          ),
          outcome: "unresolved" as const,
          basis: null,
          targetCustomerId: null,
        };
      }
      return {
        sourceRowId: row.sourceRowId,
        identitySha256: fingerprintMigrationIdentityV1(
          row.identity,
          sha256.text,
        ),
        outcome: mapping.decision,
        basis:
          mapping.decision === "create_new"
            ? ("explicit_create" as const)
            : mapping.decision === "matched_existing"
              ? ("explicit_customer" as const)
              : null,
        targetCustomerId: mapping.targetCustomerId,
      };
    });
    const result = previewMigrationDryRunV1(
      { document: parsed.document, resolutions },
      sha256.text,
    );
    const operationId = operationUuid(formData);
    if (!operationId) return failure("Start a new migration operation.");
    const command = recordMigrationDryRunCommandV1.parse({
      schemaVersion: "1",
      programmeGroupId: parsed.document.programmeGroupId,
      programmeVersionId: parsed.document.programmeVersionId,
      result,
      idempotencyKey: `migration:dry-run:${operationId}`,
      correlationId: crypto.randomUUID(),
    });
    const supabase = await createSupabaseServerClient();
    const response = await supabase
      .schema("loyalty")
      .rpc("record_migration_dry_run_v1", {
        target_programme_group_public_id: command.programmeGroupId,
        target_programme_version_public_id: command.programmeVersionId,
        target_status: command.result.status,
        target_source_system: command.result.sourceSystem,
        target_source_export_sha256: command.result.sourceExportSha256,
        target_canonical_document_sha256:
          command.result.canonicalDocumentSha256,
        target_resolution_sha256: command.result.resolutionSha256,
        target_engine_sha256: command.result.engineSha256,
        target_row_count: command.result.rowCount,
        target_matched_count: command.result.matchedCount,
        target_create_count: command.result.createCount,
        target_unresolved_count: command.result.unresolvedCount,
        target_available_points: command.result.availablePoints,
        target_pending_points: command.result.pendingPoints,
        target_issue_counts: command.result.issueCounts,
        target_idempotency_key: command.idempotencyKey,
        target_correlation_id: command.correlationId,
      });
    const row = firstRow(response.data);
    const receipt = recordMigrationDryRunResultV1.safeParse(
      row
        ? {
            dryRunId: row.dry_run_public_id,
            outcome: row.outcome,
            status: row.dry_run_status,
            approvalSha256: row.approval_sha256,
          }
        : null,
    );
    if (response.error || !receipt.success) {
      return databaseFailure(response.error);
    }
    revalidatePath("/migrations");
    return {
      kind: "ready",
      message:
        result.status === "valid"
          ? "Authoritative dry run recorded. Review the exact counts and approve before value is applied."
          : "Dry run recorded with unresolved rows. Resolve every issue and run it again; no value changed.",
      receipt: {
        dryRunId: receipt.data.dryRunId,
        approvalSha256: receipt.data.approvalSha256,
        outcome: receipt.data.outcome,
      },
      result,
    };
  } catch {
    return failure(
      "The authoritative dry run could not be verified. No value was applied.",
    );
  }
}

export async function applyMigrationOpeningBalance(
  formData: FormData,
): Promise<MigrationApplyActionState> {
  try {
    if (formData.get("confirmation") !== "approved") {
      return failure(
        "Confirm the exact dry-run receipt before applying value.",
      );
    }
    const parsed = await parseSource(formData);
    if ("kind" in parsed) return failure(parsed.message);
    const mappings = parseMappings(formData, parsed.document.rows.length);
    if (!mappings) return failure("The reviewed mappings are incomplete.");
    const resolutions = parsed.document.rows.map((row) => {
      const mapping = mappings.get(row.sourceRowId);
      if (!mapping || mapping.decision === "unresolved") {
        throw new Error("unresolved migration mapping");
      }
      return {
        sourceRowId: row.sourceRowId,
        identitySha256: fingerprintMigrationIdentityV1(
          row.identity,
          sha256.text,
        ),
        outcome: mapping.decision,
        basis:
          mapping.decision === "create_new"
            ? ("explicit_create" as const)
            : ("explicit_customer" as const),
        targetCustomerId: mapping.targetCustomerId,
      };
    });
    const preview = previewMigrationDryRunV1(
      { document: parsed.document, resolutions },
      sha256.text,
    );
    if (
      preview.status !== "valid" ||
      preview.engineSha256 !== formData.get("expectedEngineSha256") ||
      preview.sourceExportSha256 !== formData.get("expectedSourceSha256")
    ) {
      return failure(
        "The file, mappings, or active programme changed after review. Run a new dry run.",
      );
    }
    const commerceConnectionId = nullableUuid(
      formData.get("commerceConnectionId"),
    );
    if (
      parsed.document.rows.some(
        (row) =>
          row.identity.kind === "woocommerce_customer_id" &&
          mappings.get(row.sourceRowId)?.decision === "create_new",
      ) &&
      !commerceConnectionId
    ) {
      return failure(
        "Choose the WooCommerce store that owns newly created WooCommerce identities.",
      );
    }
    const operationId = operationUuid(formData);
    if (!operationId) return failure("Start a new application operation.");
    const { canonicalDocumentJson, canonicalResolutionsJson } =
      canonicalizeMigrationApplicationV1({
        document: parsed.document,
        resolutions,
      });
    const command = applyMigrationOpeningBalanceCommandV1.parse({
      schemaVersion: "1",
      dryRunId: formData.get("dryRunId"),
      approvalSha256: formData.get("approvalSha256"),
      document: parsed.document,
      resolutions,
      commerceConnectionId,
      idempotencyKey: `migration:application:${operationId}`,
      correlationId: crypto.randomUUID(),
    });
    const supabase = await createSupabaseServerClient();
    const response = await supabase
      .schema("loyalty")
      .rpc("apply_migration_opening_balance_v1", {
        target_dry_run_public_id: command.dryRunId,
        target_approval_sha256: command.approvalSha256,
        target_canonical_document: canonicalDocumentJson,
        target_resolutions: canonicalResolutionsJson,
        target_commerce_connection_public_id: command.commerceConnectionId,
        target_idempotency_key: command.idempotencyKey,
        target_correlation_id: command.correlationId,
      });
    const row = firstRow(response.data);
    const applied = applyMigrationOpeningBalanceResultV1.safeParse(
      row
        ? {
            batchId: row.batch_public_id,
            outcome: row.outcome,
            customerCount: row.customer_count,
            createdCustomerCount: row.created_customer_count,
            availablePoints: row.available_points,
            pendingPoints: row.pending_points,
          }
        : null,
    );
    if (response.error || !applied.success) {
      return databaseFailure(response.error);
    }
    revalidatePath("/migrations");
    revalidatePath("/customers");
    return {
      kind: "success",
      message:
        applied.data.outcome === "duplicate"
          ? `This exact migration already exists for ${applied.data.customerCount} customers.`
          : `Opening balances applied for ${applied.data.customerCount} customers with exact ledger evidence.`,
      batchId: applied.data.batchId,
    };
  } catch {
    return failure(
      "The approved migration could not be applied safely. No completed batch was assumed.",
    );
  }
}

export async function compensateMigrationBatch(
  _previous: MigrationCorrectionActionState,
  formData: FormData,
): Promise<MigrationCorrectionActionState> {
  try {
    const operationId = operationUuid(formData);
    if (!operationId || formData.get("confirmation") !== "correct") {
      return {
        kind: "error",
        message: "Confirm the compensating correction before continuing.",
      };
    }
    const command = compensateMigrationBatchCommandV1.safeParse({
      schemaVersion: "1",
      batchId: formData.get("batchId"),
      reason: formData.get("reason"),
      idempotencyKey: `migration:correction:${operationId}`,
      correlationId: crypto.randomUUID(),
    });
    if (!command.success) {
      return {
        kind: "error",
        message: "Enter a specific correction reason of at least 8 characters.",
      };
    }
    const correctionAllowed = await mayCorrectMigration();
    if (correctionAllowed !== true) return correctionAllowed;
    const supabase = await createSupabaseServerClient();
    const response = await supabase
      .schema("loyalty")
      .rpc("compensate_migration_batch_v1", {
        target_batch_public_id: command.data.batchId,
        target_reason: command.data.reason,
        target_idempotency_key: command.data.idempotencyKey,
        target_correlation_id: command.data.correlationId,
      });
    const row = firstRow(response.data);
    const corrected = compensateMigrationBatchResultV1.safeParse(
      row
        ? {
            correctionBatchId: row.correction_batch_public_id,
            originalBatchId: row.original_batch_public_id,
            outcome: row.outcome,
            correctedPoints: row.corrected_points,
          }
        : null,
    );
    if (response.error || !corrected.success) {
      const state = databaseFailure(response.error);
      return state;
    }
    revalidatePath("/migrations");
    revalidatePath("/customers");
    return {
      kind: "success",
      message:
        corrected.data.outcome === "duplicate"
          ? "This exact compensating correction was already recorded."
          : `${corrected.data.correctedPoints} imported points were compensated without rewriting history.`,
    };
  } catch {
    return {
      kind: "error",
      message:
        "The correction could not be verified. Original history remains unchanged.",
    };
  }
}

function parseMappings(
  formData: FormData,
  expectedRows: number,
): ReadonlyMap<string, MigrationWorkflowMappingV1> | null {
  const raw = String(formData.get("mappings") ?? "");
  if (raw.length < 2 || raw.length > 256_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = migrationWorkflowMappingV1.array().max(500).safeParse(value);
  if (!parsed.success || parsed.data.length !== expectedRows) return null;
  const mappings = new Map(
    parsed.data.map((mapping) => [mapping.sourceRowId, mapping]),
  );
  return mappings.size === expectedRows ? mappings : null;
}

function operationUuid(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  )
    ? value
    : null;
}

function nullableUuid(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    text,
  )
    ? text
    : null;
}

function isoInstant(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "");
  if (raw.length > 40) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function databaseFailure(error: { code?: string } | null): ActionFailure {
  if (error?.code === "42501") {
    return failure(
      "Your live role or migration entitlement does not allow this operation.",
    );
  }
  if (error?.code === "23514" || error?.code === "23505") {
    return failure(
      "The file, mapping, receipt, or operation identity conflicts with accepted evidence. Start a new dry run.",
    );
  }
  if (error?.code === "22023") {
    return failure(
      "The migration source or destination failed protected validation.",
    );
  }
  return failure(
    "The migration operation could not be completed safely. No outcome was assumed.",
  );
}
