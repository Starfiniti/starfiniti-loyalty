import { points, type MinorUnit, type Points } from "./values";

export type ProgrammeVersionId = string & {
  readonly __brand: "ProgrammeVersionId";
};
export type TierCode = string & { readonly __brand: "TierCode" };

export interface TierDefinition {
  readonly code: TierCode;
  readonly name: string;
  readonly minimumEligibleSpendMinor: MinorUnit;
  readonly pointsPerMajorUnit: Points;
}

export interface ProgrammeVersion {
  readonly id: ProgrammeVersionId;
  readonly version: number;
  readonly status: "published";
  readonly currencyCode: string;
  readonly minorUnitsPerMajor: number;
  readonly pointUnitName: string;
  readonly redemption: {
    readonly pointsPerMajorUnit: Points;
    readonly cashRedemption: false;
  };
  readonly award: {
    readonly initialState: "pending";
    readonly releaseDelayDays: number;
    readonly rounding: "floor-once-per-order";
    readonly tierSnapshotRequired: true;
  };
  readonly eligibleSpend: {
    readonly afterDiscounts: true;
    readonly excludes: readonly [
      "shipping",
      "tax",
      "fees",
      "gift-card-and-store-credit-payments",
      "refunded-amounts",
    ];
  };
  readonly refund: {
    readonly attribution: "original-order-lines";
    readonly cumulativeRounding: "floor-with-full-refund-cap";
    readonly insufficientBalance: "allow-negative-and-offset-future-earnings";
    readonly blocksCheckout: false;
  };
  readonly expiry: {
    readonly kind: "rolling-lot";
    readonly monthsFromAvailableAt: number;
    readonly redemptionOrder: "earliest-expiry-first";
  };
  readonly tierQualification: {
    readonly spendBasis: "eligible-spend";
    readonly rollingMonths: number;
    readonly downgradeGraceDays: number;
  };
  readonly identity: {
    readonly guestClaim: "verified-channel-link";
    readonly mergeByEmailAlone: false;
  };
  readonly walletSharing: {
    readonly default: "disabled";
    readonly enablement: "explicit-programme-group-allowlist";
  };
  readonly tiers: readonly TierDefinition[];
}

export interface OrderAwardQuote {
  readonly programmeVersionId: ProgrammeVersionId;
  readonly tierCode: TierCode;
  readonly eligibleSpendMinor: MinorUnit;
  readonly points: Points;
  readonly state: "pending";
  readonly pendingAt: string;
  readonly availableAt: string;
  readonly expiresAt: string;
}

export interface RefundAttribution {
  readonly originalEligibleSpendMinor: MinorUnit;
  readonly originalAwardedPoints: Points;
  readonly cumulativeRefundedEligibleSpendMinor: MinorUnit;
  readonly alreadyReversedPoints: Points;
}

export interface ExpiryLot {
  readonly id: string;
  readonly availableAt: string;
  readonly expiresAt: string;
  readonly remainingPoints: Points;
}

export interface TierReview {
  readonly currentTierCode: TierCode;
  readonly qualifiedTierCode: TierCode;
  readonly effectiveTierCode: TierCode;
  readonly transition: "none" | "upgrade" | "grace" | "downgrade" | "manual";
  readonly belowThresholdSince: string | null;
  readonly graceUntil: string | null;
}

function requireNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty`);
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive safe integer`);
}

function requireNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative safe integer`);
}

function parseInstant(value: string, name: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()))
    throw new TypeError(`${name} is invalid`);
  return instant;
}

function toSafeNumber(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError(`${name} exceeds the safe integer range`);
  return Number(value);
}

function addUtcDays(value: string, days: number): string {
  const instant = parseInstant(value, "Instant");
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString();
}

function addUtcMonthsClamped(value: string, months: number): string {
  const instant = parseInstant(value, "Instant");
  const originalDay = instant.getUTCDate();
  instant.setUTCDate(1);
  instant.setUTCMonth(instant.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 0),
  ).getUTCDate();
  instant.setUTCDate(Math.min(originalDay, lastDay));
  return instant.toISOString();
}

export function programmeVersionId(value: string): ProgrammeVersionId {
  requireNonEmpty(value, "Programme version ID");
  return value as ProgrammeVersionId;
}

export function tierCode(value: string): TierCode {
  requireNonEmpty(value, "Tier code");
  return value as TierCode;
}

export function defineProgrammeVersion<const T extends ProgrammeVersion>(
  programme: T,
): T {
  validateProgrammeVersion(programme);
  return programme;
}

export function validateProgrammeVersion(
  programme: ProgrammeVersion,
): ProgrammeVersion {
  requireNonEmpty(programme.id, "Programme version ID");
  requirePositiveSafeInteger(programme.version, "Programme version");
  if (!/^[A-Z]{3}$/.test(programme.currencyCode))
    throw new TypeError("Currency code must be a three-letter uppercase code");
  requirePositiveSafeInteger(
    programme.minorUnitsPerMajor,
    "Minor units per major",
  );
  requireNonEmpty(programme.pointUnitName, "Point unit name");
  requirePositiveSafeInteger(
    programme.redemption.pointsPerMajorUnit,
    "Redemption points per major unit",
  );
  requirePositiveSafeInteger(
    programme.award.releaseDelayDays,
    "Award release delay days",
  );
  requirePositiveSafeInteger(
    programme.expiry.monthsFromAvailableAt,
    "Expiry months",
  );
  requirePositiveSafeInteger(
    programme.tierQualification.rollingMonths,
    "Tier rolling months",
  );
  requirePositiveSafeInteger(
    programme.tierQualification.downgradeGraceDays,
    "Tier downgrade grace days",
  );
  if (programme.tiers.length === 0)
    throw new TypeError("Programme must define at least one tier");

  const seen = new Set<string>();
  let previousMinimum = -1;
  for (const tier of programme.tiers) {
    requireNonEmpty(tier.code, "Tier code");
    requireNonEmpty(tier.name, "Tier name");
    requireNonNegative(tier.minimumEligibleSpendMinor, "Tier minimum spend");
    requirePositiveSafeInteger(tier.pointsPerMajorUnit, "Tier earn rate");
    if (seen.has(tier.code))
      throw new TypeError(`Duplicate tier code: ${tier.code}`);
    if (tier.minimumEligibleSpendMinor <= previousMinimum)
      throw new TypeError("Tier thresholds must be strictly increasing");
    seen.add(tier.code);
    previousMinimum = tier.minimumEligibleSpendMinor;
  }
  if (programme.tiers[0]?.minimumEligibleSpendMinor !== 0)
    throw new TypeError("The entry tier must start at zero eligible spend");

  return programme;
}

export function tierForEligibleSpend(
  programme: ProgrammeVersion,
  rollingEligibleSpendMinor: MinorUnit,
): TierDefinition {
  requireNonNegative(rollingEligibleSpendMinor, "Rolling eligible spend");
  let qualified = programme.tiers[0];
  if (!qualified) throw new TypeError("Programme has no tiers");
  for (const tier of programme.tiers) {
    if (tier.minimumEligibleSpendMinor > rollingEligibleSpendMinor) break;
    qualified = tier;
  }
  return qualified;
}

export function calculateOrderAward(
  programme: ProgrammeVersion,
  input: {
    readonly eligibleSpendMinor: MinorUnit;
    readonly tierCodeSnapshot: TierCode;
    readonly pendingAt: string;
  },
): OrderAwardQuote {
  requireNonNegative(input.eligibleSpendMinor, "Eligible spend");
  const tier = programme.tiers.find(
    (candidate) => candidate.code === input.tierCodeSnapshot,
  );
  if (!tier) throw new TypeError(`Unknown tier: ${input.tierCodeSnapshot}`);
  const pendingAt = parseInstant(
    input.pendingAt,
    "Pending instant",
  ).toISOString();
  const numerator =
    BigInt(input.eligibleSpendMinor) * BigInt(tier.pointsPerMajorUnit);
  const awardedPoints = points(
    toSafeNumber(
      numerator / BigInt(programme.minorUnitsPerMajor),
      "Awarded points",
    ),
  );
  const availableAt = addUtcDays(pendingAt, programme.award.releaseDelayDays);

  return {
    programmeVersionId: programme.id,
    tierCode: tier.code,
    eligibleSpendMinor: input.eligibleSpendMinor,
    points: awardedPoints,
    state: "pending",
    pendingAt,
    availableAt,
    expiresAt: addUtcMonthsClamped(
      availableAt,
      programme.expiry.monthsFromAvailableAt,
    ),
  };
}

export function calculateRefundReversal(
  attribution: RefundAttribution,
): Points {
  requirePositiveSafeInteger(
    attribution.originalEligibleSpendMinor,
    "Original eligible spend",
  );
  requireNonNegative(
    attribution.originalAwardedPoints,
    "Original awarded points",
  );
  requireNonNegative(
    attribution.cumulativeRefundedEligibleSpendMinor,
    "Cumulative refunded eligible spend",
  );
  requireNonNegative(
    attribution.alreadyReversedPoints,
    "Already reversed points",
  );
  if (
    attribution.cumulativeRefundedEligibleSpendMinor >
    attribution.originalEligibleSpendMinor
  ) {
    throw new RangeError("Cumulative refund exceeds original eligible spend");
  }
  if (attribution.alreadyReversedPoints > attribution.originalAwardedPoints)
    throw new RangeError("Already reversed points exceed original award");

  const targetCumulative =
    attribution.cumulativeRefundedEligibleSpendMinor ===
    attribution.originalEligibleSpendMinor
      ? attribution.originalAwardedPoints
      : points(
          toSafeNumber(
            (BigInt(attribution.originalAwardedPoints) *
              BigInt(attribution.cumulativeRefundedEligibleSpendMinor)) /
              BigInt(attribution.originalEligibleSpendMinor),
            "Refund reversal",
          ),
        );
  if (targetCumulative < attribution.alreadyReversedPoints)
    throw new RangeError("Cumulative refund moved backwards");
  return points(targetCumulative - attribution.alreadyReversedPoints);
}

export function balanceAfterReversal(
  availableBalance: Points,
  reversal: Points,
): Points {
  if (!Number.isSafeInteger(availableBalance))
    throw new TypeError("Available balance must be a safe integer");
  requireNonNegative(reversal, "Reversal points");
  return points(availableBalance - reversal);
}

export function orderLotsForRedemption(
  lots: readonly ExpiryLot[],
): readonly ExpiryLot[] {
  const seenIds = new Set<string>();
  for (const lot of lots) {
    requireNonEmpty(lot.id, "Expiry lot ID");
    if (seenIds.has(lot.id))
      throw new TypeError(`Duplicate expiry lot ID: ${lot.id}`);
    seenIds.add(lot.id);
    const availableAt = parseInstant(lot.availableAt, "Lot available instant");
    const expiresAt = parseInstant(lot.expiresAt, "Lot expiry instant");
    if (expiresAt <= availableAt)
      throw new RangeError("Lot expiry must be after availability");
    requireNonNegative(lot.remainingPoints, "Lot remaining points");
  }
  return [...lots].sort(
    (left, right) =>
      new Date(left.expiresAt).getTime() -
        new Date(right.expiresAt).getTime() ||
      new Date(left.availableAt).getTime() -
        new Date(right.availableAt).getTime() ||
      left.id.localeCompare(right.id),
  );
}

export function reviewTier(
  programme: ProgrammeVersion,
  input: {
    readonly currentTierCode: TierCode;
    readonly rollingEligibleSpendMinor: MinorUnit;
    readonly evaluatedAt: string;
    readonly belowThresholdSince: string | null;
    readonly manualTierCode?: TierCode;
  },
): TierReview {
  const currentIndex = programme.tiers.findIndex(
    (tier) => tier.code === input.currentTierCode,
  );
  if (currentIndex < 0)
    throw new TypeError(`Unknown current tier: ${input.currentTierCode}`);
  const qualified = tierForEligibleSpend(
    programme,
    input.rollingEligibleSpendMinor,
  );
  const qualifiedIndex = programme.tiers.findIndex(
    (tier) => tier.code === qualified.code,
  );
  const evaluatedAt = parseInstant(input.evaluatedAt, "Evaluation instant");

  if (input.manualTierCode !== undefined) {
    const manual = programme.tiers.find(
      (tier) => tier.code === input.manualTierCode,
    );
    if (!manual)
      throw new TypeError(`Unknown manual tier: ${input.manualTierCode}`);
    return {
      currentTierCode: input.currentTierCode,
      qualifiedTierCode: qualified.code,
      effectiveTierCode: manual.code,
      transition: "manual",
      belowThresholdSince: null,
      graceUntil: null,
    };
  }

  if (qualifiedIndex > currentIndex) {
    return {
      currentTierCode: input.currentTierCode,
      qualifiedTierCode: qualified.code,
      effectiveTierCode: qualified.code,
      transition: "upgrade",
      belowThresholdSince: null,
      graceUntil: null,
    };
  }
  if (qualifiedIndex === currentIndex) {
    return {
      currentTierCode: input.currentTierCode,
      qualifiedTierCode: qualified.code,
      effectiveTierCode: input.currentTierCode,
      transition: "none",
      belowThresholdSince: null,
      graceUntil: null,
    };
  }

  const belowSince = input.belowThresholdSince
    ? parseInstant(input.belowThresholdSince, "Below-threshold instant")
    : evaluatedAt;
  if (belowSince > evaluatedAt)
    throw new RangeError("Below-threshold instant cannot be in the future");
  const graceUntil = addUtcDays(
    belowSince.toISOString(),
    programme.tierQualification.downgradeGraceDays,
  );
  const inGrace = evaluatedAt.getTime() < new Date(graceUntil).getTime();
  return {
    currentTierCode: input.currentTierCode,
    qualifiedTierCode: qualified.code,
    effectiveTierCode: inGrace ? input.currentTierCode : qualified.code,
    transition: inGrace ? "grace" : "downgrade",
    belowThresholdSince: belowSince.toISOString(),
    graceUntil,
  };
}
