import "server-only";
import {
  customerTierProgressV1,
  type CustomerTierProgressV1,
} from "@starfiniti/contracts";
import {
  isExactPointText,
  isUuid,
  normalizeCustomerSearch,
  type WalletBucket,
} from "@/lib/customers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/tenant-context";

export type CustomerSummary = Readonly<{
  id: string;
  displayReference: string;
  status: string;
  createdAt: string;
  identityKind: string | null;
  maskedExternalId: string | null;
  walletStatus: string | null;
  pendingPoints: string;
  availablePoints: string;
  reservedPoints: string;
}>;

export type CustomerLedgerItem = Readonly<{
  id: string;
  kind: string;
  actorType: string;
  sourceReference: string | null;
  bucket: string;
  points: string;
  effectiveAt: string;
  correlationId: string;
  programmeVersion: number | null;
}>;

export type CustomerDetail = Readonly<{
  customer: CustomerSummary;
  balances: Readonly<Record<WalletBucket, string>>;
  ledger: readonly CustomerLedgerItem[];
}>;

export type CustomerAdjustmentContext = Readonly<{
  availablePoints: string;
}>;

export type CustomerTierState = Readonly<{
  customerId: string;
  tierCode: string | null;
  tierName: string | null;
  qualifiedTierCode: string | null;
  qualifiedTierName: string | null;
  transition: string | null;
  rollingEligibleSpendMinor: string | null;
  belowThresholdSince: string | null;
  graceUntil: string | null;
  effectiveFrom: string | null;
  decidedAt: string | null;
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("customer_read_unavailable");
  }
  return value as UnknownRecord;
}

function requiredString(row: UnknownRecord, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error("customer_read_unavailable");
  return value;
}

function nullableString(row: UnknownRecord, key: string): string | null {
  const value = row[key];
  if (value !== null && typeof value !== "string") {
    throw new Error("customer_read_unavailable");
  }
  return value;
}

function exactPoint(row: UnknownRecord, key: string): string {
  const value = row[key];
  if (!isExactPointText(value)) throw new Error("customer_read_unavailable");
  return value;
}

function nullableExactPoint(row: UnknownRecord, key: string): string | null {
  const value = row[key];
  if (value !== null && !isExactPointText(value)) {
    throw new Error("customer_read_unavailable");
  }
  return value;
}

function parseSummary(rowValue: unknown): CustomerSummary {
  const row = asRecord(rowValue);
  const id = requiredString(row, "customer_id");
  if (!isUuid(id)) throw new Error("customer_read_unavailable");
  return {
    id,
    displayReference: requiredString(row, "display_reference"),
    status: requiredString(row, "customer_status"),
    createdAt: requiredString(row, "created_at"),
    identityKind: nullableString(row, "identity_kind"),
    maskedExternalId: nullableString(row, "masked_external_id"),
    walletStatus: nullableString(row, "wallet_status"),
    pendingPoints: exactPoint(row, "pending_points"),
    availablePoints: exactPoint(row, "available_points"),
    reservedPoints: exactPoint(row, "reserved_points"),
  };
}

function parseLedger(value: unknown): readonly CustomerLedgerItem[] {
  if (!Array.isArray(value)) throw new Error("customer_read_unavailable");
  return value.map((itemValue) => {
    const item = asRecord(itemValue);
    const id = requiredString(item, "id");
    const correlationId = requiredString(item, "correlationId");
    const programmeVersion = item.programmeVersion;
    if (
      !isUuid(id) ||
      !isUuid(correlationId) ||
      (programmeVersion !== null &&
        (typeof programmeVersion !== "number" ||
          !Number.isSafeInteger(programmeVersion) ||
          programmeVersion < 1))
    ) {
      throw new Error("customer_read_unavailable");
    }
    return {
      id,
      kind: requiredString(item, "kind"),
      actorType: requiredString(item, "actorType"),
      sourceReference: nullableString(item, "sourceReference"),
      bucket: requiredString(item, "bucket"),
      points: exactPoint(item, "points"),
      effectiveAt: requiredString(item, "effectiveAt"),
      correlationId,
      programmeVersion: programmeVersion as number | null,
    };
  });
}

