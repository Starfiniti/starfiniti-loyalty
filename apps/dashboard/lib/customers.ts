export const CUSTOMER_SEARCH_MAX_LENGTH = 100;

export function normalizeCustomerSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, CUSTOMER_SEARCH_MAX_LENGTH);
}

export function escapePostgrestLike(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/[%_]/gu, "\\$&");
}

export type WalletBucket =
  "pending" | "available" | "reserved" | "spent" | "expired" | "reversed";

export type WalletBucketRow = Readonly<{
  account_kind: WalletBucket;
  points: string;
}>;

export function summarizeWalletBuckets(
  rows: readonly WalletBucketRow[],
): Readonly<Record<WalletBucket, string>> {
  const result: Record<WalletBucket, bigint> = {
    pending: 0n,
    available: 0n,
    reserved: 0n,
    spent: 0n,
    expired: 0n,
    reversed: 0n,
  };
  rows.forEach((row) => {
    result[row.account_kind] += BigInt(row.points);
  });
  return Object.fromEntries(
    Object.entries(result).map(([bucket, points]) => [
      bucket,
      points.toString(),
    ]),
  ) as Record<WalletBucket, string>;
}

export function isExactPointText(value: unknown): value is string {
  return typeof value === "string" && /^-?(0|[1-9][0-9]*)$/u.test(value);
}

export function formatPointText(value: string, locale = "en"): string {
  if (!isExactPointText(value)) throw new Error("invalid_point_value");
  return BigInt(value).toLocaleString(locale === "sl-SI" ? "sl-SI" : "en");
}

export function pointTextIsCredit(value: string): boolean {
  return isExactPointText(value) && BigInt(value) >= 0n;
}

export function maskExternalCustomerId(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

export function parseAdjustmentPoints(value: string): bigint | null {
  return /^-?[1-9][0-9]*$/u.test(value) ? BigInt(value) : null;
}

export function previewAvailablePoints(
  availablePoints: string,
  adjustmentPoints: string,
): bigint | null {
  const adjustment = parseAdjustmentPoints(adjustmentPoints);
  return adjustment === null ? null : BigInt(availablePoints) + adjustment;
}

export const CUSTOMER_ACTIVITY_FILTERS = [
  "all",
  "orders",
  "rewards",
  "expiry",
  "adjustments",
] as const;

export type CustomerActivityFilter = (typeof CUSTOMER_ACTIVITY_FILTERS)[number];

export function parseCustomerActivityFilter(
  value: unknown,
): CustomerActivityFilter {
  return typeof value === "string" &&
    CUSTOMER_ACTIVITY_FILTERS.includes(value as CustomerActivityFilter)
    ? (value as CustomerActivityFilter)
    : "all";
}

export function customerActivityCategory(
  kind: string,
): Exclude<CustomerActivityFilter, "all"> {
  if (kind === "award" || kind === "refund_reversal") return "orders";
  if (kind === "reserve" || kind === "capture" || kind === "cancel") {
    return "rewards";
  }
  if (kind === "expire" || kind === "release") return "expiry";
  return "adjustments";
}

export function filterCustomerActivity<T extends Readonly<{ kind: string }>>(
  items: readonly T[],
  filter: CustomerActivityFilter,
): readonly T[] {
  return filter === "all"
    ? items
    : items.filter((item) => customerActivityCategory(item.kind) === filter);
}
