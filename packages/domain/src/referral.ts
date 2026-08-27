import type { ReferralRiskPolicyV1 } from "@starfiniti/contracts/referral";

const DAY_MILLISECONDS = 86_400_000;

export type ReferralRiskCodeV1 =
  | "self_referral"
  | "advocate_monthly_limit"
  | "source_network_velocity"
  | "device_velocity"
  | "reused_payment_evidence"
  | "reused_shipping_evidence";

export type ReferralAttributionOutcomeV1 =
  | "accepted"
  | "duplicate"
  | "existing_attribution"
  | "outside_window"
  | "review"
  | "blocked";

export interface EvaluateReferralAttributionInputV1 {
  readonly advocateCustomerId: string;
  readonly friendCustomerId: string;
  readonly advocateCode: string;
  readonly capturedAt: string;
  readonly orderOccurredAt: string;
  readonly attributionWindowDays: number;
  readonly existingAttribution: Readonly<{
    advocateCustomerId: string;
    advocateCode: string;
  }> | null;
  readonly sourceNetworkReferralCount: number;
  readonly deviceReferralCount: number;
  readonly advocateMonthlyReferralCount: number;
  readonly monthlyAdvocateReferralLimit: number;
  readonly paymentEvidenceReused: boolean;
  readonly shippingEvidenceReused: boolean;
  readonly riskPolicy: ReferralRiskPolicyV1;
}

export interface ReferralAttributionEvaluationV1 {
  readonly outcome: ReferralAttributionOutcomeV1;
  readonly riskCodes: readonly ReferralRiskCodeV1[];
  readonly expiresAt: string;
}

function instant(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} is invalid`);
  return parsed;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} is outside its supported range`);
  }
  return value;
}

export function evaluateReferralAttributionV1(
  input: EvaluateReferralAttributionInputV1,
): ReferralAttributionEvaluationV1 {
  const windowDays = boundedInteger(
    input.attributionWindowDays,
    1,
    90,
    "Attribution window",
  );
  const capturedAt = instant(input.capturedAt, "Captured time");
  const orderOccurredAt = instant(input.orderOccurredAt, "Order time");
  const expiresAt = capturedAt + windowDays * DAY_MILLISECONDS;
  const result = (
    outcome: ReferralAttributionOutcomeV1,
    riskCodes: readonly ReferralRiskCodeV1[] = [],
  ): ReferralAttributionEvaluationV1 => ({
    outcome,
    riskCodes,
    expiresAt: new Date(expiresAt).toISOString(),
  });

  if (orderOccurredAt < capturedAt || orderOccurredAt > expiresAt) {
    return result("outside_window");
  }
  if (input.existingAttribution) {
    return result(
      input.existingAttribution.advocateCustomerId ===
        input.advocateCustomerId &&
        input.existingAttribution.advocateCode === input.advocateCode
        ? "duplicate"
        : "existing_attribution",
    );
  }
  if (input.advocateCustomerId === input.friendCustomerId) {
    return result("blocked", ["self_referral"]);
  }

  const riskCodes: ReferralRiskCodeV1[] = [];
  const monthlyLimit = boundedInteger(
    input.monthlyAdvocateReferralLimit,
    1,
    1_000,
    "Monthly advocate limit",
  );
  const monthlyCount = boundedInteger(
    input.advocateMonthlyReferralCount,
    0,
    1_000_000,
    "Monthly advocate count",
  );
  if (monthlyCount >= monthlyLimit) {
    riskCodes.push("advocate_monthly_limit");
  }
  if (
    input.sourceNetworkReferralCount >=
    input.riskPolicy.sourceNetworkReferralLimit
  ) {
    riskCodes.push("source_network_velocity");
  }
  if (input.deviceReferralCount >= input.riskPolicy.deviceReferralLimit) {
    riskCodes.push("device_velocity");
  }
  if (input.paymentEvidenceReused) {
    riskCodes.push("reused_payment_evidence");
  }
  if (input.shippingEvidenceReused) {
    riskCodes.push("reused_shipping_evidence");
  }
  if (riskCodes.length > 0 && input.riskPolicy.manualReviewEnabled) {
    return result("review", riskCodes);
  }
  return result("accepted", riskCodes);
}
