import {
  canonicalMigrationDocumentV1,
  migrationAdapterContextV1,
  migrationAdapterResultV1,
  migrationIdentityV1,
  migrationPointLotV1,
  type CanonicalMigrationDocumentV1,
  type MigrationAdapterContextV1,
  type MigrationAdapterIdV1,
  type MigrationAdapterIssueCodeV1,
  type MigrationAdapterIssueFieldV1,
  type MigrationAdapterIssueV1,
  type MigrationAdapterResultV1,
} from "@starfiniti/contracts/migration";

import { canonicalMigrationJsonV1 } from "./migration-v1";

export const migrationAdapterLimitsV1 = Object.freeze({
  maxInputBytes: 5 * 1024 * 1024,
  maxCanonicalRows: 500,
  maxPhysicalRows: Object.freeze({
    genericCsv: 25_000,
    wployaltyCsv: 500,
    woorewardsJson: 500,
  }),
});
const MAX_INPUT_BYTES = migrationAdapterLimitsV1.maxInputBytes;
const MAX_CANONICAL_ROWS = migrationAdapterLimitsV1.maxCanonicalRows;
const MAX_GENERIC_PHYSICAL_ROWS =
  migrationAdapterLimitsV1.maxPhysicalRows.genericCsv;
const MAX_WPLOYALTY_PHYSICAL_ROWS =
  migrationAdapterLimitsV1.maxPhysicalRows.wployaltyCsv;
const MAX_WOOREWARDS_PHYSICAL_ROWS =
  migrationAdapterLimitsV1.maxPhysicalRows.woorewardsJson;
const MAX_ISSUES = 100;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const EXACT_NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/u;
const FORMULA_PREFIX = /^[=+@-]/u;
const PROHIBITED_CONTROL = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/u;

export const genericMigrationCsvHeaderV1 = [
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
] as const;

const WPL_HEADER = ["email", "points"] as const;
const WPL_REFERRAL_HEADER = ["email", "points", "referral_code"] as const;

type GenericField = (typeof genericMigrationCsvHeaderV1)[number];

export interface MigrationAdapterSha256V1 {
  bytes(value: Uint8Array): string;
  text(value: string): string;
}

interface CsvRecord {
  rowNumber: number;
  fields: string[];
}

interface GenericRowBuilder {
  rowNumber: number;
  sourceRowId: string;
  coreCanonical: string;
  row: CanonicalMigrationDocumentV1["rows"][number];
  hasEmptyLotRecord: boolean;
  lotIds: Set<string>;
}

interface WooRewardsObject {
  rowNumber: number;
  properties: Map<string, string>;
}

class AdapterIssues {
  readonly issues: MigrationAdapterIssueV1[] = [];
  issueCount = 0;

  add(
    rowNumber: number,
    code: MigrationAdapterIssueCodeV1,
    field: MigrationAdapterIssueFieldV1,
  ): void {
    this.issueCount += 1;
    if (this.issues.length < MAX_ISSUES) {
      this.issues.push({ rowNumber, code, field });
    }
  }

  get truncatedIssueCount(): number {
    return this.issueCount - this.issues.length;
  }
}

function compareOpaque(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function digestBytes(
  sha256: MigrationAdapterSha256V1,
  value: Uint8Array,
): string {
  const digest = sha256.bytes(value);
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error(
      "migration adapter SHA-256 provider returned an invalid digest",
    );
  }
  return digest;
}

function digestText(sha256: MigrationAdapterSha256V1, value: string): string {
  const digest = sha256.text(value);
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error(
      "migration adapter SHA-256 provider returned an invalid digest",
    );
  }
  return digest;
}

function invalidResult(
  adapterId: MigrationAdapterIdV1,
  sourceExportSha256: string | null,
  inputBytes: number,
  physicalRowCount: number,
  rowCount: number,
  issues: AdapterIssues,
): MigrationAdapterResultV1 {
  return migrationAdapterResultV1.parse({
    schemaVersion: "1",
    adapterId,
    adapterVersion: "1",
    status: "invalid",
    sourceExportSha256,
    inputBytes,
    physicalRowCount,
    rowCount,
    document: null,
    canonicalDocumentSha256: null,
    issueCount: issues.issueCount,
    truncatedIssueCount: issues.truncatedIssueCount,
    issues: issues.issues,
  });
}

