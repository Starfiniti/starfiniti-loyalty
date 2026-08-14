"use client";

import {
  programmeDefinitionV2,
  type ProgrammeDefinitionV2,
  type TierPolicyLevelV2,
  type TierPolicyV2,
  type TierQualificationMetricV2,
  type TierQualificationThresholdV2,
  type TierPerformanceV1,
} from "@starfiniti/contracts";
import {
  evaluateTierQualificationSnapshotV2,
  migrateLegacySpendTiersToPolicyV2,
} from "@starfiniti/domain";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  Gauge,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveProgrammeDraft, type ProgrammeActionState } from "./actions";
import { initialProgrammeDefinitionV2 } from "./earning-rules-model";

const emptyActionState: ProgrammeActionState = { kind: "idle", message: "" };
const metricOptions: ReadonlyArray<
  Readonly<{ value: TierQualificationMetricV2; label: string }>
> = [
  { value: "eligible_spend", label: "Eligible spend" },
  { value: "earned_points", label: "Earned points" },
  { value: "order_count", label: "Orders" },
  { value: "referral_count", label: "Successful referrals" },
  { value: "verified_action_count", label: "Verified actions" },
];

type Simulation = Readonly<{
  currentTierCode: string;
  eligibleSpendMinor: string;
  earnedPoints: string;
  orderCount: string;
  referralCount: string;
  verifiedActionCount: string;
  verifiedActivityCode: string;
}>;

function initialAdvancedDefinition(value: unknown): ProgrammeDefinitionV2 {
  const definition = initialProgrammeDefinitionV2(value).definition;
  return {
    ...definition,
    tierPolicy:
      definition.tierPolicy ??
      migrateLegacySpendTiersToPolicyV2(definition.tiers),
  };
}

function defaultThreshold(minimum: string): TierQualificationThresholdV2 {
  return {
    metric: "eligible_spend",
    minimum,
    activityCodes: [],
  };
}

function defaultLevel(
  tierCode: string,
  minimum: string,
  base: boolean,
  earningMultiplierBasisPoints = 10_000,
): TierPolicyLevelV2 {
  if (base) {
    return {
      tierCode,
      entry: null,
      retention: null,
      reentry: null,
      benefits: {
        earningMultiplierBasisPoints,
        rewardCodes: [],
        earlyAccess: false,
      },
    };
  }
  const expression = {
    operator: "all" as const,
    thresholds: [defaultThreshold(minimum)],
  };
  return {
    tierCode,
    entry: expression,
    retention: expression,
    reentry: expression,
    benefits: {
      earningMultiplierBasisPoints,
      rewardCodes: [],
      earlyAccess: false,
    },
  };
}

