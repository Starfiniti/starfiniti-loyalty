const SELF_SERVICE_REWARD_KINDS = new Set([
  "fixed_discount",
  "percentage_discount",
  "free_shipping",
  "free_product",
  "exclusive_access",
  "custom",
]);

export function isSelfServiceRewardKind(kind: string): boolean {
  return SELF_SERVICE_REWARD_KINDS.has(kind);
}