function validResult(
  adapterId: MigrationAdapterIdV1,
  sourceExportSha256: string,
  inputBytes: number,
  physicalRowCount: number,
  document: CanonicalMigrationDocumentV1,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterResultV1 {
  const issues = new AdapterIssues();
  return migrationAdapterResultV1.parse({
    schemaVersion: "1",
    adapterId,
    adapterVersion: "1",
    status: "valid",
    sourceExportSha256,
    inputBytes,
    physicalRowCount,
    rowCount: document.rows.length,
    document,
    canonicalDocumentSha256: digestText(
      sha256,
      canonicalMigrationJsonV1(document),
    ),
    issueCount: 0,
    truncatedIssueCount: 0,
    issues: issues.issues,
  });
}

function decodeSource(input: Uint8Array, issues: AdapterIssues): string | null {
  if (input.byteLength === 0) {
    issues.add(1, "empty_file", "file");
    return null;
  }
  if (input.byteLength > MAX_INPUT_BYTES) {
    issues.add(1, "file_too_large", "file");
    return null;
  }
  const body =
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
      ? input.subarray(3)
      : input;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    issues.add(1, "invalid_utf8", "file");
    return null;
  }
  if (text.length === 0) {
    issues.add(1, "empty_file", "file");
    return null;
  }
  if (PROHIBITED_CONTROL.test(text)) {
    issues.add(1, "invalid_utf8", "file");
    return null;
  }
  if (/\r(?!\n)/u.test(text)) {
    issues.add(1, "invalid_line_ending", "file");
    return null;
  }
  return text;
}

function parseCsv(
  text: string,
  maxDataRows: number,
  issues: AdapterIssues,
): CsvRecord[] | null {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;
  let rowNumber = 1;
  let recordStart = 1;

  const finishRecord = (): boolean => {
    fields.push(field);
    records.push({ rowNumber: recordStart, fields });
    if (records.length > maxDataRows + 1) {
      issues.add(recordStart, "too_many_rows", "row");
      return false;
    }
    fields = [];
    field = "";
    closedQuote = false;
    recordStart = rowNumber + 1;
    return true;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
        if (character === "\n") rowNumber += 1;
      }
      continue;
    }

    if (closedQuote) {
      if (character === ",") {
        fields.push(field);
        field = "";
        closedQuote = false;
        continue;
      }
      if (character === "\n" || character === "\r") {
        if (character === "\r") index += 1;
        if (!finishRecord()) return null;
        rowNumber += 1;
        continue;
      }
      issues.add(rowNumber, "invalid_csv", "row");
      return null;
    }

    if (character === '"') {
      if (field.length !== 0) {
        issues.add(rowNumber, "invalid_csv", "row");
        return null;
      }
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      fields.push(field);
      field = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r") index += 1;
      if (!finishRecord()) return null;
      rowNumber += 1;
      continue;
    }
    field += character;
  }

  if (inQuotes) {
    issues.add(rowNumber, "invalid_csv", "row");
    return null;
  }
  if (field.length > 0 || fields.length > 0 || closedQuote) {
    if (!finishRecord()) return null;
  }
  if (records.length === 0) {
    issues.add(1, "empty_file", "file");
    return null;
  }
  return records;
}

function exactHeader(record: CsvRecord, expected: readonly string[]): boolean {
  return (
    record.fields.length === expected.length &&
    record.fields.every((field, index) => field === expected[index])
  );
}

function formulaField(
  value: string,
  rowNumber: number,
  field: MigrationAdapterIssueFieldV1,
  issues: AdapterIssues,
): boolean {
  if (value.length > 0 && FORMULA_PREFIX.test(value)) {
    issues.add(rowNumber, "formula_like_value", field);
    return true;
  }
  return false;
}

