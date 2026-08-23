"use client";

import { AlertCircle, Plus, Save, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import type {
  MerchantAudience,
  MerchantAudienceSnapshot,
  MerchantCampaign,
  MerchantCampaignReward,
} from "@/lib/server/campaigns";
import {
  createAudienceDraft,
  createCampaignDraft,
  type CampaignActionState,
} from "./actions";
import {
  buildAudienceDefinition,
  buildCampaignDefinition,
  audienceDraftInputFromDefinition,
  campaignDraftInputFromDefinition,
  type AudienceConditionInput,
  type AudienceDraftInput,
  type CampaignDraftInput,
} from "./campaign-builder-model";

const idle: CampaignActionState = { kind: "idle", message: "" };

const blankCondition = (): AudienceConditionInput => ({
  kind: "metric",
  metric: "available_points",
  operator: "at_least",
  minimum: "0",
  maximum: "",
  windowKind: "lifetime",
  rollingDays: "30",
  activityCodes: "",
  tierOperator: "in",
  tierCodes: "rose",
});

const blankAudience = (): AudienceDraftInput => ({
  code: "",
  name: "",
  description: "",
  match: "all",
  conditions: [blankCondition()],
});

const blankCampaign = (
  snapshotId: string,
  reward: MerchantCampaignReward | undefined,
): CampaignDraftInput => ({
  code: "",
  name: "",
  description: "",
  audienceSnapshotId: snapshotId,
  exclusionSnapshotIds: [],
  timezone: "Europe/Ljubljana",
  startsLocal: "",
  endsLocal: "",
  behaviorKind: "bonus_points",
  earningRuleCodes: "purchase-base",
  points: "100",
  multiplierBasisPoints: "20000",
  priority: "100",
  milestoneMetric: "order_count",
  milestoneThreshold: "5",
  activityCodes: "",
  minimumInactiveDays: "30",
  minimumEligibleSpendMinor: "0",
  tierMovement: "entry",
  tierCodes: "bloom",
  referralParty: "advocate",
  rewardKind: "points",
  rewardId: reward?.id ?? "",
  globalEffectLimit: "1000",
  perMemberEffectLimit: "1",
  maximumPoints: "100000",
  maximumLiabilityMinor: "500000",
  liabilityMinorPerEffect: reward?.amountMinor ?? "",
  liabilityCurrencyCode: reward?.currencyCode ?? "",
  liabilityMinorUnitDigits: String(reward?.currencyMinorUnitDigits ?? ""),
  controlBasisPoints: "1000",
});

function assignOperationId(event: React.FormEvent<HTMLFormElement>) {
  const input = event.currentTarget.elements.namedItem("operationId");
  if (input instanceof HTMLInputElement) input.value = crypto.randomUUID();
}

function ActionMessage({ state }: Readonly<{ state: CampaignActionState }>) {
  if (state.kind === "idle") return null;
  return (
    <p className={`campaign-form-message is-${state.kind}`} role="status">
      {state.kind === "error" ? <AlertCircle aria-hidden="true" /> : null}
      {state.message}
    </p>
  );
}

export function AudienceBuilder({
  canAuthor,
  enabled,
  programmeId,
  templates,
}: Readonly<{
  canAuthor: boolean;
  enabled: boolean;
  programmeId: string;
  templates: readonly MerchantAudience[];
}>) {
  const [draft, setDraft] = useState<AudienceDraftInput>(blankAudience);
  const [state, action, pending] = useActionState(createAudienceDraft, idle);
  const definition = useMemo(() => buildAudienceDefinition(draft), [draft]);
  const updateCondition = (
    index: number,
    patch: Partial<AudienceConditionInput>,
  ) =>
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, candidate) =>
        candidate === index ? { ...condition, ...patch } : condition,
      ),
    }));

  const authoringEnabled = canAuthor && enabled;
  return (
    <section className="campaign-panel" id="audience-builder">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Audience builder</p>
          <h2>Create a versioned segment</h2>
          <p>
            Combine allowlisted loyalty and commerce facts. No arbitrary SQL or
            browser-supplied member identity is accepted.
          </p>
        </div>
        <span
          className={`ui-badge ${definition ? "ui-badge-success" : "ui-badge-warning"}`}
        >
          {definition ? "Valid draft" : "Needs review"}
        </span>
      </div>
      <form
        action={action}
        className="campaign-builder-form"
        onSubmit={assignOperationId}
      >
        <input name="operationId" type="hidden" />
        <input name="programmeId" type="hidden" value={programmeId} />
        <input
          name="definition"
          type="hidden"
          value={definition ? JSON.stringify(definition) : ""}
        />
        {templates.length > 0 ? (
          <label className="campaign-template-picker">
            <span>Edit as a new immutable version</span>
            <select
              defaultValue=""
              onChange={(event) => {
                const [audienceId, versionId] = event.target.value.split(":");
                const version = templates
                  .find((audience) => audience.id === audienceId)
                  ?.versions.find((candidate) => candidate.id === versionId);
                if (version) {
                  setDraft(
                    audienceDraftInputFromDefinition(version.definition),
                  );
                }
              }}
            >
              <option value="">Start with a blank audience</option>
              {templates.flatMap((audience) =>
                audience.versions.map((version) => (
                  <option
                    key={version.id}
                    value={`${audience.id}:${version.id}`}
                  >
                    {version.definition.name} · v{version.versionNumber} ·{" "}
                    {version.status}
                  </option>
                )),
              )}
            </select>
          </label>
        ) : null}
        <div className="campaign-form-grid three-columns">
          <label>
            <span>Name</span>
            <input
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="High-value members"
              required
              value={draft.name}
            />
          </label>
          <label>
            <span>Stable code</span>
            <input
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
              pattern="[a-z][a-z0-9_-]{0,79}"
              placeholder="high_value"
              required
              value={draft.code}
            />
          </label>
          <label>
            <span>Match</span>
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  match: event.target.value as "all" | "any",
                }))
              }
              value={draft.match}
            >
              <option value="all">All conditions</option>
              <option value="any">Any condition</option>
            </select>
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea
            maxLength={500}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Who this audience represents and why it exists."
            rows={2}
            value={draft.description}
          />
        </label>

        <div className="campaign-condition-list">
          {draft.conditions.map((condition, index) => (
            <fieldset className="campaign-condition" key={index}>
              <legend>Condition {index + 1}</legend>
              <div className="campaign-form-grid four-columns">
                <label>
                  <span>Type</span>
                  <select
                    onChange={(event) =>
                      updateCondition(index, {
                        kind: event.target.value as "metric" | "tier",
                      })
                    }
                    value={condition.kind}
                  >
                    <option value="metric">Metric</option>
                    <option value="tier">VIP tier</option>
                  </select>
                </label>
                {condition.kind === "tier" ? (
                  <>
                    <label>
                      <span>Operator</span>
                      <select
                        onChange={(event) =>
                          updateCondition(index, {
                            tierOperator: event.target.value as "in" | "not_in",
                          })
                        }
                        value={condition.tierOperator}
                      >
                        <option value="in">Is one of</option>
                        <option value="not_in">Is not one of</option>
                      </select>
                    </label>
                    <label className="span-two">
                      <span>Tier codes, comma-separated</span>
                      <input
                        onChange={(event) =>
                          updateCondition(index, {
                            tierCodes: event.target.value,
                          })
                        }
                        value={condition.tierCodes}
                      />
                    </label>
                  </>
                ) : (
                  <MetricCondition
                    condition={condition}
                    update={(patch) => updateCondition(index, patch)}
                  />
                )}
                <button
                  aria-label={`Remove condition ${index + 1}`}
                  className="ui-button ui-button-danger campaign-remove-condition"
                  disabled={draft.conditions.length === 1}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditions: current.conditions.filter(
                        (_, candidate) => candidate !== index,
                      ),
                    }))
                  }
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </fieldset>
          ))}
        </div>
        <div className="campaign-form-footer">
          <button
            className="ui-button ui-button-secondary"
            disabled={draft.conditions.length >= 20}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                conditions: [...current.conditions, blankCondition()],
              }))
            }
            type="button"
          >
            <Plus aria-hidden="true" /> Add condition
          </button>
          <button
            className="ui-button ui-button-primary"
            disabled={!authoringEnabled || !definition || pending}
            type="submit"
          >
            <Save aria-hidden="true" />
            {pending ? "Saving…" : "Save audience draft"}
          </button>
        </div>
        {!authoringEnabled ? (
          <p className="campaign-form-note">
            {enabled
              ? "Only organization owners and admins can author audience versions."
              : "Campaign rollout is disabled. Existing audiences and accepted work remain visible."}
          </p>
        ) : null}
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

