import {
  campaignPurchaseCandidateV1,
  campaignPurchaseEvaluationV1,
  type CampaignPurchaseCandidateV1,
  type CampaignPurchaseDecisionV1,
  type CampaignPurchaseEvaluationV1,
} from "@starfiniti/contracts/campaign";
import type { ProgrammeDefinitionV2 } from "@starfiniti/contracts/programme-v2";
import {
  evaluateEarningV2,
  type EarningEvaluationV2,
  type PurchaseEarningFactV2,
} from "./engine-v2";

const BASIS_POINTS = 10_000n;

export interface PurchaseCampaignEvaluationResultV1 {
  readonly baselineProgrammeEvaluation: EarningEvaluationV2;
  readonly programmeEvaluation: EarningEvaluationV2;
  readonly campaignEvaluation: CampaignPurchaseEvaluationV1;
}

function parseNonNegative(value: string, name: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError(`${name} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function matchingRuleCodes(
  candidate: CampaignPurchaseCandidateV1,
  evaluation: EarningEvaluationV2,
): readonly string[] {
  const contributing = new Set(
    evaluation.contributions
      .filter(
        (contribution) =>
          parseNonNegative(
            contribution.uncappedNumerator,
            "Contribution numerator",
          ) > 0n,
      )
      .map((contribution) => contribution.ruleCode),
  );
  return candidate.behavior.earningRuleCodes.filter((ruleCode) =>
    contributing.has(ruleCode),
  );
}

function campaignMultiplierPoints(
  evaluation: EarningEvaluationV2,
  multiplierBasisPoints: number,
): bigint {
  const base = evaluation.contributions.find(
    (contribution) => contribution.effectKind === "base_rate",
  );
  if (!base)
    throw new TypeError("Purchase evaluation has no base contribution");
  const numerator = parseNonNegative(
    base.uncappedNumerator,
    "Base contribution numerator",
  );
  const denominator = parseNonNegative(
    base.denominator,
    "Base contribution denominator",
  );
  if (denominator === 0n) {
    throw new TypeError("Base contribution denominator must be positive");
  }
  const multiplied =
    (numerator * BigInt(multiplierBasisPoints)) / (denominator * BASIS_POINTS);
  const basePoints = numerator / denominator;
  return multiplied > basePoints ? multiplied - basePoints : 0n;
}

function hasEffectCapacity(candidate: CampaignPurchaseCandidateV1): boolean {
  return (
    parseNonNegative(candidate.remainingGlobalEffects, "Global capacity") >
      0n &&
    parseNonNegative(candidate.remainingMemberEffects, "Member capacity") > 0n
  );
}

function compareSelection(
  left: { readonly priority: number; readonly key: string },
  right: { readonly priority: number; readonly key: string },
): number {
  return right.priority - left.priority || left.key.localeCompare(right.key);
}

export function evaluatePurchaseCampaignsV1(
  programme: ProgrammeDefinitionV2,
  fact: PurchaseEarningFactV2,
  suppliedCandidates: readonly CampaignPurchaseCandidateV1[],
): PurchaseCampaignEvaluationResultV1 {
  const candidates = suppliedCandidates.map((candidate) =>
    campaignPurchaseCandidateV1.parse(candidate),
  );
  const identities = candidates.map((candidate) => candidate.campaignVersionId);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError(
      "Campaign candidates must have unique version identities",
    );
  }

  const baselineProgrammeEvaluation = evaluateEarningV2(programme, fact);
  const matched = candidates
    .map((candidate) => ({
      candidate,
      matchedRuleCodes: matchingRuleCodes(
        candidate,
        baselineProgrammeEvaluation,
      ),
    }))
    .filter((entry) => entry.matchedRuleCodes.length > 0);

  const decisions: CampaignPurchaseDecisionV1[] = [];
  for (const entry of matched) {
    const { candidate, matchedRuleCodes } = entry;
    if (candidate.behavior.kind !== "bonus_points") continue;
    const points = BigInt(candidate.behavior.reward.points);
    const outcome =
      candidate.assignment === "control"
        ? "control"
        : !hasEffectCapacity(candidate) ||
            BigInt(candidate.remainingPoints) < points
          ? "capacity_exhausted"
          : "awarded";
    decisions.push({
      campaignVersionId: candidate.campaignVersionId,
      campaignCode: candidate.campaignCode,
      assignment: candidate.assignment,
      effectKind: "bonus_points",
      matchedRuleCodes: [...matchedRuleCodes],
      priority: null,
      points: outcome === "awarded" ? points.toString() : "0",
      outcome,
    });
  }

  const programmeMultiplierRule =
    baselineProgrammeEvaluation.selectedMultiplierRuleCode === null
      ? null
      : programme.earningRules.find(
          (rule) =>
            rule.code ===
              baselineProgrammeEvaluation.selectedMultiplierRuleCode &&
            rule.effect.kind === "multiplier",
        );
  if (
    baselineProgrammeEvaluation.selectedMultiplierRuleCode !== null &&
    !programmeMultiplierRule
  ) {
    throw new TypeError("Selected programme multiplier is unavailable");
  }

  const multiplierEntries = matched
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        candidate: CampaignPurchaseCandidateV1 & {
          behavior: Extract<
            CampaignPurchaseCandidateV1["behavior"],
            { kind: "purchase_multiplier" }
          >;
        };
      } => entry.candidate.behavior.kind === "purchase_multiplier",
    )
    .map((entry) => ({
      ...entry,
      points: campaignMultiplierPoints(
        baselineProgrammeEvaluation,
        entry.candidate.behavior.multiplierBasisPoints,
      ),
    }));

  const selectableCampaigns = multiplierEntries.filter(
    ({ candidate, points }) =>
      candidate.assignment === "treatment" &&
      points > 0n &&
      hasEffectCapacity(candidate) &&
      BigInt(candidate.remainingPoints) >= points,
  );
  const selections = [
    ...selectableCampaigns.map(({ candidate }) => ({
      kind: "campaign" as const,
      priority: candidate.behavior.priority,
      key: `campaign:${candidate.campaignCode}`,
      campaignVersionId: candidate.campaignVersionId,
    })),
    ...(programmeMultiplierRule
      ? [
          {
            kind: "programme" as const,
            priority: programmeMultiplierRule.priority,
            key: `programme:${programmeMultiplierRule.code}`,
            campaignVersionId: null,
          },
        ]
      : []),
  ].sort(compareSelection);
  const selected = selections[0] ?? null;
  const selectedCampaignVersionId =
    selected?.kind === "campaign" ? selected.campaignVersionId : null;

  for (const entry of multiplierEntries) {
    const { candidate, matchedRuleCodes, points } = entry;
    let outcome: CampaignPurchaseDecisionV1["outcome"];
    if (candidate.assignment === "control") {
      outcome = "control";
    } else if (
      points === 0n ||
      !hasEffectCapacity(candidate) ||
      BigInt(candidate.remainingPoints) < points
    ) {
      outcome = "capacity_exhausted";
    } else if (candidate.campaignVersionId === selectedCampaignVersionId) {
      outcome = "awarded";
    } else {
      outcome = "suppressed";
    }
    decisions.push({
      campaignVersionId: candidate.campaignVersionId,
      campaignCode: candidate.campaignCode,
      assignment: candidate.assignment,
      effectKind: "purchase_multiplier",
      matchedRuleCodes: [...matchedRuleCodes],
      priority: candidate.behavior.priority,
      points: outcome === "awarded" ? points.toString() : "0",
      outcome,
    });
  }

  const suppressProgrammeMultiplier = selected?.kind === "campaign";
  const programmeEvaluation = suppressProgrammeMultiplier
    ? evaluateEarningV2(
        {
          ...programme,
          earningRules: programme.earningRules.map((rule) =>
            rule.effect.kind === "multiplier"
              ? { ...rule, enabled: false }
              : rule,
          ),
        },
        fact,
      )
    : baselineProgrammeEvaluation;
  const orderedDecisions = [...decisions].sort(
    (left, right) =>
      left.campaignCode.localeCompare(right.campaignCode) ||
      left.campaignVersionId.localeCompare(right.campaignVersionId),
  );
  const totalCampaignPoints = orderedDecisions.reduce(
    (sum, decision) => sum + BigInt(decision.points),
    0n,
  );
  const campaignEvaluation = campaignPurchaseEvaluationV1.parse({
    schemaVersion: "1",
    selectedCampaignMultiplierVersionId: selectedCampaignVersionId,
    suppressedProgrammeMultiplierRuleCode: suppressProgrammeMultiplier
      ? baselineProgrammeEvaluation.selectedMultiplierRuleCode
      : null,
    totalCampaignPoints: totalCampaignPoints.toString(),
    decisions: orderedDecisions,
  });
  return {
    baselineProgrammeEvaluation,
    programmeEvaluation,
    campaignEvaluation,
  };
}
