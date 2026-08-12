import "server-only";
import {
  escapePostgrestLike,
  isUuid,
  maskExternalCustomerId,
  normalizeCustomerSearch,
  summarizeWalletBuckets,
  type WalletBucketRow,
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
  pendingPoints: number;
  availablePoints: number;
  reservedPoints: number;
}>;

export type CustomerLedgerItem = Readonly<{
  id: string;
  kind: string;
  actorType: string;
  sourceReference: string | null;
  bucket: string;
  points: number;
  effectiveAt: string;
  correlationId: string;
  programmeVersion: number | null;
}>;

export type CustomerDetail = Readonly<{
  customer: CustomerSummary;
  balances: ReturnType<typeof summarizeWalletBuckets>;
  ledger: readonly CustomerLedgerItem[];
}>;

export type CustomerAdjustmentContext = Readonly<{
  availablePoints: string;
}>;

type CustomerRow = Readonly<{
  id: number;
  public_id: string;
  display_reference: string | null;
  status: string;
  created_at: string;
}>;
type IdentityRow = Readonly<{
  customer_id: number;
  external_customer_id: string;
  identity_kind: string;
}>;
type WalletRow = Readonly<{
  id: number;
  public_id: string;
  customer_id: number;
  status: string;
}>;
type BalanceRow = WalletBucketRow & Readonly<{ wallet_id: number }>;
type AccountRow = Readonly<{ id: number; account_kind: string }>;
type EntryRow = Readonly<{
  transaction_id: number;
  account_id: number;
  points: number;
}>;
type TransactionRow = Readonly<{
  id: number;
  public_id: string;
  programme_version_id: number;
  transaction_kind: string;
  actor_type: string;
  source_reference: string | null;
  correlation_id: string;
  effective_at: string;
}>;
type VersionRow = Readonly<{ id: number; version_number: number }>;

function displayReference(customer: CustomerRow): string {
  return (
    customer.display_reference?.trim() ||
    `Customer ${customer.public_id.slice(0, 8)}`
  );
}

