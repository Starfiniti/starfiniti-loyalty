"use client";

import { programmeDefinitionV1 } from "@starfiniti/contracts";
import {
  BadgeEuro,
  CheckCircle2,
  Coins,
  Gift,
  Percent,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { saveProgrammeDraft, type ProgrammeActionState } from "./actions";

export type ProgrammeEditorMode = "earning" | "rewards" | "tiers";

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

type NativeRewardKind = Extract<
  RewardDraft["kind"],
  "fixed_discount" | "percentage_discount" | "free_shipping"
>;

const emptyState: ProgrammeActionState = { kind: "idle", message: "" };
const supportedNativeKinds = new Set<RewardDraft["kind"]>([
  "fixed_discount",
  "percentage_discount",
  "free_shipping",
]);

const fallbackTiers: TierDraft[] = [
  {
    code: "rose",
    name: "Rose",
    minimumEligibleSpendMinor: "0",
    pointsPerMajorUnit: "5",
  },
];

function nativeRewardConfiguration(
  kind: NativeRewardKind,
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
  return { validityDays: 30 };
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

function formatMoney(minor: string | number, locale: MerchantLocale): string {
  const amount = Number(minor) / 100;
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(merchantIntlLocale(locale), {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      }).format(amount)
    : merchantText(locale, "Invalid amount");
}

function rewardKindLabel(kind: RewardDraft["kind"]): string {
  return {
    fixed_discount: "Fixed discount",
    percentage_discount: "Percentage discount",
    free_product: "Free product",
    free_shipping: "Free shipping",
    store_credit: "Store credit",
    exclusive_access: "Exclusive access",
    custom: "Custom reward",
  }[kind];
}

function rewardKindIcon(kind: RewardDraft["kind"]) {
  if (kind === "fixed_discount") return BadgeEuro;
  if (kind === "percentage_discount") return Percent;
  if (kind === "free_shipping") return Truck;
  return Gift;
}

function validationMessage(path: readonly PropertyKey[]): string {
  const field = path.at(-1);
  if (field === "minimumEligibleSpendMinor") {
    return "Tier thresholds must start at €0 and increase without overlap.";
  }
  if (field === "pointsPerMajorUnit") {
    return "Every tier needs a whole-number earning rate of at least 1 point.";
  }
  if (field === "costPoints") {
    return "Every reward needs a whole-number points cost of at least 1.";
  }
  if (field === "code") return "Codes must be unique lowercase identifiers.";
  return "Review the highlighted values before saving this draft.";
}

export function ProgrammeEditor({
  canEdit,
  programmeId,
  initialConfiguration,
  operationId,
  locale,
  mode,
}: {
  canEdit: boolean;
  programmeId: string;
  initialConfiguration: unknown;
  operationId: string;
  locale: MerchantLocale;
  mode: ProgrammeEditorMode;
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
  const supportedRewardCount = rewards.filter((reward) =>
    supportedNativeKinds.has(reward.kind),
  ).length;

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

  function addTier() {
    setTiers((current) => [
      ...current,
      {
        code: `tier-${current.length + 1}`,
        name: `Tier ${current.length + 1}`,
        minimumEligibleSpendMinor: String(
          Math.max(
            0,
            ...current.map((tier) => Number(tier.minimumEligibleSpendMinor)),
          ) + 10000,
        ),
        pointsPerMajorUnit: String(
          Math.max(
            1,
            ...current.map((tier) => Number(tier.pointsPerMajorUnit)),
          ) + 1,
        ),
      },
    ]);
  }

  function addReward(kind: NativeRewardKind = "fixed_discount") {
    setRewards((current) => [
      ...current,
      {
        code: `reward-${current.length + 1}`,
        name:
          kind === "fixed_discount"
            ? "€5 discount"
            : kind === "percentage_discount"
              ? "10% discount"
              : "Free shipping",
        kind,
        costPoints: kind === "free_shipping" ? "700" : "500",
        configuration: nativeRewardConfiguration(kind),
      },
    ]);
  }

  const validationMessages = validation.success
    ? []
    : Array.from(
        new Set(
          validation.error.issues
            .slice(0, 3)
            .map((issue) => validationMessage(issue.path)),
        ),
      );

  return (
    <form
      action={action}
      className={`programme-workflow programme-workflow-${mode}`}
    >
      <input name="lang" type="hidden" value={locale} />
      <input name="programmeId" type="hidden" value={programmeId} />
      <input name="operationId" type="hidden" value={operationId} />
      <input
        name="configuration"
        type="hidden"
        value={JSON.stringify(definition)}
      />

      <div className="programme-workflow-grid">
        {mode === "earning" ? (
          <>
            <section
              aria-labelledby="earning-rates-title"
              className="ui-surface programme-workflow-primary"
            >
              <header className="programme-workflow-header">
                <div>
                  <span className="programme-workflow-kicker">
                    <Coins aria-hidden="true" /> Purchase earning
                  </span>
                  <h2 id="earning-rates-title">Points earned per €1</h2>
                  <p>
                    Set the base earning rate for every tier. Rates apply to
                    each whole euro of eligible order spend.
                  </p>
                </div>
                <span className="ui-badge ui-badge-violet">
                  {tiers.length} {tiers.length === 1 ? "rate" : "rates"}
                </span>
              </header>

              <div className="earning-rate-list">
                {tiers.map((tier, index) => (
                  <article className="earning-rate-card" key={tier.code}>
                    <span className="earning-rate-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="earning-rate-copy">
                      <strong>{tier.name}</strong>
                      <span>
                        {index === 0
                          ? "Entry tier"
                          : `From ${formatMoney(tier.minimumEligibleSpendMinor, locale)} eligible spend`}
                      </span>
                    </div>
                    <label className="earning-rate-control">
                      <span>Points per €1</span>
                      <span className="earning-rate-input">
                        <input
                          aria-label={`${tier.name} points per euro`}
                          disabled={!canEdit}
                          inputMode="numeric"
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
                        <small>pts</small>
                      </span>
                    </label>
                  </article>
                ))}
              </div>

              <footer className="programme-workflow-footer-note">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Refunds reverse points against the original programme version,
                  so later rate changes never rewrite history.
                </span>
              </footer>
            </section>

            <aside
              aria-labelledby="earning-preview-title"
              className="ui-surface programme-workflow-aside"
            >
              <span className="programme-workflow-kicker">
                <Sparkles aria-hidden="true" /> Live preview
              </span>
              <h2 id="earning-preview-title">Example order</h2>
              <p>Check the exact base award before saving a new draft.</p>
              <label className="programme-preview-input">
                Eligible spend (EUR)
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={previewSpend}
                  onChange={(event) => setPreviewSpend(event.target.value)}
                />
              </label>
              <dl className="programme-preview-summary">
                <div>
                  <dt>Qualified tier</dt>
                  <dd>{previewTier?.name ?? "Invalid configuration"}</dd>
                </div>
                <div>
                  <dt>Base rate</dt>
                  <dd>{previewTier?.pointsPerMajorUnit ?? "—"} pts / €1</dd>
                </div>
                <div className="programme-preview-result">
                  <dt>Pending award</dt>
                  <dd>
                    {previewPoints.toLocaleString(merchantIntlLocale(locale))}{" "}
                    points
                  </dd>
                </div>
              </dl>
              <Link
                className="programme-inline-link"
                href={merchantLocalePath("/programme/vip-tiers", locale)}
              >
                Edit tier thresholds
              </Link>
            </aside>
          </>
        ) : null}

        {mode === "tiers" ? (
          <>
            <section
              aria-labelledby="tier-ladder-title"
              className="ui-surface programme-workflow-primary"
            >
              <header className="programme-workflow-header">
                <div>
                  <span className="programme-workflow-kicker">
                    <Star aria-hidden="true" /> Member progression
                  </span>
                  <h2 id="tier-ladder-title">VIP tier ladder</h2>
                  <p>
                    Members qualify from lifetime eligible spend. Thresholds
                    must start at €0 and increase without overlap.
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

              <div className="tier-ladder-list">
                {tiers.map((tier, index) => (
                  <fieldset
                    className="tier-ladder-card"
                    key={`${tier.code}-${index}`}
                  >
                    <legend>Tier {index + 1}</legend>
                    <div className="tier-ladder-symbol" aria-hidden="true">
                      <Star />
                    </div>
                    <label>
                      <span>Name</span>
                      <input
                        disabled={!canEdit}
                        maxLength={200}
                        required
                        value={tier.name}
                        onChange={(event) =>
                          updateTier(index, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Internal code</span>
                      <input
                        disabled={!canEdit}
                        pattern="[a-z][a-z0-9_-]{0,79}"
                        required
                        value={tier.code}
                        onChange={(event) =>
                          updateTier(index, { code: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Starts at (EUR)</span>
                      <input
                        disabled={!canEdit || index === 0}
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
                    <div className="tier-ladder-rate">
                      <span>Earning rate</span>
                      <strong>{tier.pointsPerMajorUnit} pts / €1</strong>
                    </div>
                    {canEdit ? (
                      <button
                        aria-label={`Remove ${tier.name || `tier ${index + 1}`}`}
                        className="ui-icon-button tier-remove-button"
                        disabled={tiers.length === 1 || index === 0}
                        onClick={() =>
                          setTiers((current) =>
                            current.filter(
                              (_, tierIndex) => tierIndex !== index,
                            ),
                          )
                        }
                        title={
                          index === 0
                            ? "The entry tier is required"
                            : "Remove tier"
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </fieldset>
                ))}
              </div>
            </section>

            <aside
              aria-labelledby="tier-preview-title"
              className="ui-surface programme-workflow-aside"
            >
              <span className="programme-workflow-kicker">
                <Sparkles aria-hidden="true" /> Qualification preview
              </span>
              <h2 id="tier-preview-title">Member movement</h2>
              <p>
                Preview which tier a member qualifies for at an exact spend.
              </p>
              <label className="programme-preview-input">
                Lifetime eligible spend (EUR)
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={previewSpend}
                  onChange={(event) => setPreviewSpend(event.target.value)}
                />
              </label>
              <div className="tier-preview-result">
                <div className="tier-preview-icon" aria-hidden="true">
                  <Star />
                </div>
                <span>Qualifies for</span>
                <strong>{previewTier?.name ?? "Invalid configuration"}</strong>
                <small>
                  {previewTier?.pointsPerMajorUnit ?? "—"} points per €1
                </small>
              </div>
              <Link
                className="programme-inline-link"
                href={merchantLocalePath("/programme/earning-rules", locale)}
              >
                Edit earning rates
              </Link>
            </aside>
          </>
        ) : null}

        {mode === "rewards" ? (
          <>
            <section
              aria-labelledby="reward-catalogue-title"
              className="ui-surface programme-workflow-primary"
            >
              <header className="programme-workflow-header">
                <div>
                  <span className="programme-workflow-kicker">
                    <Gift aria-hidden="true" /> Redemption catalogue
                  </span>
                  <h2 id="reward-catalogue-title">Rewards members can claim</h2>
                  <p>
                    Create WooCommerce-ready discounts and shipping rewards.
                    Coupon delivery remains asynchronous and checkout-safe.
                  </p>
                </div>
                {canEdit ? (
                  <button
                    className="ui-button ui-button-primary"
                    onClick={() => addReward()}
                    type="button"
                  >
                    <Plus aria-hidden="true" /> Add reward
                  </button>
                ) : null}
              </header>

              {rewards.length === 0 ? (
                <div className="reward-empty-state">
                  <div className="reward-empty-icon" aria-hidden="true">
                    <Gift />
                  </div>
                  <h3>Create your first reward</h3>
                  <p>
                    Give members a clear reason to spend their points. Start
                    with one of the WooCommerce-ready reward types.
                  </p>
                  {canEdit ? (
                    <div className="reward-presets">
                      <button
                        onClick={() => addReward("fixed_discount")}
                        type="button"
                      >
                        <BadgeEuro aria-hidden="true" />
                        <span>
                          <strong>Fixed discount</strong>
                          <small>Example: €5 off</small>
                        </span>
                      </button>
                      <button
                        onClick={() => addReward("percentage_discount")}
                        type="button"
                      >
                        <Percent aria-hidden="true" />
                        <span>
                          <strong>Percentage off</strong>
                          <small>Example: 10% off</small>
                        </span>
                      </button>
                      <button
                        onClick={() => addReward("free_shipping")}
                        type="button"
                      >
                        <Truck aria-hidden="true" />
                        <span>
                          <strong>Free shipping</strong>
                          <small>Time-limited coupon</small>
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="reward-catalogue-list">
                  {rewards.map((reward, index) => {
                    const RewardIcon = rewardKindIcon(reward.kind);
                    const supported = supportedNativeKinds.has(reward.kind);
                    return (
                      <fieldset
                        className="reward-catalogue-card"
                        key={`${reward.code}-${index}`}
                      >
                        <legend>Reward {index + 1}</legend>
                        <header>
                          <div className="reward-kind-icon" aria-hidden="true">
                            <RewardIcon />
                          </div>
                          <div>
                            <strong>
                              {reward.name || `Reward ${index + 1}`}
                            </strong>
                            <span>{rewardKindLabel(reward.kind)}</span>
                          </div>
                          <span
                            className={`ui-badge ${supported ? "ui-badge-success" : "ui-badge-warning"}`}
                          >
                            {supported
                              ? "WooCommerce ready"
                              : "Not delivered by WooCommerce"}
                          </span>
                          {canEdit ? (
                            <button
                              aria-label={`Remove ${reward.name || `reward ${index + 1}`}`}
                              className="ui-icon-button reward-remove-button"
                              onClick={() =>
                                setRewards((current) =>
                                  current.filter(
                                    (_, rewardIndex) => rewardIndex !== index,
                                  ),
                                )
                              }
                              title="Remove reward"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          ) : null}
                        </header>

                        <div className="reward-form-grid">
                          <label>
                            <span>Customer-facing name</span>
                            <input
                              disabled={!canEdit}
                              maxLength={200}
                              required
                              value={reward.name}
                              onChange={(event) =>
                                updateReward(index, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Internal code</span>
                            <input
                              disabled={!canEdit}
                              pattern="[a-z][a-z0-9_-]{0,79}"
                              required
                              value={reward.code}
                              onChange={(event) =>
                                updateReward(index, {
                                  code: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Reward type</span>
                            <select
                              disabled={!canEdit}
                              value={reward.kind}
                              onChange={(event) => {
                                const kind = event.target
                                  .value as NativeRewardKind;
                                updateReward(index, {
                                  kind,
                                  configuration:
                                    nativeRewardConfiguration(kind),
                                });
                              }}
                            >
                              {!supported ? (
                                <option value={reward.kind}>
                                  {rewardKindLabel(reward.kind)} — unavailable
                                </option>
                              ) : null}
                              <option value="fixed_discount">
                                Fixed discount
                              </option>
                              <option value="percentage_discount">
                                Percentage discount
                              </option>
                              <option value="free_shipping">
                                Free shipping
                              </option>
                            </select>
                          </label>
                          <label>
                            <span>Points cost</span>
                            <input
                              disabled={!canEdit}
                              min="1"
                              required
                              step="1"
                              type="number"
                              value={reward.costPoints}
                              onChange={(event) =>
                                updateReward(index, {
                                  costPoints: event.target.value,
                                })
                              }
                            />
                          </label>
                          {reward.kind === "fixed_discount" ? (
                            <label>
                              <span>Discount value (EUR)</span>
                              <input
                                disabled={!canEdit}
                                min="0.01"
                                required
                                step="0.01"
                                type="number"
                                value={minorToMajor(
                                  reward.configuration.amountMinor,
                                )}
                                onChange={(event) =>
                                  updateReward(index, {
                                    configuration: {
                                      ...reward.configuration,
                                      amountMinor: majorToMinor(
                                        event.target.value,
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                          ) : null}
                          {reward.kind === "percentage_discount" ? (
                            <label>
                              <span>Discount (%)</span>
                              <input
                                disabled={!canEdit}
                                max="100"
                                min="0.01"
                                required
                                step="0.01"
                                type="number"
                                value={
                                  Number(
                                    reward.configuration.percentageBasisPoints,
                                  ) / 100
                                }
                                onChange={(event) =>
                                  updateReward(index, {
                                    configuration: {
                                      ...reward.configuration,
                                      percentageBasisPoints: Math.round(
                                        Number(event.target.value) * 100,
                                      ),
                                      maximumDiscountMinor: null,
                                    },
                                  })
                                }
                              />
                            </label>
                          ) : null}
                          {supported ? (
                            <label>
                              <span>Valid for (days)</span>
                              <input
                                disabled={!canEdit}
                                max="365"
                                min="1"
                                required
                                step="1"
                                type="number"
                                value={String(
                                  reward.configuration.validityDays ?? "",
                                )}
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
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              )}
            </section>

            <aside
              aria-labelledby="reward-readiness-title"
              className="ui-surface programme-workflow-aside"
            >
              <span className="programme-workflow-kicker">
                <CheckCircle2 aria-hidden="true" /> Catalogue readiness
              </span>
              <h2 id="reward-readiness-title">Ready for members</h2>
              <p>
                Only rewards supported end to end by the live WooCommerce
                connector are offered for new setup.
              </p>
              <dl className="programme-preview-summary reward-readiness-list">
                <div>
                  <dt>Total rewards</dt>
                  <dd>{rewards.length}</dd>
                </div>
                <div>
                  <dt>WooCommerce ready</dt>
                  <dd>{supportedRewardCount}</dd>
                </div>
                <div>
                  <dt>Needs attention</dt>
                  <dd>{rewards.length - supportedRewardCount}</dd>
                </div>
              </dl>
              <div className="programme-safety-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  Saving creates an immutable draft. Members see changes only
                  after you review and publish that exact version.
                </p>
              </div>
            </aside>
          </>
        ) : null}
      </div>

      {canEdit ? (
        <section className="ui-surface programme-workflow-save">
          <div>
            <span
              className={`programme-save-status ${validation.success ? "is-valid" : "is-invalid"}`}
            >
              {validation.success ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <span aria-hidden="true">!</span>
              )}
              {validation.success
                ? "Ready to save as a new draft"
                : "Draft needs attention"}
            </span>
            <p aria-live="polite" className={`action-message ${state.kind}`}>
              {state.message ||
                (validation.success
                  ? "Saving preserves the rest of the programme and creates a new immutable version."
                  : "Fix the configuration issues before saving.")}
            </p>
            {validationMessages.length > 0 ? (
              <ul className="programme-validation-list">
                {validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            className="ui-button ui-button-primary programme-save-button"
            disabled={pending || !validation.success}
            type="submit"
          >
            {pending
              ? "Saving draft…"
              : mode === "earning"
                ? "Save earning rules"
                : mode === "tiers"
                  ? "Save VIP tiers"
                  : "Save rewards catalogue"}
          </button>
        </section>
      ) : (
        <section className="ui-surface programme-read-only-bar">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Read-only programme access</strong>
            <p>Only organization owners and admins can create a new draft.</p>
          </div>
        </section>
      )}
    </form>
  );
}
