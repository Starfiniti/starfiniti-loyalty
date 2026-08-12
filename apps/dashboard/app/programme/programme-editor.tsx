"use client";

import { programmeDefinitionV1 } from "@starfiniti/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { saveProgrammeDraft, type ProgrammeActionState } from "./actions";

type TierDraft = Readonly<{
  code: string;
  name: string;
  minimumEligibleSpendMinor: string;
  pointsPerMajorUnit: string;
}>;

type RewardDraft = Readonly<{
  code: string;
  name: string;
  kind:
    | "fixed_discount"
    | "percentage_discount"
    | "free_product"
    | "free_shipping"
    | "store_credit"
    | "exclusive_access"
    | "custom";
  costPoints: string;
  configuration: Record<string, unknown>;
}>;

const emptyState: ProgrammeActionState = { kind: "idle", message: "" };

const fallbackTiers: TierDraft[] = [
  {
    code: "rose",
    name: "Rose",
    minimumEligibleSpendMinor: "0",
    pointsPerMajorUnit: "5",
  },
];

function nativeRewardConfiguration(
  kind: RewardDraft["kind"],
): Record<string, unknown> {
  if (kind === "fixed_discount") {
    return {
      amountMinor: "500",
      currencyMinorUnitDigits: 2,
      validityDays: 30,
    };
  }
  if (kind === "percentage_discount") {
    return {
      percentageBasisPoints: 1000,
      maximumDiscountMinor: null,
      currencyMinorUnitDigits: 2,
      validityDays: 30,
    };
  }
  if (kind === "free_shipping") return { validityDays: 30 };
  return {};
}

function minorToMajor(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return "";
  const padded = value.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function majorToMinor(value: string): string {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/u.exec(value);
  if (!match) return "0";
  const minor =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return minor > 0n ? minor.toString() : "0";
}

function initialDefinition(value: unknown): {
  tiers: TierDraft[];
  rewards: RewardDraft[];
} {
  const parsed = programmeDefinitionV1.safeParse(value);
  return parsed.success
    ? {
        tiers: parsed.data.tiers.map((tier) => ({ ...tier })),
        rewards: parsed.data.rewards.map((reward) => ({ ...reward })),
      }
    : { tiers: fallbackTiers, rewards: [] };
}

function formatMoney(minor: string): string {
  const amount = Number(minor) / 100;
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
      }).format(amount)
    : "Invalid amount";
}