export function VipTiersEditor({
  canEdit,
  initialConfiguration,
  operationId,
  programmeId,
  simulatedAt,
  tierPerformance,
}: Readonly<{
  canEdit: boolean;
  initialConfiguration: unknown;
  operationId: string;
  programmeId: string;
  simulatedAt: string;
  tierPerformance: TierPerformanceV1;
}>) {
  const initial = useMemo(
    () => initialAdvancedDefinition(initialConfiguration),
    [initialConfiguration],
  );
  const [definition, setDefinition] = useState<ProgrammeDefinitionV2>(initial);
  const [simulation, setSimulation] = useState<Simulation>({
    currentTierCode: initial.tiers[0]?.code ?? "rose",
    eligibleSpendMinor: "12500",
    earnedPoints: "750",
    orderCount: "3",
    referralCount: "0",
    verifiedActionCount: "0",
    verifiedActivityCode: "verified-review",
  });
  const operationInput = useRef<HTMLInputElement>(null);
  const [actionState, action, pending] = useActionState(
    saveProgrammeDraft,
    emptyActionState,
  );
  const validation = programmeDefinitionV2.safeParse(definition);
  const evaluation = useMemo(() => {
    if (!definition.tierPolicy) return null;
    try {
      return evaluateTierQualificationSnapshotV2({
        policy: definition.tierPolicy,
        metrics: {
          eligibleSpendMinor: exact(simulation.eligibleSpendMinor),
          earnedPoints: exact(simulation.earnedPoints),
          orderCount: exact(simulation.orderCount),
          referralCount: exact(simulation.referralCount),
          verifiedActionCount: exact(simulation.verifiedActionCount),
          verifiedActionCounts:
            BigInt(exact(simulation.verifiedActionCount)) > 0n
              ? {
                  [simulation.verifiedActivityCode || "verified-action"]: exact(
                    simulation.verifiedActionCount,
                  ),
                }
              : {},
        },
        evaluatedAt: simulatedAt,
        currentTierCode: simulation.currentTierCode,
        previouslyHeldTierCodes: [],
        belowThresholdSince: null,
      });
    } catch {
      return null;
    }
  }, [definition.tierPolicy, simulatedAt, simulation]);

  useEffect(() => {
    if (actionState.kind === "success" && operationInput.current) {
      operationInput.current.value = crypto.randomUUID();
    }
  }, [actionState]);

  function updatePolicy(update: (policy: TierPolicyV2) => TierPolicyV2) {
    setDefinition((current) => ({
      ...current,
      tierPolicy: update(current.tierPolicy!),
    }));
  }

  function updateLevel(
    index: number,
    update: (level: TierPolicyLevelV2) => TierPolicyLevelV2,
  ) {
    updatePolicy((policy) => ({
      ...policy,
      levels: policy.levels.map((level, levelIndex) =>
        levelIndex === index ? update(level) : level,
      ),
    }));
  }

  function updateTierRate(index: number, pointsPerMajorUnit: string) {
    if (index === 0 || !/^[1-9][0-9]*$/u.test(pointsPerMajorUnit)) return;
    setDefinition((current) => {
      const baseRule = current.earningRules.find(
        (rule) => rule.enabled && rule.effect.kind === "base_rate",
      );
      if (baseRule?.effect.kind !== "base_rate") return current;
      const numerator = BigInt(pointsPerMajorUnit) * 10_000n;
      const baseRate = BigInt(baseRule.effect.pointsPerMajorUnit);
      if (numerator % baseRate !== 0n) return current;
      const multiplier = numerator / baseRate;
      if (multiplier < 10_000n || multiplier > 100_000n) return current;
      return {
        ...current,
        tiers: current.tiers.map((tier, tierIndex) =>
          tierIndex === index ? { ...tier, pointsPerMajorUnit } : tier,
        ),
        tierPolicy: {
          ...current.tierPolicy!,
          levels: current.tierPolicy!.levels.map((level, levelIndex) =>
            levelIndex === index
              ? {
                  ...level,
                  benefits: {
                    ...level.benefits,
                    earningMultiplierBasisPoints: Number(multiplier),
                  },
                }
              : level,
          ),
        },
      };
    });
  }

  function addTier() {
    setDefinition((current) => {
      const nextIndex = current.tiers.length + 1;
      const tierCode = `tier-${nextIndex}`;
      const lastMinimum = BigInt(
        current.tiers.at(-1)?.minimumEligibleSpendMinor ?? "0",
      );
      const nextMinimum = (lastMinimum + 10_000n).toString();
      return {
        ...current,
        tiers: [
          ...current.tiers,
          {
            code: tierCode,
            name: `Tier ${nextIndex}`,
            minimumEligibleSpendMinor: nextMinimum,
            pointsPerMajorUnit: current.tiers.at(-1)?.pointsPerMajorUnit ?? "5",
          },
        ],
        tierPolicy: {
          ...current.tierPolicy!,
          levels: [
            ...current.tierPolicy!.levels,
            defaultLevel(
              tierCode,
              nextMinimum,
              false,
              current.tierPolicy!.levels.at(-1)?.benefits
                .earningMultiplierBasisPoints ?? 10_000,
            ),
          ],
        },
      };
    });
  }

  function removeTier(index: number) {
    if (index === 0) return;
    setDefinition((current) => {
      const removedCode = current.tiers[index]?.code;
      const tiers = current.tiers.filter((_, tierIndex) => tierIndex !== index);
      const levels = current
        .tierPolicy!.levels.filter((_, levelIndex) => levelIndex !== index)
        .map((level) => ({
          ...level,
          benefits: {
            ...level.benefits,
            rewardCodes: level.benefits.rewardCodes.filter(
              (rewardCode) => rewardCode !== removedCode,
            ),
          },
        }));
      return {
        ...current,
        tiers,
        tierPolicy: { ...current.tierPolicy!, levels },
      };
    });
  }

  const validationMessages = validation.success
    ? []
    : Array.from(
        new Set(
          validation.error.issues
            .slice(0, 6)
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        ),
      );

  return (
    <form action={action} className="vip-workflow">
      <input name="programmeId" type="hidden" value={programmeId} />
      <input
        name="operationId"
        ref={operationInput}
        type="hidden"
        value={operationId}
      />
      <input
        name="configuration"
        type="hidden"
        value={JSON.stringify(definition)}
      />

      {!canEdit ? (
        <div className="vip-rollout-note" role="note">
          <ShieldCheck aria-hidden="true" />
          <span>
            Advanced VIP authoring is disabled for this tenant. Existing tier
            decisions and member progress remain visible and continue running.
          </span>
        </div>
      ) : null}

      <TierPerformance performance={tierPerformance} />

      <div className="vip-layout">
        <section
          className="ui-surface vip-builder"
          aria-labelledby="vip-policy-title"
        >
          <header className="programme-workflow-header">
            <div>
              <span className="programme-workflow-kicker">
                <Crown aria-hidden="true" /> Qualification policy
              </span>
              <h2 id="vip-policy-title">How members progress</h2>
              <p>
                Set the qualification window, lifecycle thresholds, and tier
                benefits. Every published version remains immutable.
              </p>
            </div>
            {canEdit ? (
              <button
                className="ui-button ui-button-secondary"
                onClick={addTier}
                type="button"
              >
                <Plus aria-hidden="true" /> Add tier
              </button>
            ) : null}
          </header>

          <div className="vip-policy-controls">
            <label>
              <span>Qualification window</span>
              <select
                disabled={!canEdit}
                value={definition.tierPolicy!.qualificationPeriod.kind}
                onChange={(event) =>
                  updatePolicy((policy) => ({
                    ...policy,
                    qualificationPeriod:
                      event.target.value === "lifetime"
                        ? { kind: "lifetime" }
                        : event.target.value === "calendar_year"
                          ? {
                              kind: "calendar_year",
                              timeZone: "Europe/Ljubljana",
                            }
                          : { kind: "rolling_days", days: 365 },
                  }))
                }
              >
                <option value="rolling_days">Rolling period</option>
                <option value="calendar_year">Calendar year</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            {definition.tierPolicy!.qualificationPeriod.kind ===
            "rolling_days" ? (
              <label>
                <span>Rolling days</span>
                <input
                  disabled={!canEdit}
                  min="1"
                  max="3650"
                  type="number"
                  value={definition.tierPolicy!.qualificationPeriod.days}
                  onChange={(event) =>
                    updatePolicy((policy) => ({
                      ...policy,
                      qualificationPeriod: {
                        kind: "rolling_days",
                        days: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
            ) : null}
            {definition.tierPolicy!.qualificationPeriod.kind ===
            "calendar_year" ? (
              <label>
                <span>Calendar timezone</span>
                <input
                  disabled={!canEdit}
                  value={definition.tierPolicy!.qualificationPeriod.timeZone}
                  onChange={(event) =>
                    updatePolicy((policy) => ({
                      ...policy,
                      qualificationPeriod: {
                        kind: "calendar_year",
                        timeZone: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ) : null}
            <label>
              <span>Downgrade grace (days)</span>
              <input
                disabled={!canEdit}
                min="0"
                max="365"
                type="number"
                value={definition.tierPolicy!.downgradeGraceDays}
                onChange={(event) =>
                  updatePolicy((policy) => ({
                    ...policy,
                    downgradeGraceDays: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className="vip-tier-list">
            {definition.tiers.map((tier, index) => (
              <article className="vip-tier-card" key={`${tier.code}-${index}`}>
                <div className="vip-tier-heading">
                  <span className="vip-tier-index">{index + 1}</span>
                  <div>
                    <strong>{tier.name || `Tier ${index + 1}`}</strong>
                    <small>
                      {index === 0 ? "Base tier" : "Qualified tier"}
                    </small>
                  </div>
                  {canEdit && index > 0 ? (
                    <button
                      aria-label={`Remove ${tier.name}`}
                      className="ui-icon-button"
                      onClick={() => removeTier(index)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="vip-tier-identity">
                  <label>
                    <span>Name</span>
                    <input
                      disabled={!canEdit}
                      maxLength={200}
                      value={tier.name}
                      onChange={(event) =>
                        setDefinition((current) => ({
                          ...current,
                          tiers: current.tiers.map((candidate, tierIndex) =>
                            tierIndex === index
                              ? { ...candidate, name: event.target.value }
                              : candidate,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Code</span>
                    <input disabled value={tier.code} />
                  </label>
                </div>
                {index > 0 ? (
                  <div className="vip-threshold-grid">
                    {(["entry", "retention", "reentry"] as const).map(
                      (kind) => (
                        <ThresholdEditor
                          canEdit={canEdit}
                          expression={
                            definition.tierPolicy!.levels[index]![kind]!
                          }
                          key={kind}
                          kind={kind}
                          onChange={(expression) =>
                            updateLevel(index, (level) => ({
                              ...level,
                              [kind]: expression,
                            }))
                          }
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <p className="vip-base-note">
                    Every member begins here. No qualification threshold is
                    required.
                  </p>
                )}
                <div className="vip-benefits">
                  <label>
                    <span>Points per major currency unit</span>
                    <input
                      disabled={!canEdit || index === 0}
                      min="1"
                      type="number"
                      value={tier.pointsPerMajorUnit}
                      onChange={(event) =>
                        updateTierRate(index, event.target.value)
                      }
                    />
                    <small>
                      {index === 0
                        ? "Edit the base rate in Earning rules."
                        : `${definition.tierPolicy!.levels[index]!.benefits.earningMultiplierBasisPoints / 10_000}× the base rate.`}
                    </small>
                  </label>
                  <label className="vip-checkbox">
                    <input
                      checked={
                        definition.tierPolicy!.levels[index]!.benefits
                          .earlyAccess
                      }
                      disabled={!canEdit}
                      type="checkbox"
                      onChange={(event) =>
                        updateLevel(index, (level) => ({
                          ...level,
                          benefits: {
                            ...level.benefits,
                            earlyAccess: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Early access benefit</span>
                  </label>
                  <fieldset className="vip-reward-access">
                    <legend>Tier-only reward access</legend>
                    {definition.rewards.filter((reward) =>
                      rewardAvailableForTier(reward, tier.code),
                    ).length ? (
                      definition.rewards
                        .filter((reward) =>
                          rewardAvailableForTier(reward, tier.code),
                        )
                        .map((reward) => (
                          <label className="vip-checkbox" key={reward.code}>
                            <input
                              checked={definition.tierPolicy!.levels[
                                index
                              ]!.benefits.rewardCodes.includes(reward.code)}
                              disabled={!canEdit}
                              type="checkbox"
                              onChange={(event) =>
                                updateLevel(index, (level) => ({
                                  ...level,
                                  benefits: {
                                    ...level.benefits,
                                    rewardCodes: event.target.checked
                                      ? [
                                          ...level.benefits.rewardCodes,
                                          reward.code,
                                        ]
                                      : level.benefits.rewardCodes.filter(
                                          (code) => code !== reward.code,
                                        ),
                                  },
                                }))
                              }
                            />
                            <span>{reward.name}</span>
                          </label>
                        ))
                    ) : (
                      <p>
                        Add this tier to a V2 reward&apos;s availability to
                        offer it as a tier benefit.
                      </p>
                    )}
                  </fieldset>
                </div>
              </article>
            ))}
          </div>
        </section>

        <TierSimulator
          definition={definition}
          evaluation={evaluation}
          simulation={simulation}
          setSimulation={setSimulation}
        />
      </div>

      <section className="ui-surface vip-save-bar">
        <div>
          <strong>
            {validation.success
              ? "Policy passes contract validation"
              : "Review the policy"}
          </strong>
          <span>
            Saving creates a new immutable draft. Member qualification does not
            change until publication.
          </span>
        </div>
        <button
          className="ui-button ui-button-primary"
          disabled={!canEdit || pending || !validation.success}
          type="submit"
        >
          {pending ? "Saving…" : "Save new VIP draft"}
        </button>
        {validationMessages.length ? (
          <ul className="vip-errors" role="alert">
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {actionState.kind !== "idle" ? (
          <p className={`action-message ${actionState.kind}`} role="status">
            {actionState.message}
          </p>
        ) : null}
      </section>
    </form>
  );
}

function ThresholdEditor({
  canEdit,
  expression,
  kind,
  onChange,
}: Readonly<{
  canEdit: boolean;
  expression: NonNullable<TierPolicyLevelV2["entry"]>;
  kind: "entry" | "retention" | "reentry";
  onChange: (value: NonNullable<TierPolicyLevelV2["entry"]>) => void;
}>) {
  return (
    <fieldset>
      <legend>{kind}</legend>
      <label>
        <span>Match rule</span>
        <select
          disabled={!canEdit}
          value={expression.operator}
          onChange={(event) =>
            onChange({
              ...expression,
              operator: event.target.value as "all" | "any",
            })
          }
        >
          <option value="all">All requirements</option>
          <option value="any">Any requirement</option>
        </select>
      </label>
      <div className="vip-threshold-rows">
        {expression.thresholds.map((threshold, thresholdIndex) => (
          <div
            className="vip-threshold-row"
            key={`${threshold.metric}:${thresholdIndex}`}
          >
            <label>
              <span>Measure</span>
              <select
                disabled={!canEdit}
                value={threshold.metric}
                onChange={(event) =>
                  onChange({
                    ...expression,
                    thresholds: expression.thresholds.map((candidate, index) =>
                      index === thresholdIndex
                        ? {
                            ...candidate,
                            metric: event.target
                              .value as TierQualificationMetricV2,
                            activityCodes: [],
                          }
                        : candidate,
                    ),
                  })
                }
              >
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Minimum</span>
              <input
                disabled={!canEdit}
                inputMode="numeric"
                min="1"
                type="number"
                value={threshold.minimum}
                onChange={(event) =>
                  onChange({
                    ...expression,
                    thresholds: expression.thresholds.map((candidate, index) =>
                      index === thresholdIndex
                        ? { ...candidate, minimum: event.target.value }
                        : candidate,
                    ),
                  })
                }
              />
            </label>
            {threshold.metric === "verified_action_count" ? (
              <label className="vip-action-codes">
                <span>Verified activity codes</span>
                <input
                  disabled={!canEdit}
                  placeholder="verified-review, custom-activity"
                  value={threshold.activityCodes.join(", ")}
                  onChange={(event) =>
                    onChange({
                      ...expression,
                      thresholds: expression.thresholds.map(
                        (candidate, index) =>
                          index === thresholdIndex
                            ? {
                                ...candidate,
                                activityCodes: Array.from(
                                  new Set(
                                    event.target.value
                                      .split(",")
                                      .map((value) => value.trim())
                                      .filter(Boolean),
                                  ),
                                ).slice(0, 100),
                              }
                            : candidate,
                      ),
                    })
                  }
                />
              </label>
            ) : null}
            {canEdit && expression.thresholds.length > 1 ? (
              <button
                aria-label={`Remove ${kind} requirement ${thresholdIndex + 1}`}
                className="ui-icon-button vip-threshold-remove"
                onClick={() =>
                  onChange({
                    ...expression,
                    thresholds: expression.thresholds.filter(
                      (_, index) => index !== thresholdIndex,
                    ),
                  })
                }
                type="button"
              >
                <Trash2 aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit && expression.thresholds.length < 20 ? (
        <button
          className="vip-add-threshold"
          onClick={() =>
            onChange({
              ...expression,
              thresholds: [...expression.thresholds, defaultThreshold("1")],
            })
          }
          type="button"
        >
          <Plus aria-hidden="true" /> Add requirement
        </button>
      ) : null}
    </fieldset>
  );
}

function TierPerformance({ performance }: { performance: TierPerformanceV1 }) {
  const cards = [
    {
      label: "Members with a tier",
      value: performance.membersWithTier,
      icon: Users,
    },
    {
      label: "Upgrades · 30 days",
      value: performance.transitions30Days.upgrades,
      icon: TrendingUp,
    },
    { label: "In grace", value: performance.inGrace, icon: Clock3 },
    {
      label: "Manual overrides",
      value: performance.activeManualOverrides,
      icon: ShieldCheck,
    },
  ];
  const maximum = performance.tiers.reduce(
    (value, tier) =>
      BigInt(tier.memberCount) > value ? BigInt(tier.memberCount) : value,
    0n,
  );
  return (
    <section
      className="ui-surface vip-performance"
      aria-labelledby="tier-performance-title"
    >
      <header>
        <div>
          <span className="programme-workflow-kicker">
            <Gauge aria-hidden="true" /> Live performance
          </span>
          <h2 id="tier-performance-title">Tier health</h2>
        </div>
        <span>{performance.totalMembers} members in programme wallets</span>
      </header>
      <div className="vip-performance-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      {performance.tiers.length ? (
        <div
          className="vip-distribution"
          aria-label="Current tier distribution"
        >
          {performance.tiers.map((tier) => (
            <div key={tier.tier.code}>
              <span>{tier.tier.name}</span>
              <i
                style={{
                  width:
                    maximum === 0n
                      ? "0%"
                      : `${Number((BigInt(tier.memberCount) * 100n) / maximum)}%`,
                }}
              />
              <strong>{tier.memberCount}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="vip-empty">
          Publish an advanced VIP version to start tier distribution reporting.
        </p>
      )}
    </section>
  );
}

function TierSimulator({
  definition,
  evaluation,
  simulation,
  setSimulation,
}: Readonly<{
  definition: ProgrammeDefinitionV2;
  evaluation: ReturnType<typeof evaluateTierQualificationSnapshotV2> | null;
  simulation: Simulation;
  setSimulation: (value: Simulation) => void;
}>) {
  return (
    <aside
      className="ui-surface vip-simulator"
      aria-labelledby="vip-simulator-title"
    >
      <span className="programme-workflow-kicker">
        <Sparkles aria-hidden="true" /> Deterministic preview
      </span>
      <h2 id="vip-simulator-title">Member progression</h2>
      <p>Test qualification metrics separately from spendable points.</p>
      <label>
        <span>Current tier</span>
        <select
          value={simulation.currentTierCode}
          onChange={(event) =>
            setSimulation({
              ...simulation,
              currentTierCode: event.target.value,
            })
          }
        >
          {definition.tiers.map((tier) => (
            <option key={tier.code} value={tier.code}>
              {tier.name}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["Eligible spend (minor units)", "eligibleSpendMinor"],
          ["Earned points", "earnedPoints"],
          ["Orders", "orderCount"],
          ["Referrals", "referralCount"],
          ["Verified actions", "verifiedActionCount"],
        ] as const
      ).map(([label, key]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            min="0"
            type="number"
            value={simulation[key]}
            onChange={(event) =>
              setSimulation({ ...simulation, [key]: event.target.value })
            }
          />
        </label>
      ))}
      <label>
        <span>Verified activity code</span>
        <input
          pattern="[a-z][a-z0-9_-]{0,79}"
          value={simulation.verifiedActivityCode}
          onChange={(event) =>
            setSimulation({
              ...simulation,
              verifiedActivityCode: event.target.value,
            })
          }
        />
      </label>
      {evaluation ? (
        <div className="vip-simulation-result">
          <div>
            <Crown aria-hidden="true" />
            <span>Effective tier</span>
            <strong>
              {tierName(definition, evaluation.effectiveTierCode)}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Qualified tier</dt>
              <dd>{tierName(definition, evaluation.qualifiedTierCode)}</dd>
            </div>
            <div>
              <dt>Movement</dt>
              <dd>{evaluation.transition}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>{windowLabel(definition.tierPolicy!)}</dd>
            </div>
          </dl>
          {evaluation.nextMilestone ? (
            <section>
              <strong>
                Next: {tierName(definition, evaluation.nextMilestone.tierCode)}
              </strong>
              {evaluation.nextMilestone.thresholds.map((threshold) => (
                <p
                  key={`${threshold.metric}:${threshold.activityCodes.join(",")}`}
                >
                  <Activity aria-hidden="true" /> {threshold.remaining}{" "}
                  {metricOptions
                    .find((item) => item.value === threshold.metric)
                    ?.label.toLowerCase()}{" "}
                  remaining
                </p>
              ))}
            </section>
          ) : (
            <p className="vip-complete">
              <CheckCircle2 aria-hidden="true" /> Highest tier reached
            </p>
          )}
        </div>
      ) : (
        <p className="vip-errors">
          Enter valid non-negative values to run the preview.
        </p>
      )}
      <footer>
        <CalendarClock aria-hidden="true" /> Previewed at a fixed instant so the
        result does not drift while editing.
      </footer>
    </aside>
  );
}

function exact(value: string): string {
  return /^(?:0|[1-9][0-9]*)$/u.test(value) ? value : "0";
}
function tierName(definition: ProgrammeDefinitionV2, code: string): string {
  return definition.tiers.find((tier) => tier.code === code)?.name ?? code;
}
function windowLabel(policy: TierPolicyV2): string {
  const period = policy.qualificationPeriod;
  if (period.kind === "rolling_days") return `${period.days} rolling days`;
  if (period.kind === "calendar_year")
    return `Calendar year · ${period.timeZone}`;
  return "Lifetime";
}

function rewardAvailableForTier(
  reward: ProgrammeDefinitionV2["rewards"][number],
  tierCode: string,
): boolean {
  const configuration = reward.configuration as Readonly<
    Record<string, unknown>
  >;
  if (configuration.version !== "2") return false;
  const availability = configuration.availability;
  if (!availability || typeof availability !== "object") return false;
  const tierCodes = (availability as Readonly<Record<string, unknown>>)
    .tierCodes;
  return Array.isArray(tierCodes) && tierCodes.includes(tierCode);
}