export async function listCustomers(
  context: TenantContext,
  rawSearch?: unknown,
): Promise<readonly CustomerSummary[]> {
  const supabase = await createSupabaseServerClient();
  const search = normalizeCustomerSearch(rawSearch);
  let customerQuery = supabase
    .schema("loyalty")
    .from("customers")
    .select("id,public_id,display_reference,status,created_at")
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (search) {
    customerQuery = customerQuery.ilike(
      "display_reference",
      `%${escapePostgrestLike(search)}%`,
    );
  }
  const customerResult = await customerQuery;
  if (customerResult.error) throw new Error("customer_read_unavailable");
  const customers = (customerResult.data ?? []) as CustomerRow[];
  if (customers.length === 0) return [];

  const customerIds = customers.map(({ id }) => id);
  const [identityResult, walletResult] = await Promise.all([
    supabase
      .schema("loyalty")
      .from("customer_identities")
      .select("customer_id,external_customer_id,identity_kind")
      .eq("organization_id", context.organization.id)
      .in("customer_id", customerIds)
      .order("id", { ascending: true }),
    context.programmeGroup
      ? supabase
          .schema("loyalty")
          .from("wallets")
          .select("id,public_id,customer_id,status")
          .eq("organization_id", context.organization.id)
          .eq("programme_group_id", context.programmeGroup.id)
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (identityResult.error || walletResult.error) {
    throw new Error("customer_read_unavailable");
  }
  const identities = (identityResult.data ?? []) as IdentityRow[];
  const wallets = (walletResult.data ?? []) as WalletRow[];
  const walletIds = wallets.map(({ id }) => id);
  const balanceResult =
    walletIds.length > 0
      ? await supabase
          .schema("loyalty")
          .from("wallet_balances")
          .select("wallet_id,account_kind,points")
          .eq("organization_id", context.organization.id)
          .in("wallet_id", walletIds)
      : { data: [], error: null };
  if (balanceResult.error) throw new Error("customer_read_unavailable");
  const balances = (balanceResult.data ?? []) as BalanceRow[];

  return customers.map((customer) => {
    const identity = identities.find(
      ({ customer_id }) => customer_id === customer.id,
    );
    const wallet = wallets.find(
      ({ customer_id }) => customer_id === customer.id,
    );
    const buckets = summarizeWalletBuckets(
      balances.filter(({ wallet_id }) => wallet_id === wallet?.id),
    );
    return {
      id: customer.public_id,
      displayReference: displayReference(customer),
      status: customer.status,
      createdAt: customer.created_at,
      identityKind: identity?.identity_kind ?? null,
      maskedExternalId: identity
        ? maskExternalCustomerId(identity.external_customer_id)
        : null,
      walletStatus: wallet?.status ?? null,
      pendingPoints: buckets.pending,
      availablePoints: buckets.available,
      reservedPoints: buckets.reserved,
    };
  });
}

export async function getCustomerDetail(
  context: TenantContext,
  customerPublicId: string,
): Promise<CustomerDetail | null> {
  if (!isUuid(customerPublicId)) return null;
  const supabase = await createSupabaseServerClient();
  const customerResult = await supabase
    .schema("loyalty")
    .from("customers")
    .select("id,public_id,display_reference,status,created_at")
    .eq("organization_id", context.organization.id)
    .eq("public_id", customerPublicId)
    .maybeSingle();
  if (customerResult.error) throw new Error("customer_read_unavailable");
  const customerRow = customerResult.data as CustomerRow | null;
  if (!customerRow) return null;

  const identityResult = await supabase
    .schema("loyalty")
    .from("customer_identities")
    .select("customer_id,external_customer_id,identity_kind")
    .eq("organization_id", context.organization.id)
    .eq("customer_id", customerRow.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (identityResult.error) throw new Error("customer_read_unavailable");
  const identity = identityResult.data as IdentityRow | null;

  const baseCustomer: CustomerSummary = {
    id: customerRow.public_id,
    displayReference: displayReference(customerRow),
    status: customerRow.status,
    createdAt: customerRow.created_at,
    identityKind: identity?.identity_kind ?? null,
    maskedExternalId: identity
      ? maskExternalCustomerId(identity.external_customer_id)
      : null,
    walletStatus: null,
    pendingPoints: 0,
    availablePoints: 0,
    reservedPoints: 0,
  };
  if (!context.programmeGroup) {
    return {
      customer: baseCustomer,
      balances: summarizeWalletBuckets([]),
      ledger: [],
    };
  }

  const walletResult = await supabase
    .schema("loyalty")
    .from("wallets")
    .select("id,status")
    .eq("organization_id", context.organization.id)
    .eq("programme_group_id", context.programmeGroup.id)
    .eq("customer_id", customerRow.id)
    .maybeSingle();
  if (walletResult.error) throw new Error("customer_read_unavailable");
  const wallet = walletResult.data as { id: number; status: string } | null;
  const walletId = wallet?.id;
  if (!walletId) {
    return {
      customer: baseCustomer,
      balances: summarizeWalletBuckets([]),
      ledger: [],
    };
  }

  const [balanceResult, accountResult] = await Promise.all([
    supabase
      .schema("loyalty")
      .from("wallet_balances")
      .select("account_kind,points")
      .eq("organization_id", context.organization.id)
      .eq("wallet_id", walletId),
    supabase
      .schema("loyalty")
      .from("ledger_accounts")
      .select("id,account_kind")
      .eq("organization_id", context.organization.id)
      .eq("wallet_id", walletId),
  ]);
  if (balanceResult.error || accountResult.error) {
    throw new Error("customer_read_unavailable");
  }
  const balances = summarizeWalletBuckets(
    (balanceResult.data ?? []) as WalletBucketRow[],
  );
  const customer: CustomerSummary = {
    ...baseCustomer,
    walletStatus: wallet?.status ?? null,
    pendingPoints: balances.pending,
    availablePoints: balances.available,
    reservedPoints: balances.reserved,
  };
  const accountIds = ((accountResult.data ?? []) as AccountRow[]).map(
    ({ id }) => id,
  );
  if (accountIds.length === 0) return { customer, balances, ledger: [] };

  const entryResult = await supabase
    .schema("loyalty")
    .from("ledger_entries")
    .select("transaction_id,account_id,points")
    .eq("organization_id", context.organization.id)
    .in("account_id", accountIds)
    .order("id", { ascending: false })
    .limit(100);
  if (entryResult.error) throw new Error("customer_read_unavailable");
  const entries = (entryResult.data ?? []) as EntryRow[];
  if (entries.length === 0) return { customer, balances, ledger: [] };

  const transactionIds = [
    ...new Set(entries.map(({ transaction_id }) => transaction_id)),
  ];
  const transactionResult = await supabase
    .schema("loyalty")
    .from("ledger_transactions")
    .select(
      "id,public_id,programme_version_id,transaction_kind,actor_type,source_reference,correlation_id,effective_at",
    )
    .eq("organization_id", context.organization.id)
    .in("id", transactionIds);
  if (transactionResult.error) throw new Error("customer_read_unavailable");
  const transactions = (transactionResult.data ?? []) as TransactionRow[];
  const versionIds = [
    ...new Set(
      transactions.map(({ programme_version_id }) => programme_version_id),
    ),
  ];
  const versionResult = await supabase
    .schema("loyalty")
    .from("programme_versions")
    .select("id,version_number")
    .eq("organization_id", context.organization.id)
    .in("id", versionIds);
  if (versionResult.error) throw new Error("customer_read_unavailable");
  const versionById = new Map(
    ((versionResult.data ?? []) as VersionRow[]).map((version) => [
      version.id,
      version.version_number,
    ]),
  );
  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const accountKindById = new Map(
    ((accountResult.data ?? []) as AccountRow[]).map((account) => [
      account.id,
      account.account_kind,
    ]),
  );

  return {
    customer,
    balances,
    ledger: entries.flatMap((entry) => {
      const transaction = transactionById.get(entry.transaction_id);
      return transaction
        ? [
            {
              id: transaction.public_id,
              kind: transaction.transaction_kind,
              actorType: transaction.actor_type,
              sourceReference: transaction.source_reference,
              bucket: accountKindById.get(entry.account_id) ?? "wallet",
              points: Number(entry.points),
              effectiveAt: transaction.effective_at,
              correlationId: transaction.correlation_id,
              programmeVersion:
                versionById.get(transaction.programme_version_id) ?? null,
            },
          ]
        : [];
    }),
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
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as {
    available_points?: unknown;
  } | null;
  return row && typeof row.available_points === "string"
    ? { availablePoints: row.available_points }
    : null;
}