function MetricCondition({
  condition,
  update,
}: Readonly<{
  condition: AudienceConditionInput;
  update: (patch: Partial<AudienceConditionInput>) => void;
}>) {
  const needsWindow = [
    "eligible_spend",
    "earned_points",
    "order_count",
    "referral_count",
    "verified_action_count",
  ].includes(condition.metric);
  return (
    <>
      <label>
        <span>Metric</span>
        <select
          onChange={(event) => update({ metric: event.target.value })}
          value={condition.metric}
        >
          <option value="available_points">Available points</option>
          <option value="pending_points">Pending points</option>
          <option value="eligible_spend">Eligible spend</option>
          <option value="earned_points">Earned points</option>
          <option value="order_count">Order count</option>
          <option value="referral_count">Referral count</option>
          <option value="verified_action_count">Verified actions</option>
          <option value="customer_age_days">Customer age (days)</option>
          <option value="days_since_last_paid_order">Days inactive</option>
        </select>
      </label>
      <label>
        <span>Operator</span>
        <select
          onChange={(event) =>
            update({
              operator: event.target.value as
                "at_least" | "at_most" | "between",
            })
          }
          value={condition.operator}
        >
          <option value="at_least">At least</option>
          <option value="at_most">At most</option>
          <option value="between">Between</option>
        </select>
      </label>
      <label>
        <span>Minimum / value</span>
        <input
          inputMode="numeric"
          onChange={(event) => update({ minimum: event.target.value })}
          value={condition.minimum}
        />
      </label>
      {condition.operator === "between" ? (
        <label>
          <span>Maximum</span>
          <input
            inputMode="numeric"
            onChange={(event) => update({ maximum: event.target.value })}
            value={condition.maximum}
          />
        </label>
      ) : null}
      {needsWindow ? (
        <label>
          <span>Window</span>
          <select
            onChange={(event) =>
              update({
                windowKind: event.target.value as "lifetime" | "rolling_days",
              })
            }
            value={condition.windowKind}
          >
            <option value="lifetime">Lifetime</option>
            <option value="rolling_days">Rolling days</option>
          </select>
        </label>
      ) : null}
      {needsWindow && condition.windowKind === "rolling_days" ? (
        <label>
          <span>Rolling days</span>
          <input
            inputMode="numeric"
            max={3650}
            min={1}
            onChange={(event) => update({ rollingDays: event.target.value })}
            type="number"
            value={condition.rollingDays}
          />
        </label>
      ) : null}
      {condition.metric === "verified_action_count" ? (
        <label className="span-two">
          <span>Verified activity codes</span>
          <input
            onChange={(event) => update({ activityCodes: event.target.value })}
            placeholder="review, profile_completed"
            value={condition.activityCodes}
          />
        </label>
      ) : null}
    </>
  );
}