function exactPoints(
  value: string,
  rowNumber: number,
  field: MigrationAdapterIssueFieldV1,
  allowZero: boolean,
  issues: AdapterIssues,
): boolean {
  if (
    !EXACT_NON_NEGATIVE_INTEGER.test(value) ||
    BigInt(value) > POSTGRES_BIGINT_MAX ||
    (!allowZero && value === "0")
  ) {
    issues.add(rowNumber, "invalid_points", field);
    return false;
  }
  return true;
}

function exactOptionalTimestamp(value: string): boolean {
  return (
    value === "" ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    )
  );
}

function makeDocument(
  sourceSystem: CanonicalMigrationDocumentV1["source"]["system"],
  sourceExportSha256: string,
  context: MigrationAdapterContextV1,
  rows: CanonicalMigrationDocumentV1["rows"],
): unknown {
  return {
    schemaVersion: "1",
    source: {
      system: sourceSystem,
      exportId: context.exportId,
      exportSha256: sourceExportSha256,
      exportedAt: context.exportedAt,
    },
    programmeGroupId: context.programmeGroupId,
    programmeVersionId: context.programmeVersionId,
    expiryPolicy: context.expiryPolicy,
    rows,
  };
}

function validateDocument(
  adapterId: MigrationAdapterIdV1,
  sourceSystem: CanonicalMigrationDocumentV1["source"]["system"],
  sourceExportSha256: string,
  inputBytes: number,
  physicalRowCount: number,
  context: MigrationAdapterContextV1,
  rows: CanonicalMigrationDocumentV1["rows"],
  issues: AdapterIssues,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterResultV1 {
  const parsed = canonicalMigrationDocumentV1.safeParse(
    makeDocument(sourceSystem, sourceExportSha256, context, rows),
  );
  if (!parsed.success) {
    issues.add(1, "invalid_document", "file");
    return invalidResult(
      adapterId,
      sourceExportSha256,
      inputBytes,
      physicalRowCount,
      rows.length,
      issues,
    );
  }
  return validResult(
    adapterId,
    sourceExportSha256,
    inputBytes,
    physicalRowCount,
    parsed.data,
    sha256,
  );
}

function addDuplicateIdentityIssues(
  identities: Map<string, number[]>,
  issues: AdapterIssues,
  field: MigrationAdapterIssueFieldV1 = "identity_value",
): void {
  for (const rowNumbers of identities.values()) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) {
        issues.add(rowNumber, "duplicate_source_identity", field);
      }
    }
  }
}