function firstRow(data: unknown): unknown | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export async function listCustomers(
  context: TenantContext,
  rawSearch?: unknown,
): Promise<readonly CustomerSummary[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("loyalty")
    .rpc("list_customer_summaries", {
      target_organization_public_id: context.organization.public_id,
      target_programme_group_public_id:
        context.programmeGroup?.public_id ?? null,
      target_search: normalizeCustomerSearch(rawSearch) || null,
    });
  if (result.error || !Array.isArray(result.data)) {
    throw new Error("customer_read_unavailable");
  }
  return result.data.map(parseSummary);
}

export async function getCustomerDetail(
  context: TenantContext,
  customerPublicId: string,
): Promise<CustomerDetail | null> {
  if (!isUuid(customerPublicId)) return null;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("loyalty")
    .rpc("get_customer_read_model", {
      target_customer_public_id: customerPublicId,
      target_programme_group_public_id:
        context.programmeGroup?.public_id ?? null,
    });
  if (result.error) throw new Error("customer_read_unavailable");
  const rowValue = firstRow(result.data);
  if (!rowValue) return null;
  const row = asRecord(rowValue);
  const customer = parseSummary(row);
  return {
    customer,
    balances: {
      pending: customer.pendingPoints,
      available: customer.availablePoints,
      reserved: customer.reservedPoints,
      spent: exactPoint(row, "spent_points"),
      expired: exactPoint(row, "expired_points"),
      reversed: exactPoint(row, "reversed_points"),
    },
    ledger: parseLedger(row.ledger_items),
  };
}

export async function getCustomerAdjustmentContext(
  context: TenantContext,
  customerPublicId: string,
): Promise<CustomerAdjustmentContext | null> {
  if (
    !isUuid(customerPublicId) ||
    !context.programmeGroup ||
    (context.membershipRole !== "owner" && context.membershipRole !== "admin")
  ) {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("loyalty")
    .rpc("get_customer_adjustment_context", {
      target_customer_public_id: customerPublicId,
      target_programme_group_public_id: context.programmeGroup.public_id,
    });
  if (result.error) throw new Error("customer_adjustment_context_unavailable");
  const row = firstRow(result.data) as { available_points?: unknown } | null;
  return row && isExactPointText(row.available_points)
    ? { availablePoints: row.available_points }
    : null;
}

export async function getCustomerTierState(
  context: TenantContext,
  customerPublicId: string,
): Promise<CustomerTierState | null> {
  if (!isUuid(customerPublicId) || !context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("loyalty")
    .rpc("get_customer_tier_read_model", {
      target_customer_public_id: customerPublicId,
      target_programme_group_public_id: context.programmeGroup.public_id,
    });
  if (result.error) throw new Error("customer_tier_read_unavailable");
  const rowValue = firstRow(result.data);
  if (!rowValue) return null;
  const row = asRecord(rowValue);
  const customerId = requiredString(row, "customer_id");
  if (!isUuid(customerId)) throw new Error("customer_tier_read_unavailable");
  return {
    customerId,
    tierCode: nullableString(row, "tier_code"),
    tierName: nullableString(row, "tier_name"),
    qualifiedTierCode: nullableString(row, "qualified_tier_code"),
    qualifiedTierName: nullableString(row, "qualified_tier_name"),
    transition: nullableString(row, "transition"),
    rollingEligibleSpendMinor: nullableExactPoint(
      row,
      "rolling_eligible_spend_minor",
    ),
    belowThresholdSince: nullableString(row, "below_threshold_since"),
    graceUntil: nullableString(row, "grace_until"),
    effectiveFrom: nullableString(row, "effective_from"),
    decidedAt: nullableString(row, "decided_at"),
  };
}

export async function getCustomerTierProgress(
  context: TenantContext,
  customerPublicId: string,
  asOf: string,
): Promise<CustomerTierProgressV1 | null> {
  if (!isUuid(customerPublicId) || !context.programmeGroup) return null;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("loyalty")
    .rpc("get_customer_tier_progress_v1", {
      target_customer_public_id: customerPublicId,
      target_programme_group_public_id: context.programmeGroup.public_id,
      target_as_of: asOf,
    });
  if (result.error) throw new Error("customer_tier_progress_unavailable");
  const row = firstRow(result.data) as Readonly<{
    customer_id?: unknown;
    tier_progress?: unknown;
  }> | null;
  if (!row) return null;
  if (row.customer_id !== customerPublicId) {
    throw new Error("customer_tier_progress_unavailable");
  }
  const parsed = customerTierProgressV1.safeParse(row.tier_progress);
  if (!parsed.success) throw new Error("customer_tier_progress_unavailable");
  return parsed.data;
}
