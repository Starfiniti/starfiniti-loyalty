import type { MembershipRole } from "@/lib/tenant-context";

export type ConnectorHealth = "healthy" | "stale" | "attention" | "disabled";

export function canRetryConnectorEffect(role: MembershipRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

export function connectorHealth(
  input: Readonly<{
    status: string;
    lastSeenAt: string | null;
    failedCount: number;
  }>,
  now = Date.now(),
): ConnectorHealth {
  if (input.status === "disabled") return "disabled";
  if (input.failedCount > 0) return "attention";
  if (
    !input.lastSeenAt ||
    !Number.isFinite(Date.parse(input.lastSeenAt)) ||
    now - Date.parse(input.lastSeenAt) > 15 * 60 * 1000
  ) {
    return "stale";
  }
  return "healthy";
}

export function connectorIssueLabel(kind: string): string {
  if (kind === "delivery") return "Delivery normalization";
  if (kind === "effect") return "Loyalty effect";
  if (kind === "command") return "WooCommerce command";
  return "Connector operation";
}