export function adaptGenericMigrationCsvV1(
  input: Uint8Array,
  untrustedContext: unknown,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterResultV1 {
  const adapterId = "generic_csv_v1" as const;
  const context = migrationAdapterContextV1.parse(untrustedContext);
  const sourceExportSha256 =
    input.byteLength <= MAX_INPUT_BYTES ? digestBytes(sha256, input) : null;
  const issues = new AdapterIssues();
  const text = decodeSource(input, issues);
  if (text === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  if (sourceExportSha256 === null) {
    throw new Error("bounded migration source unexpectedly lacks a digest");
  }
  const records = parseCsv(text, MAX_GENERIC_PHYSICAL_ROWS, issues);
  if (records === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  const physicalRowCount = Math.max(0, records.length - 1);
  const header = records[0];
  if (
    header === undefined ||
    !exactHeader(header, genericMigrationCsvHeaderV1)
  ) {
    issues.add(1, "unsupported_header", "header");
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      physicalRowCount,
      0,
      issues,
    );
  }
  if (physicalRowCount === 0) {
    issues.add(1, "empty_file", "row");
  }

  const rows = new Map<string, GenericRowBuilder>();
  const identities = new Map<string, number[]>();

  for (const record of records.slice(1)) {
    if (record.fields.length !== genericMigrationCsvHeaderV1.length) {
      issues.add(record.rowNumber, "wrong_column_count", "row");
      continue;
    }
    const fields = Object.fromEntries(
      genericMigrationCsvHeaderV1.map((name, index) => [
        name,
        record.fields[index] ?? "",
      ]),
    ) as Record<GenericField, string>;
    let rowValid = true;
    for (const fieldName of genericMigrationCsvHeaderV1) {
      if (
        formulaField(fields[fieldName], record.rowNumber, fieldName, issues)
      ) {
        rowValid = false;
      }
    }
    if (!SAFE_REFERENCE.test(fields.source_row_id)) {
      issues.add(record.rowNumber, "invalid_field", "source_row_id");
      rowValid = false;
    }
    const identity = migrationIdentityV1.safeParse({
      kind: fields.identity_kind,
      value: fields.identity_value,
    });
    if (!identity.success) {
      issues.add(record.rowNumber, "invalid_field", "identity_value");
      rowValid = false;
    }
    if (
      !exactPoints(
        fields.available_points,
        record.rowNumber,
        "available_points",
        true,
        issues,
      )
    ) {
      rowValid = false;
    }
    if (
      !exactPoints(
        fields.pending_points,
        record.rowNumber,
        "pending_points",
        true,
        issues,
      )
    ) {
      rowValid = false;
    }

    const lotValues = [
      fields.source_lot_id,
      fields.lot_bucket,
      fields.lot_points,
      fields.available_at,
      fields.expires_at,
    ];
    const hasLot = lotValues.some((value) => value !== "");
    let lot:
      | CanonicalMigrationDocumentV1["rows"][number]["balance"]["lots"][number]
      | null = null;
    if (hasLot) {
      if (
        fields.source_lot_id === "" ||
        fields.lot_bucket === "" ||
        fields.lot_points === "" ||
        fields.available_at === ""
      ) {
        issues.add(record.rowNumber, "invalid_field", "source_lot_id");
        rowValid = false;
      } else {
        const parsedLot = migrationPointLotV1.safeParse({
          sourceLotId: fields.source_lot_id,
          bucket: fields.lot_bucket,
          points: fields.lot_points,
          availableAt: fields.available_at,
          expiresAt: fields.expires_at === "" ? null : fields.expires_at,
        });
        if (!parsedLot.success) {
          issues.add(record.rowNumber, "invalid_field", "source_lot_id");
          rowValid = false;
        } else {
          lot = parsedLot.data;
        }
      }
    }

    let tier: CanonicalMigrationDocumentV1["rows"][number]["tier"] = null;
    if (fields.source_tier_code !== "" || fields.tier_qualified_at !== "") {
      if (
        !SAFE_REFERENCE.test(fields.source_tier_code) ||
        !exactOptionalTimestamp(fields.tier_qualified_at)
      ) {
        issues.add(record.rowNumber, "invalid_field", "source_tier_code");
        rowValid = false;
      } else {
        tier = {
          sourceTierCode: fields.source_tier_code,
          qualifiedAt:
            fields.tier_qualified_at === "" ? null : fields.tier_qualified_at,
        };
      }
    }

    let referral: CanonicalMigrationDocumentV1["rows"][number]["referral"] =
      null;
    if (fields.source_referral_id !== "" || fields.referral_state !== "") {
      if (
        !SAFE_REFERENCE.test(fields.source_referral_id) ||
        !["active", "blocked", "closed"].includes(fields.referral_state)
      ) {
        issues.add(record.rowNumber, "invalid_field", "source_referral_id");
        rowValid = false;
      } else {
        referral = {
          sourceReferralId: fields.source_referral_id,
          state: fields.referral_state as "active" | "blocked" | "closed",
        };
      }
    }

    if (!rowValid || !identity.success) continue;

    const core = {
      identity: identity.data,
      availablePoints: fields.available_points,
      pendingPoints: fields.pending_points,
      tier,
      referral,
    };
    const coreCanonical = canonicalMigrationJsonV1(core);
    const existing = rows.get(fields.source_row_id);
    if (existing !== undefined) {
      if (existing.coreCanonical !== coreCanonical) {
        issues.add(record.rowNumber, "conflicting_source_row", "source_row_id");
        continue;
      }
      if (lot === null || existing.hasEmptyLotRecord) {
        issues.add(record.rowNumber, "duplicate_source_row", "source_row_id");
        continue;
      }
      if (existing.lotIds.has(lot.sourceLotId)) {
        issues.add(record.rowNumber, "duplicate_lot", "source_lot_id");
        continue;
      }
      existing.lotIds.add(lot.sourceLotId);
      existing.row.balance.lots.push(lot);
      continue;
    }

    const identityCanonical = canonicalMigrationJsonV1({
      schemaVersion: "1",
      identity: identity.data,
    });
    const identityRows = identities.get(identityCanonical) ?? [];
    identityRows.push(record.rowNumber);
    identities.set(identityCanonical, identityRows);

    rows.set(fields.source_row_id, {
      rowNumber: record.rowNumber,
      sourceRowId: fields.source_row_id,
      coreCanonical,
      row: {
        sourceRowId: fields.source_row_id,
        identity: identity.data,
        balance: {
          availablePoints: fields.available_points,
          pendingPoints: fields.pending_points,
          lots: lot === null ? [] : [lot],
        },
        tier,
        referral,
        sourceHistory: [],
      },
      hasEmptyLotRecord: lot === null,
      lotIds: new Set(lot === null ? [] : [lot.sourceLotId]),
    });
  }

  if (rows.size > MAX_CANONICAL_ROWS) {
    issues.add(1, "too_many_rows", "row");
  }
  addDuplicateIdentityIssues(identities, issues);
  if (issues.issueCount > 0) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      physicalRowCount,
      Math.min(rows.size, MAX_CANONICAL_ROWS),
      issues,
    );
  }
  const canonicalRows = [...rows.values()]
    .sort((left, right) => compareOpaque(left.sourceRowId, right.sourceRowId))
    .map(({ row }) => ({
      ...row,
      balance: {
        ...row.balance,
        lots: [...row.balance.lots].sort((left, right) =>
          compareOpaque(left.sourceLotId, right.sourceLotId),
        ),
      },
    }));
  return validateDocument(
    adapterId,
    "generic_csv",
    sourceExportSha256,
    input.byteLength,
    physicalRowCount,
    context,
    canonicalRows,
    issues,
    sha256,
  );
}