export function CampaignBuilder({
  canAuthor,
  enabled,
  programmeId,
  rewards,
  snapshots,
  templates,
}: Readonly<{
  canAuthor: boolean;
  enabled: boolean;
  programmeId: string;
  rewards: readonly MerchantCampaignReward[];
  snapshots: readonly MerchantAudienceSnapshot[];
  templates: readonly MerchantCampaign[];
}>) {
  const completeSnapshots = snapshots.filter(
    (snapshot) => snapshot.state === "complete",
  );
  const [draft, setDraft] = useState<CampaignDraftInput>(() =>
    blankCampaign(completeSnapshots[0]?.id ?? "", rewards[0]),
  );
  const [state, action, pending] = useActionState(createCampaignDraft, idle);
  const definition = useMemo(
    () => buildCampaignDefinition(draft, rewards),
    [draft, rewards],
  );
  const authoringEnabled = canAuthor && enabled;
  const rewardBearing = [
    "milestone",
    "win_back",
    "tier",
    "referral",
    "limited_quantity",
  ].includes(draft.behaviorKind);
  const nativeReward =
    draft.behaviorKind === "limited_quantity" ||
    (rewardBearing && draft.rewardKind === "programme_reward");
  const selectedReward = rewards.find((reward) => reward.id === draft.rewardId);

  const update = (patch: Partial<CampaignDraftInput>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <section className="campaign-panel" id="campaign-builder">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Campaign builder</p>
          <h2>Design a bounded value slice</h2>
          <p>
            Bind an immutable audience snapshot, explicit control group, exact
            schedule, member caps, and points or liability ceiling.
          </p>
        </div>
        <span
          className={`ui-badge ${definition ? "ui-badge-success" : "ui-badge-warning"}`}
        >
          {definition ? "Ready to save" : "Needs review"}
        </span>
      </div>
      <form
        action={action}
        className="campaign-builder-form"
        onSubmit={assignOperationId}
      >
        <input name="operationId" type="hidden" />
        <input name="programmeId" type="hidden" value={programmeId} />
        <input
          name="definition"
          type="hidden"
          value={definition ? JSON.stringify(definition) : ""}
        />
        {templates.length > 0 ? (
          <label className="campaign-template-picker">
            <span>Edit as a new immutable version</span>
            <select
              defaultValue=""
              onChange={(event) => {
                const [campaignId, versionId] = event.target.value.split(":");
                const version = templates
                  .find((campaign) => campaign.id === campaignId)
                  ?.versions.find((candidate) => candidate.id === versionId);
                if (version) {
                  setDraft(
                    campaignDraftInputFromDefinition(version.definition),
                  );
                }
              }}
            >
              <option value="">Start with a blank campaign</option>
              {templates.flatMap((campaign) =>
                campaign.versions.map((version) => (
                  <option
                    key={version.id}
                    value={`${campaign.id}:${version.id}`}
                  >
                    {version.definition.name} · v{version.versionNumber} ·{" "}
                    {version.status}
                  </option>
                )),
              )}
            </select>
          </label>
        ) : null}
        <div className="campaign-form-grid three-columns">
          <label>
            <span>Name</span>
            <input
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="September win-back"
              required
              value={draft.name}
            />
          </label>
          <label>
            <span>Stable code</span>
            <input
              maxLength={80}
              onChange={(event) => update({ code: event.target.value })}
              pattern="[a-z][a-z0-9_-]{0,79}"
              placeholder="september_winback"
              required
              value={draft.code}
            />
          </label>
          <label>
            <span>Behavior</span>
            <select
              onChange={(event) =>
                update({
                  behaviorKind: event.target
                    .value as CampaignDraftInput["behaviorKind"],
                })
              }
              value={draft.behaviorKind}
            >
              <option value="bonus_points">Purchase bonus points</option>
              <option value="purchase_multiplier">Purchase multiplier</option>
              <option value="milestone">Milestone</option>
              <option value="win_back">Win-back</option>
              <option value="tier">Tier movement</option>
              <option value="referral">Referral</option>
              <option value="limited_quantity">Limited reward</option>
            </select>
          </label>
        </div>
        <label>
          <span>Description</span>
          <textarea
            maxLength={500}
            onChange={(event) => update({ description: event.target.value })}
            rows={2}
            value={draft.description}
          />
        </label>

        <fieldset className="campaign-builder-group">
          <legend>Audience &amp; exclusions</legend>
          <div className="campaign-form-grid two-columns">
            <label>
              <span>Inclusion snapshot</span>
              <select
                onChange={(event) =>
                  update({ audienceSnapshotId: event.target.value })
                }
                required
                value={draft.audienceSnapshotId}
              >
                <option value="">Select a completed snapshot</option>
                {completeSnapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.memberCount} members ·{" "}
                    {new Date(snapshot.snapshotAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Exclusion snapshots (optional)</span>
              <select
                multiple
                onChange={(event) =>
                  update({
                    exclusionSnapshotIds: [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  })
                }
                value={[...draft.exclusionSnapshotIds]}
              >
                {completeSnapshots
                  .filter(
                    (snapshot) => snapshot.id !== draft.audienceSnapshotId,
                  )
                  .map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.memberCount} members · {snapshot.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="campaign-builder-group">
          <legend>Schedule</legend>
          <div className="campaign-form-grid three-columns">
            <label>
              <span>Timezone</span>
              <input
                list="campaign-timezones"
                onChange={(event) => update({ timezone: event.target.value })}
                required
                value={draft.timezone}
              />
              <datalist id="campaign-timezones">
                <option value="Europe/Ljubljana" />
                <option value="UTC" />
                <option value="Europe/London" />
                <option value="America/New_York" />
                <option value="America/Los_Angeles" />
                <option value="Australia/Sydney" />
              </datalist>
            </label>
            <label>
              <span>Starts</span>
              <input
                onChange={(event) =>
                  update({ startsLocal: event.target.value })
                }
                required
                type="datetime-local"
                value={draft.startsLocal}
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                onChange={(event) => update({ endsLocal: event.target.value })}
                required
                type="datetime-local"
                value={draft.endsLocal}
              />
            </label>
          </div>
          <p className="campaign-form-note">
            Ambiguous or missing daylight-saving wall times are rejected before
            submission and revalidated in PostgreSQL.
          </p>
        </fieldset>

        <fieldset className="campaign-builder-group">
          <legend>Behavior &amp; reward</legend>
          <BehaviorFields draft={draft} rewards={rewards} update={update} />
        </fieldset>

        <fieldset className="campaign-builder-group">
          <legend>Caps, budget &amp; control</legend>
          <div className="campaign-form-grid four-columns">
            <label>
              <span>Global effects</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  update({ globalEffectLimit: event.target.value })
                }
                value={draft.globalEffectLimit}
              />
            </label>
            <label>
              <span>Per member</span>
              <input
                disabled={draft.behaviorKind === "limited_quantity"}
                max={100}
                min={1}
                onChange={(event) =>
                  update({ perMemberEffectLimit: event.target.value })
                }
                type="number"
                value={
                  draft.behaviorKind === "limited_quantity"
                    ? "1"
                    : draft.perMemberEffectLimit
                }
              />
            </label>
            {!nativeReward ? (
              <label>
                <span>Maximum points</span>
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    update({ maximumPoints: event.target.value })
                  }
                  value={draft.maximumPoints}
                />
              </label>
            ) : (
              <>
                <label>
                  <span>Liability ceiling (minor)</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      update({ maximumLiabilityMinor: event.target.value })
                    }
                    value={draft.maximumLiabilityMinor}
                  />
                </label>
                <label>
                  <span>Face value / effect</span>
                  <output>
                    {selectedReward
                      ? `${selectedReward.amountMinor} ${selectedReward.currencyCode} minor units`
                      : "Select a published fixed discount"}
                  </output>
                </label>
                <label>
                  <span>Currency</span>
                  <output>
                    {selectedReward?.currencyCode ?? "Unavailable"}
                  </output>
                </label>
                <label>
                  <span>Currency precision</span>
                  <output>
                    {selectedReward?.currencyMinorUnitDigits ?? "Unavailable"}
                  </output>
                </label>
              </>
            )}
            <label>
              <span>Control group (basis points)</span>
              <input
                max={9000}
                min={0}
                onChange={(event) =>
                  update({ controlBasisPoints: event.target.value })
                }
                type="number"
                value={draft.controlBasisPoints}
              />
            </label>
          </div>
        </fieldset>
        <div className="campaign-form-footer">
          <span className="campaign-form-note">
            Saving creates a new immutable version. It does not schedule value.
          </span>
          <button
            className="ui-button ui-button-primary"
            disabled={!authoringEnabled || !definition || pending}
            type="submit"
          >
            <Save aria-hidden="true" />
            {pending ? "Saving…" : "Save campaign draft"}
          </button>
        </div>
        {!authoringEnabled ? (
          <p className="campaign-form-note">
            {enabled
              ? "Only organization owners and admins can author campaign versions."
              : "Campaign rollout is disabled. Accepted schedules and results remain available."}
          </p>
        ) : null}
        {completeSnapshots.length === 0 ? (
          <p className="campaign-form-message is-error" role="status">
            <AlertCircle aria-hidden="true" /> Publish an audience and create a
            completed snapshot before authoring a campaign.
          </p>
        ) : null}
        <ActionMessage state={state} />
      </form>
    </section>
  );
}

function BehaviorFields({
  draft,
  rewards,
  update,
}: Readonly<{
  draft: CampaignDraftInput;
  rewards: readonly MerchantCampaignReward[];
  update: (patch: Partial<CampaignDraftInput>) => void;
}>) {
  const rewardBearing = ["milestone", "win_back", "tier", "referral"].includes(
    draft.behaviorKind,
  );
  return (
    <div className="campaign-form-grid four-columns">
      {["bonus_points", "purchase_multiplier"].includes(draft.behaviorKind) ? (
        <label className="span-two">
          <span>Earning rule codes</span>
          <input
            onChange={(event) =>
              update({ earningRuleCodes: event.target.value })
            }
            value={draft.earningRuleCodes}
          />
        </label>
      ) : null}
      {draft.behaviorKind === "purchase_multiplier" ? (
        <>
          <label>
            <span>Multiplier basis points</span>
            <input
              min={10001}
              onChange={(event) =>
                update({ multiplierBasisPoints: event.target.value })
              }
              type="number"
              value={draft.multiplierBasisPoints}
            />
          </label>
          <label>
            <span>Priority</span>
            <input
              min={0}
              onChange={(event) => update({ priority: event.target.value })}
              type="number"
              value={draft.priority}
            />
          </label>
        </>
      ) : null}
      {draft.behaviorKind === "milestone" ? (
        <>
          <label>
            <span>Milestone metric</span>
            <select
              onChange={(event) =>
                update({ milestoneMetric: event.target.value })
              }
              value={draft.milestoneMetric}
            >
              <option value="eligible_spend">Eligible spend</option>
              <option value="earned_points">Earned points</option>
              <option value="order_count">Order count</option>
              <option value="referral_count">Referral count</option>
              <option value="verified_action_count">Verified actions</option>
            </select>
          </label>
          <label>
            <span>Threshold</span>
            <input
              inputMode="numeric"
              onChange={(event) =>
                update({ milestoneThreshold: event.target.value })
              }
              value={draft.milestoneThreshold}
            />
          </label>
          {draft.milestoneMetric === "verified_action_count" ? (
            <label className="span-two">
              <span>Verified activity codes</span>
              <input
                onChange={(event) =>
                  update({ activityCodes: event.target.value })
                }
                value={draft.activityCodes}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {draft.behaviorKind === "win_back" ? (
        <>
          <label>
            <span>Minimum inactive days</span>
            <input
              min={1}
              onChange={(event) =>
                update({ minimumInactiveDays: event.target.value })
              }
              type="number"
              value={draft.minimumInactiveDays}
            />
          </label>
          <label>
            <span>Minimum eligible spend (minor)</span>
            <input
              inputMode="numeric"
              onChange={(event) =>
                update({ minimumEligibleSpendMinor: event.target.value })
              }
              value={draft.minimumEligibleSpendMinor}
            />
          </label>
        </>
      ) : null}
      {draft.behaviorKind === "tier" ? (
        <>
          <label>
            <span>Movement</span>
            <select
              onChange={(event) =>
                update({
                  tierMovement: event.target
                    .value as CampaignDraftInput["tierMovement"],
                })
              }
              value={draft.tierMovement}
            >
              <option value="entry">Entry</option>
              <option value="retention">Retention</option>
              <option value="re_entry">Re-entry</option>
            </select>
          </label>
          <label>
            <span>Tier codes</span>
            <input
              onChange={(event) => update({ tierCodes: event.target.value })}
              value={draft.tierCodes}
            />
          </label>
        </>
      ) : null}
      {draft.behaviorKind === "referral" ? (
        <label>
          <span>Rewarded party</span>
          <select
            onChange={(event) =>
              update({
                referralParty: event.target
                  .value as CampaignDraftInput["referralParty"],
              })
            }
            value={draft.referralParty}
          >
            <option value="advocate">Advocate</option>
            <option value="friend">Friend</option>
          </select>
        </label>
      ) : null}
      {rewardBearing ? (
        <label>
          <span>Reward type</span>
          <select
            onChange={(event) =>
              update({
                rewardKind: event.target
                  .value as CampaignDraftInput["rewardKind"],
              })
            }
            value={draft.rewardKind}
          >
            <option value="points">Points</option>
            <option value="programme_reward">Fixed discount reward</option>
          </select>
        </label>
      ) : null}
      {(rewardBearing && draft.rewardKind === "points") ||
      draft.behaviorKind === "bonus_points" ? (
        <label>
          <span>Points per effect</span>
          <input
            inputMode="numeric"
            onChange={(event) => update({ points: event.target.value })}
            value={draft.points}
          />
        </label>
      ) : null}
      {draft.behaviorKind === "limited_quantity" ||
      (rewardBearing && draft.rewardKind === "programme_reward") ? (
        <label className="span-two">
          <span>Published fixed discount</span>
          <select
            onChange={(event) => update({ rewardId: event.target.value })}
            value={draft.rewardId}
          >
            <option value="">Select a published fixed discount</option>
            {rewards.map((reward) => (
              <option key={reward.id} value={reward.id}>
                {reward.name} · {reward.amountMinor} {reward.currencyCode} minor
                units
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