export function ProgrammeEditor({
  programmeId,
  initialConfiguration,
  operationId,
}: {
  programmeId: string;
  initialConfiguration: unknown;
  operationId: string;
}) {
  const initial = useMemo(
    () => initialDefinition(initialConfiguration),
    [initialConfiguration],
  );
  const [tiers, setTiers] = useState<TierDraft[]>(initial.tiers);
  const [rewards, setRewards] = useState<RewardDraft[]>(initial.rewards);
  const [previewSpend, setPreviewSpend] = useState("150.00");
  const [state, action, pending] = useActionState(
    saveProgrammeDraft,
    emptyState,
  );

  const definition = { version: "1" as const, tiers, rewards };
  const validation = programmeDefinitionV1.safeParse(definition);
  const previewMinor = Math.max(
    0,
    Math.round(Number(previewSpend || "0") * 100),
  );
  const previewTier = validation.success
    ? [...validation.data.tiers]
        .reverse()
        .find(
          (tier) =>
            BigInt(tier.minimumEligibleSpendMinor) <= BigInt(previewMinor),
        )
    : undefined;
  const previewPoints = previewTier
    ? Math.floor(previewMinor / 100) * Number(previewTier.pointsPerMajorUnit)
    : 0;

  function updateTier(index: number, patch: Partial<TierDraft>) {
    setTiers((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...patch } : tier,
      ),
    );
  }

  function updateReward(index: number, patch: Partial<RewardDraft>) {
    setRewards((current) =>
      current.map((reward, rewardIndex) =>
        rewardIndex === index ? { ...reward, ...patch } : reward,
      ),
    );
  }

  return (
    <form action={action} className="programme-editor">
      <input name="programmeId" type="hidden" value={programmeId} />
      <input name="operationId" type="hidden" value={operationId} />
      <input
        name="configuration"
        type="hidden"
        value={JSON.stringify(definition)}
      />

      <section className="programme-panel" aria-labelledby="tiers-title">
        <div className="programme-panel-heading">
          <div>
            <p className="login-eyebrow">Earning policy</p>
            <h2 id="tiers-title">Tiers</h2>
            <p>
              Thresholds use eligible lifetime spend. Every tier starts from an
              exact euro amount and awards integer points per whole euro.
            </p>
          </div>
          <button
            className="secondary compact-action"
            type="button"
            onClick={() =>
              setTiers((current) => [
                ...current,
                {
                  code: `tier-${current.length + 1}`,
                  name: `Tier ${current.length + 1}`,
                  minimumEligibleSpendMinor: String(
                    Math.max(
                      0,
                      ...current.map((tier) =>
                        Number(tier.minimumEligibleSpendMinor),
                      ),
                    ) + 10000,
                  ),
                  pointsPerMajorUnit: "1",
                },
              ])
            }
          >
            <Plus aria-hidden="true" /> Add tier
          </button>
        </div>

        <div className="programme-list">
          {tiers.map((tier, index) => (
            <fieldset className="programme-row" key={`tier-${index}`}>
              <legend>Tier {index + 1}</legend>
              <label>
                Name
                <input
                  maxLength={200}
                  required
                  value={tier.name}
                  onChange={(event) =>
                    updateTier(index, { name: event.target.value })
                  }
                />
              </label>
              <label>
                Code
                <input
                  pattern="[a-z][a-z0-9_-]{0,79}"
                  required
                  value={tier.code}
                  onChange={(event) =>
                    updateTier(index, { code: event.target.value })
                  }
                />
              </label>
              <label>
                Spend threshold (EUR)
                <input
                  min="0"
                  required
                  step="0.01"
                  type="number"
                  value={Number(tier.minimumEligibleSpendMinor) / 100}
                  onChange={(event) =>
                    updateTier(index, {
                      minimumEligibleSpendMinor: String(
                        Math.round(Number(event.target.value) * 100),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Points per EUR
                <input
                  min="1"
                  required
                  step="1"
                  type="number"
                  value={tier.pointsPerMajorUnit}
                  onChange={(event) =>
                    updateTier(index, {
                      pointsPerMajorUnit: event.target.value,
                    })
                  }
                />
              </label>
              <button
                aria-label={`Remove ${tier.name || `tier ${index + 1}`}`}
                className="icon-danger"
                disabled={tiers.length === 1}
                type="button"
                onClick={() =>
                  setTiers((current) =>
                    current.filter((_, tierIndex) => tierIndex !== index),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </button>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="programme-panel" aria-labelledby="rewards-title">
        <div className="programme-panel-heading">
          <div>
            <p className="login-eyebrow">Redemption catalogue</p>
            <h2 id="rewards-title">Rewards</h2>
            <p>
              Rewards remain connector-neutral here. WooCommerce executes the
              matching native coupon command asynchronously.
            </p>
          </div>
          <button
            className="secondary compact-action"
            type="button"
            onClick={() =>
              setRewards((current) => [
                ...current,
                {
                  code: `reward-${current.length + 1}`,
                  name: `Reward ${current.length + 1}`,
                  kind: "fixed_discount",
                  costPoints: "100",
                  configuration: nativeRewardConfiguration("fixed_discount"),
                },
              ])
            }
          >
            <Plus aria-hidden="true" /> Add reward
          </button>
        </div>

        {rewards.length === 0 ? (
          <p className="empty-state">No redeemable rewards in this draft.</p>
        ) : (
          <div className="programme-list">
            {rewards.map((reward, index) => (
              <fieldset
                className="programme-row reward-row"
                key={`reward-${index}`}
              >
                <legend>Reward {index + 1}</legend>
                <label>
                  Name
                  <input
                    maxLength={200}
                    required
                    value={reward.name}
                    onChange={(event) =>
                      updateReward(index, { name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Code
                  <input
                    pattern="[a-z][a-z0-9_-]{0,79}"
                    required
                    value={reward.code}
                    onChange={(event) =>
                      updateReward(index, { code: event.target.value })
                    }
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={reward.kind}
                    onChange={(event) => {
                      const kind = event.target.value as RewardDraft["kind"];
                      updateReward(index, {
                        kind,
                        configuration: nativeRewardConfiguration(kind),
                      });
                    }}
                  >
                    <option value="fixed_discount">Fixed discount</option>
                    <option value="percentage_discount">
                      Percentage discount
                    </option>
                    <option value="free_product">Free product</option>
                    <option value="free_shipping">Free shipping</option>
                    <option value="store_credit">Store credit</option>
                    <option value="exclusive_access">Exclusive access</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label>
                  Cost (points)
                  <input
                    min="1"
                    required
                    step="1"
                    type="number"
                    value={reward.costPoints}
                    onChange={(event) =>
                      updateReward(index, { costPoints: event.target.value })
                    }
                  />
                </label>
                {reward.kind === "fixed_discount" ? (
                  <label>
                    Discount (EUR)
                    <input
                      min="0.01"
                      required
                      step="0.01"
                      type="number"
                      value={minorToMajor(reward.configuration.amountMinor)}
                      onChange={(event) =>
                        updateReward(index, {
                          configuration: {
                            ...reward.configuration,
                            amountMinor: majorToMinor(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ) : null}
                {reward.kind === "percentage_discount" ? (
                  <>
                    <label>
                      Discount (%)
                      <input
                        max="100"
                        min="0.01"
                        required
                        step="0.01"
                        type="number"
                        value={
                          Number(reward.configuration.percentageBasisPoints) /
                          100
                        }
                        onChange={(event) =>
                          updateReward(index, {
                            configuration: {
                              ...reward.configuration,
                              percentageBasisPoints: Math.round(
                                Number(event.target.value) * 100,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Maximum (EUR, optional)
                      <input
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={minorToMajor(
                          reward.configuration.maximumDiscountMinor,
                        )}
                        onChange={(event) =>
                          updateReward(index, {
                            configuration: {
                              ...reward.configuration,
                              maximumDiscountMinor: event.target.value
                                ? majorToMinor(event.target.value)
                                : null,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                ) : null}
                {[
                  "fixed_discount",
                  "percentage_discount",
                  "free_shipping",
                ].includes(reward.kind) ? (
                  <label>
                    Valid for (days)
                    <input
                      max="365"
                      min="1"
                      required
                      step="1"
                      type="number"
                      value={String(reward.configuration.validityDays ?? "")}
                      onChange={(event) =>
                        updateReward(index, {
                          configuration: {
                            ...reward.configuration,
                            validityDays: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ) : null}
                <button
                  aria-label={`Remove ${reward.name || `reward ${index + 1}`}`}
                  className="icon-danger"
                  type="button"
                  onClick={() =>
                    setRewards((current) =>
                      current.filter((_, rewardIndex) => rewardIndex !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </fieldset>
            ))}
          </div>
        )}
      </section>

      <aside className="programme-preview" aria-labelledby="preview-title">
        <div>
          <p className="login-eyebrow">Deterministic preview</p>
          <h2 id="preview-title">Example order</h2>
          <label>
            Eligible spend (EUR)
            <input
              min="0"
              step="0.01"
              type="number"
              value={previewSpend}
              onChange={(event) => setPreviewSpend(event.target.value)}
            />
          </label>
        </div>
        <dl>
          <div>
            <dt>Eligible spend</dt>
            <dd>{formatMoney(String(previewMinor))}</dd>
          </div>
          <div>
            <dt>Qualified tier</dt>
            <dd>{previewTier?.name ?? "Configuration invalid"}</dd>
          </div>
          <div>
            <dt>Pending award</dt>
            <dd>{previewPoints.toLocaleString("en")} points</dd>
          </div>
        </dl>
        <p>
          Preview uses the same versioned contract validation. Publication
          revalidates and materializes the exact configuration in PostgreSQL.
        </p>
      </aside>

      <div className="programme-save-bar">
        <div>
          <strong>
            {validation.success
              ? "Draft passes contract validation"
              : "Draft needs attention"}
          </strong>
          <p aria-live="polite" className={`action-message ${state.kind}`}>
            {state.message ||
              (!validation.success
                ? validation.error.issues[0]?.message
                : "Saving creates a new immutable version; it does not change the live programme.")}
          </p>
        </div>
        <button
          className="primary"
          disabled={pending || !validation.success}
          type="submit"
        >
          {pending ? "Saving draft..." : "Save new draft version"}
        </button>
      </div>
    </form>
  );
}