export function adaptWPLoyaltyCsvV1(
  input: Uint8Array,
  untrustedContext: unknown,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterResultV1 {
  const adapterId = "wployalty_csv_v1" as const;
  const context = migrationAdapterContextV1.parse(untrustedContext);
  const sourceExportSha256 =
    input.byteLength <= MAX_INPUT_BYTES ? digestBytes(sha256, input) : null;
  const issues = new AdapterIssues();
  const text = decodeSource(input, issues);
  if (text === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  if (sourceExportSha256 === null) {
    throw new Error("bounded migration source unexpectedly lacks a digest");
  }
  if (context.expiryPolicy.mode !== "apply_default") {
    issues.add(1, "invalid_document", "file");
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  const records = parseCsv(text, MAX_WPLOYALTY_PHYSICAL_ROWS, issues);
  if (records === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  const physicalRowCount = Math.max(0, records.length - 1);
  const header = records[0];
  const withReferral =
    header !== undefined && exactHeader(header, WPL_REFERRAL_HEADER);
  if (
    header === undefined ||
    (!withReferral && !exactHeader(header, WPL_HEADER))
  ) {
    issues.add(1, "unsupported_header", "header");
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      physicalRowCount,
      0,
      issues,
    );
  }
  const expectedColumns = withReferral ? 3 : 2;
  const rows: CanonicalMigrationDocumentV1["rows"] = [];
  const identities = new Map<string, number[]>();
  for (const record of records.slice(1)) {
    if (record.fields.length !== expectedColumns) {
      issues.add(record.rowNumber, "wrong_column_count", "row");
      continue;
    }
    const [email = "", points = "", referralCode = ""] = record.fields;
    const emailFormula = formulaField(email, record.rowNumber, "email", issues);
    const pointsFormula = formulaField(
      points,
      record.rowNumber,
      "points",
      issues,
    );
    const referralFormula = formulaField(
      referralCode,
      record.rowNumber,
      "referral_code",
      issues,
    );
    const hasFormula = emailFormula || pointsFormula || referralFormula;
    const identity = migrationIdentityV1.safeParse({
      kind: "email",
      value: email,
    });
    if (!identity.success) {
      issues.add(record.rowNumber, "invalid_field", "email");
    }
    const pointsValid = exactPoints(
      points,
      record.rowNumber,
      "points",
      true,
      issues,
    );
    const referralValid =
      referralCode === "" || SAFE_REFERENCE.test(referralCode);
    if (!referralValid) {
      issues.add(record.rowNumber, "invalid_field", "referral_code");
    }
    if (hasFormula || !identity.success || !pointsValid || !referralValid) {
      continue;
    }
    const identityCanonical = canonicalMigrationJsonV1({
      schemaVersion: "1",
      identity: identity.data,
    });
    const relatedRows = identities.get(identityCanonical) ?? [];
    relatedRows.push(record.rowNumber);
    identities.set(identityCanonical, relatedRows);
    rows.push({
      sourceRowId: `row-${record.rowNumber}`,
      identity: identity.data,
      balance: { availablePoints: points, pendingPoints: "0", lots: [] },
      tier: null,
      referral:
        referralCode === ""
          ? null
          : { sourceReferralId: referralCode, state: "active" },
      sourceHistory: [],
    });
  }
  if (physicalRowCount === 0) issues.add(1, "empty_file", "row");
  addDuplicateIdentityIssues(identities, issues, "email");
  if (issues.issueCount > 0) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      physicalRowCount,
      rows.length,
      issues,
    );
  }
  return validateDocument(
    adapterId,
    "wployalty",
    sourceExportSha256,
    input.byteLength,
    physicalRowCount,
    context,
    rows,
    issues,
    sha256,
  );
}

class JsonShapeFailure extends Error {
  constructor(
    readonly rowNumber: number,
    readonly code: MigrationAdapterIssueCodeV1 = "invalid_json",
    readonly field: MigrationAdapterIssueFieldV1 = "object",
  ) {
    super("invalid WooRewards JSON shape");
  }
}

function parseWooRewardsJson(
  text: string,
  issues: AdapterIssues,
): WooRewardsObject[] | null {
  let index = 0;
  const objects: WooRewardsObject[] = [];
  const skipWhitespace = (): void => {
    while ([" ", "\n", "\r"].includes(text[index] ?? "")) index += 1;
  };
  const expect = (character: string, rowNumber: number): void => {
    skipWhitespace();
    if (text[index] !== character) throw new JsonShapeFailure(rowNumber);
    index += 1;
  };
  const readString = (rowNumber: number): string => {
    skipWhitespace();
    if (text[index] !== '"') throw new JsonShapeFailure(rowNumber);
    const start = index;
    index += 1;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        index += 1;
        try {
          const value = JSON.parse(text.slice(start, index));
          if (typeof value !== "string") throw new JsonShapeFailure(rowNumber);
          return value;
        } catch (error) {
          if (error instanceof JsonShapeFailure) throw error;
          throw new JsonShapeFailure(rowNumber);
        }
      }
      if (character !== undefined && character < " ") {
        throw new JsonShapeFailure(rowNumber);
      }
    }
    throw new JsonShapeFailure(rowNumber);
  };

  try {
    expect("[", 1);
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
    } else {
      while (index < text.length) {
        const rowNumber = objects.length + 1;
        if (rowNumber > MAX_WOOREWARDS_PHYSICAL_ROWS) {
          issues.add(rowNumber, "too_many_rows", "row");
          return null;
        }
        expect("{", rowNumber);
        const properties = new Map<string, string>();
        skipWhitespace();
        if (text[index] !== "}") {
          while (index < text.length) {
            const key = readString(rowNumber);
            expect(":", rowNumber);
            const value = readString(rowNumber);
            if (properties.has(key)) {
              issues.add(rowNumber, "duplicate_property", "property");
            } else {
              properties.set(key, value);
            }
            if (!WPL_HEADER.includes(key as "email" | "points")) {
              issues.add(rowNumber, "unsupported_property", "property");
            }
            skipWhitespace();
            if (text[index] === ",") {
              index += 1;
              continue;
            }
            break;
          }
        }
        expect("}", rowNumber);
        objects.push({ rowNumber, properties });
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        expect("]", rowNumber);
        break;
      }
    }
    skipWhitespace();
    if (index !== text.length) throw new JsonShapeFailure(objects.length + 1);
    return objects;
  } catch (error) {
    const failure =
      error instanceof JsonShapeFailure ? error : new JsonShapeFailure(1);
    issues.add(failure.rowNumber, failure.code, failure.field);
    return null;
  }
}

