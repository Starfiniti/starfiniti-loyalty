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
  points: number;
}>;

export function summarizeWalletBuckets(
  rows: readonly WalletBucketRow[],
): Readonly<Record<WalletBucket, number>> {
  const result: Record<WalletBucket, number> = {
    pending: 0,
    available: 0,
    reserved: 0,
    spent: 0,
    expired: 0,
    reversed: 0,
  };
  rows.forEach((row) => {
    result[row.account_kind] += Number(row.points);
  });
  return result;
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