export function adaptWooRewardsJsonV1(
  input: Uint8Array,
  untrustedContext: unknown,
  sha256: MigrationAdapterSha256V1,
): MigrationAdapterResultV1 {
  const adapterId = "woorewards_json_v1" as const;
  const context = migrationAdapterContextV1.parse(untrustedContext);
  const sourceExportSha256 =
    input.byteLength <= MAX_INPUT_BYTES ? digestBytes(sha256, input) : null;
  const issues = new AdapterIssues();
  const text = decodeSource(input, issues);
  if (text === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  if (sourceExportSha256 === null) {
    throw new Error("bounded migration source unexpectedly lacks a digest");
  }
  if (context.expiryPolicy.mode !== "apply_default") {
    issues.add(1, "invalid_document", "file");
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  const objects = parseWooRewardsJson(text, issues);
  if (objects === null) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      0,
      0,
      issues,
    );
  }
  const rows: CanonicalMigrationDocumentV1["rows"] = [];
  const identities = new Map<string, number[]>();
  for (const object of objects) {
    if (
      object.properties.size !== 2 ||
      !object.properties.has("email") ||
      !object.properties.has("points")
    ) {
      issues.add(object.rowNumber, "unsupported_property", "object");
      continue;
    }
    const email = object.properties.get("email") ?? "";
    const points = object.properties.get("points") ?? "";
    const emailFormula = formulaField(email, object.rowNumber, "email", issues);
    const pointsFormula = formulaField(
      points,
      object.rowNumber,
      "points",
      issues,
    );
    const hasFormula = emailFormula || pointsFormula;
    const identity = migrationIdentityV1.safeParse({
      kind: "email",
      value: email,
    });
    if (!identity.success) {
      issues.add(object.rowNumber, "invalid_field", "email");
    }
    const pointsValid = exactPoints(
      points,
      object.rowNumber,
      "points",
      true,
      issues,
    );
    if (hasFormula || !identity.success || !pointsValid) continue;
    const identityCanonical = canonicalMigrationJsonV1({
      schemaVersion: "1",
      identity: identity.data,
    });
    const relatedRows = identities.get(identityCanonical) ?? [];
    relatedRows.push(object.rowNumber);
    identities.set(identityCanonical, relatedRows);
    rows.push({
      sourceRowId: `row-${object.rowNumber}`,
      identity: identity.data,
      balance: { availablePoints: points, pendingPoints: "0", lots: [] },
      tier: null,
      referral: null,
      sourceHistory: [],
    });
  }
  if (objects.length === 0) issues.add(1, "empty_file", "row");
  addDuplicateIdentityIssues(identities, issues, "email");
  if (issues.issueCount > 0) {
    return invalidResult(
      adapterId,
      sourceExportSha256,
      input.byteLength,
      objects.length,
      rows.length,
      issues,
    );
  }
  return validateDocument(
    adapterId,
    "woorewards",
    sourceExportSha256,
    input.byteLength,
    objects.length,
    context,
    rows,
    issues,
    sha256,
  );
}

export function migrationAdapterIssuesCsvV1(untrustedResult: unknown): string {
  const result = migrationAdapterResultV1.parse(untrustedResult);
  const header =
    "adapter_id,adapter_version,issue_count,truncated_issue_count,row_number,code,field\r\n";
  return (
    header +
    result.issues
      .map(
        ({ rowNumber, code, field }) =>
          `${result.adapterId},${result.adapterVersion},${result.issueCount},${result.truncatedIssueCount},${rowNumber},${code},${field}\r\n`,
      )
      .join("")
  );
}
