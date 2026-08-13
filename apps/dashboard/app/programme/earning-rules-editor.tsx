"use client";

import {
  earningRuleV2,
  programmeDefinitionV2,
  type EarningRuleCapV2,
  type EarningRuleConditionsV2,
  type EarningRuleV2,
  type EarningSourceV2,
  type ProgrammeDefinitionV2,
  type PurchaseExclusionsV2,
} from "@starfiniti/contracts";
import {
  inspectEarningRuleConflictsV2,
  simulateEarningV2,
  type EarningEvaluationV2,
  type EarningFactV2,
} from "@starfiniti/domain";
import {
  AlertTriangle,
  CalendarHeart,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  MessageSquareText,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveProgrammeDraft, type ProgrammeActionState } from "./actions";
import {
  createEarningRuleTemplate,
  decimalToMinor,
  defaultPurchaseExclusions,
  initialProgrammeDefinitionV2,
  selectorList,
  type EarningRuleTemplate,
} from "./earning-rules-model";

const emptyActionState: ProgrammeActionState = { kind: "idle", message: "" };

const sourceOptions: readonly Readonly<{
  value: EarningSourceV2;
  label: string;
}>[] = [
  { value: "purchase", label: "Purchase" },
  { value: "account_created", label: "Account created" },
  { value: "birthday", label: "Birthday" },
  { value: "verified_product_review", label: "Verified product review" },
  { value: "referral", label: "Successful referral" },
  { value: "custom_activity", label: "Signed custom activity" },
];

const templateOptions: readonly Readonly<{
  value: EarningRuleTemplate;
  label: string;
}>[] = [
  { value: "purchase_multiplier", label: "Purchase multiplier" },
  { value: "purchase_bonus", label: "Stackable purchase bonus" },
  { value: "account_created", label: "Account-created bonus" },
  { value: "birthday", label: "Birthday bonus" },
  { value: "verified_product_review", label: "Verified review bonus" },
  { value: "referral", label: "Referral bonus" },
  { value: "custom_activity", label: "Signed custom activity" },
];

const sourceIcons = {
  purchase: ShoppingBag,
  account_created: UserPlus,
  birthday: CalendarHeart,
  verified_product_review: MessageSquareText,
  referral: Users,
  custom_activity: Webhook,
} satisfies Record<EarningSourceV2, typeof ShoppingBag>;

type SimulatorState = Readonly<{
  source: EarningSourceV2;
  amount: string;
  channel: string;
  market: string;
  productId: string;
  categories: string;
  tierCode: string;
  activityCode: string;
}>;

export function EarningRulesEditor({
  canEdit,
  initialConfiguration,
  operationId,
  programmeId,
  simulationOccurredAt,
}: Readonly<{
  canEdit: boolean;
  initialConfiguration: unknown;
  operationId: string;
  programmeId: string;
  simulationOccurredAt: string;
}>) {
  const initial = useMemo(
    () => initialProgrammeDefinitionV2(initialConfiguration),
    [initialConfiguration],
  );
  const [definition, setDefinition] = useState<ProgrammeDefinitionV2>(
    initial.definition,
  );
  const [template, setTemplate] = useState<EarningRuleTemplate>(
    "purchase_multiplier",
  );
  const operationInput = useRef<HTMLInputElement>(null);
  const [actionState, action, pending] = useActionState(
    saveProgrammeDraft,
    emptyActionState,
  );
  const [simulator, setSimulator] = useState<SimulatorState>({
    source: "purchase",
    amount: "150.00",
    channel: "woocommerce",
    market: "SI",
    productId: "example-product",
    categories: "general",
    tierCode: initial.definition.tiers[0]?.code ?? "rose",
    activityCode: "custom_activity",
  });

  const validation = programmeDefinitionV2.safeParse(definition);
  const validRules = definition.earningRules.flatMap((rule) => {
    const parsed = earningRuleV2.safeParse(rule);
    return parsed.success ? [parsed.data] : [];
  });
  const conflicts = inspectEarningRuleConflictsV2(validRules);
  const validationMessages = validation.success
    ? []
    : Array.from(
        new Set(
          validation.error.issues.slice(0, 6).map((issue) => {
            const location = issue.path.length
              ? `${issue.path.join(".")}: `
              : "";
            return `${location}${issue.message}`;
          }),
        ),
      );
  const simulation = useMemo(
    () => runSimulation(definition, simulator, simulationOccurredAt),
    [definition, simulator, simulationOccurredAt],
  );
  const tierRatesDiffer =
    new Set(definition.tiers.map((tier) => tier.pointsPerMajorUnit)).size > 1;

  useEffect(() => {
    if (actionState.kind === "success" && operationInput.current) {
      operationInput.current.value = crypto.randomUUID();
    }
  }, [actionState.kind]);

  function updateDefinition(patch: Partial<ProgrammeDefinitionV2>) {
    setDefinition((current) => ({ ...current, ...patch }));
  }

  function updateRule(
    index: number,
    next: (rule: EarningRuleV2) => EarningRuleV2,
  ) {
    setDefinition((current) => ({
      ...current,
      earningRules: current.earningRules.map((rule, ruleIndex) =>
        ruleIndex === index ? next(rule) : rule,
      ),
    }));
  }

  function updateConditions(
    index: number,
    patch: Partial<EarningRuleConditionsV2>,
  ) {
    updateRule(index, (rule) => ({
      ...rule,
      conditions: { ...rule.conditions, ...patch },
    }));
  }

  function updateCap(index: number, patch: Partial<EarningRuleCapV2>) {
    updateRule(index, (rule) => ({
      ...rule,
      cap: { ...rule.cap, ...patch },
    }));
  }

  function updateExclusions(
    index: number,
    patch: Partial<PurchaseExclusionsV2>,
  ) {
    updateRule(index, (rule) => ({
      ...rule,
      purchaseExclusions: {
        ...(rule.purchaseExclusions ?? defaultPurchaseExclusions),
        ...patch,
      },
    }));
  }

  function changeSource(index: number, source: EarningSourceV2) {
    updateRule(index, (rule) => {
      const purchase = source === "purchase";
      const review = source === "verified_product_review";
      return {
        ...rule,
        source,
        stackable: true,
        effect:
          purchase && rule.effect.kind === "multiplier"
            ? rule.effect
            : rule.effect.kind === "fixed_bonus"
              ? rule.effect
              : { kind: "fixed_bonus", points: "100" },
        conditions: {
          ...rule.conditions,
          productIds: purchase || review ? rule.conditions.productIds : [],
          categoryIds: purchase || review ? rule.conditions.categoryIds : [],
          currencyCodes: purchase ? rule.conditions.currencyCodes : [],
          markets: purchase ? rule.conditions.markets : [],
          activityCodes:
            source === "custom_activity"
              ? rule.conditions.activityCodes.length
                ? rule.conditions.activityCodes
                : ["custom_activity"]
              : [],
        },
        purchaseExclusions: purchase
          ? (rule.purchaseExclusions ?? { ...defaultPurchaseExclusions })
          : null,
      };
    });
  }

  function addRule() {
    setDefinition((current) => ({
      ...current,
      earningRules: [
        ...current.earningRules,
        createEarningRuleTemplate(template, current.earningRules),
      ],
    }));
  }

  function removeRule(index: number) {
    setDefinition((current) => ({
      ...current,
      earningRules: current.earningRules.filter(
        (_, ruleIndex) => ruleIndex !== index,
      ),
    }));
  }

  return (
    <form action={action} className="programme-workflow earning-rules-workflow">
      <input name="programmeId" type="hidden" value={programmeId} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <input
        name="configuration"
        type="hidden"
        value={JSON.stringify(definition)}
      />

      {initial.migratedFromV1 ? (
        <section className="earning-migration-notice" role="note">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>V1 remains live until this V2 draft is published</strong>
            <p>
              Tiers and rewards were copied forward. V2 uses one programme-wide
              purchase base rate; review the simulator before publishing.
              {tierRatesDiffer
                ? " Your V1 tiers have different earning rates, so this is an intentional behavior change."
                : ""}
            </p>
          </div>
        </section>
      ) : null}

      <section className="ui-surface earning-policy-settings">
        <header>
          <div className="earning-section-icon">
            <CircleDollarSign aria-hidden="true" />
          </div>
          <div>
            <span className="programme-workflow-kicker">Programme policy</span>
            <h2>Value lifecycle</h2>
            <p>These settings apply consistently to every V2 earning source.</p>
          </div>
        </header>
        <div className="earning-settings-grid">
          <label>
            <span>Currency</span>
            <input
              disabled={!canEdit}
              maxLength={3}
              pattern="[A-Z]{3}"
              value={definition.currencyCode}
              onChange={(event) =>
                updateDefinition({
                  currencyCode: event.target.value.toUpperCase(),
                })
              }
            />
          </label>
          <label>
            <span>Minor-unit digits</span>
            <input
              disabled={!canEdit}
              max="6"
              min="0"
              type="number"
              value={definition.currencyMinorUnitDigits}
              onChange={(event) =>
                updateDefinition({
                  currencyMinorUnitDigits: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>Pending period (days)</span>
            <input
              disabled={!canEdit}
              max="365"
              min="0"
              type="number"
              value={definition.pendingDays}
              onChange={(event) =>
                updateDefinition({ pendingDays: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>Points expire after (days)</span>
            <input
              disabled={!canEdit}
              max="3650"
              min="1"
              type="number"
              value={definition.pointsExpireAfterDays}
              onChange={(event) =>
                updateDefinition({
                  pointsExpireAfterDays: Number(event.target.value),
                })
              }
            />
          </label>
        </div>
      </section>

      <div className="programme-workflow-grid earning-rules-layout">
        <section className="ui-surface programme-workflow-primary earning-rule-catalogue">
          <header className="programme-workflow-header">
            <div>
              <span className="programme-workflow-kicker">
                <Zap aria-hidden="true" /> Rule catalogue
              </span>
              <h2>Ways members earn</h2>
              <p>
                Exclusions run first, one base rule runs second, the highest
                priority multiplier wins third, and explicit bonuses stack last.
              </p>
            </div>
            <span className="ui-badge ui-badge-violet">
              {definition.earningRules.length} rules
            </span>
          </header>

          {canEdit ? (
            <div className="earning-rule-add-bar">
              <label>
                <span>Add a tested template</span>
                <select
                  value={template}
                  onChange={(event) =>
                    setTemplate(event.target.value as EarningRuleTemplate)
                  }
                >
                  {templateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="ui-button ui-button-primary"
                onClick={addRule}
                type="button"
              >
                <Plus aria-hidden="true" /> Add rule
              </button>
            </div>
          ) : null}

          <div className="earning-rule-list">
            {definition.earningRules.map((rule, index) => {
              const SourceIcon = sourceIcons[rule.source];
              const isBase = rule.effect.kind === "base_rate";
              return (
                <article
                  className="earning-rule-card"
                  key={`${rule.code}-${index}`}
                >
                  <header className="earning-rule-card-header">
                    <div
                      className={`earning-rule-source-icon ${rule.enabled ? "is-enabled" : ""}`}
                    >
                      <SourceIcon aria-hidden="true" />
                    </div>
                    <div>
                      <span>{sourceLabel(rule.source)}</span>
                      <strong>{rule.name || "Unnamed earning rule"}</strong>
                      <small>{effectLabel(rule)}</small>
                    </div>
                    <label className="earning-enabled-toggle">
                      <input
                        checked={rule.enabled}
                        disabled={!canEdit || isBase}
                        type="checkbox"
                        onChange={(event) =>
                          updateRule(index, (current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                    {canEdit ? (
                      <button
                        aria-label={`Remove ${rule.name || rule.code}`}
                        className="ui-icon-button earning-rule-remove"
                        disabled={isBase}
                        title={
                          isBase
                            ? "The base purchase rule is required"
                            : "Remove rule"
                        }
                        type="button"
                        onClick={() => removeRule(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>

                  <div className="earning-rule-core-grid">
                    <label>
                      <span>Rule name</span>
                      <input
                        disabled={!canEdit}
                        maxLength={200}
                        value={rule.name}
                        onChange={(event) =>
                          updateRule(index, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Internal code</span>
                      <input
                        disabled={!canEdit || isBase}
                        pattern="[a-z][a-z0-9_-]{0,79}"
                        value={rule.code}
                        onChange={(event) =>
                          updateRule(index, (current) => ({
                            ...current,
                            code: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Source</span>
                      <select
                        disabled={!canEdit || isBase}
                        value={rule.source}
                        onChange={(event) =>
                          changeSource(
                            index,
                            event.target.value as EarningSourceV2,
                          )
                        }
                      >
                        {sourceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Effect</span>
                      <select
                        disabled={
                          !canEdit || isBase || rule.source !== "purchase"
                        }
                        value={rule.effect.kind}
                        onChange={(event) => {
                          const kind = event.target.value;
                          updateRule(index, (current) => ({
                            ...current,
                            stackable: kind === "fixed_bonus",
                            effect:
                              kind === "multiplier"
                                ? {
                                    kind: "multiplier",
                                    multiplierBasisPoints: 20_000,
                                  }
                                : { kind: "fixed_bonus", points: "100" },
                          }));
                        }}
                      >
                        {isBase ? (
                          <option value="base_rate">Base rate</option>
                        ) : null}
                        <option value="multiplier">Multiplier</option>
                        <option value="fixed_bonus">Fixed bonus</option>
                      </select>
                    </label>
                    <EffectInput
                      canEdit={canEdit}
                      index={index}
                      rule={rule}
                      updateRule={updateRule}
                    />
                    <label>
                      <span>Priority</span>
                      <input
                        disabled={!canEdit}
                        max="10000"
                        min="-10000"
                        type="number"
                        value={rule.priority}
                        onChange={(event) =>
                          updateRule(index, (current) => ({
                            ...current,
                            priority: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>

                  <details className="earning-rule-advanced">
                    <summary>
                      Eligibility, exclusions and caps{" "}
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div className="earning-rule-advanced-body">
                      <ConditionFields
                        canEdit={canEdit}
                        index={index}
                        rule={rule}
                        updateConditions={updateConditions}
                      />
                      {rule.source === "purchase" ? (
                        <ExclusionFields
                          canEdit={canEdit}
                          exclusions={
                            rule.purchaseExclusions ?? defaultPurchaseExclusions
                          }
                          index={index}
                          updateExclusions={updateExclusions}
                        />
                      ) : null}
                      <CapFields
                        canEdit={canEdit}
                        cap={rule.cap}
                        index={index}
                        updateCap={updateCap}
                      />
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="ui-surface programme-workflow-aside earning-simulator">
          <span className="programme-workflow-kicker">
            <Calculator aria-hidden="true" /> Deterministic simulator
          </span>
          <h2>Test an earning event</h2>
          <p>
            The simulator calls the exact pure evaluator used by the worker.
          </p>
          <div className="earning-simulator-fields">
            <label>
              <span>Source</span>
              <select
                value={simulator.source}
                onChange={(event) =>
                  setSimulator((current) => ({
                    ...current,
                    source: event.target.value as EarningSourceV2,
                    activityCode:
                      event.target.value === "custom_activity"
                        ? current.activityCode
                        : event.target.value,
                  }))
                }
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {simulator.source === "purchase" ? (
              <label>
                <span>Order amount ({definition.currencyCode})</span>
                <input
                  inputMode="decimal"
                  value={simulator.amount}
                  onChange={(event) =>
                    setSimulator((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
            <label>
              <span>Channel</span>
              <input
                value={simulator.channel}
                onChange={(event) =>
                  setSimulator((current) => ({
                    ...current,
                    channel: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Tier</span>
              <select
                value={simulator.tierCode}
                onChange={(event) =>
                  setSimulator((current) => ({
                    ...current,
                    tierCode: event.target.value,
                  }))
                }
              >
                {definition.tiers.map((tier) => (
                  <option key={tier.code} value={tier.code}>
                    {tier.name}
                  </option>
                ))}
              </select>
            </label>
            {simulator.source === "purchase" ? (
              <label>
                <span>Market (ISO 2)</span>
                <input
                  maxLength={2}
                  value={simulator.market}
                  onChange={(event) =>
                    setSimulator((current) => ({
                      ...current,
                      market: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
            ) : null}
            {simulator.source === "purchase" ||
            simulator.source === "verified_product_review" ? (
              <>
                <label>
                  <span>Product selector</span>
                  <input
                    value={simulator.productId}
                    onChange={(event) =>
                      setSimulator((current) => ({
                        ...current,
                        productId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Categories (comma separated)</span>
                  <input
                    value={simulator.categories}
                    onChange={(event) =>
                      setSimulator((current) => ({
                        ...current,
                        categories: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            ) : null}
            {simulator.source === "custom_activity" ? (
              <label>
                <span>Signed activity code</span>
                <input
                  value={simulator.activityCode}
                  onChange={(event) =>
                    setSimulator((current) => ({
                      ...current,
                      activityCode: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
          </div>
          <SimulationResult result={simulation} />
          {conflicts.length > 0 ? (
            <div className="earning-conflict-list" role="alert">
              <strong>
                <AlertTriangle aria-hidden="true" /> Conflict warnings
              </strong>
              {conflicts.map((conflict) => (
                <p key={`${conflict.code}-${conflict.ruleCodes.join("-")}`}>
                  {conflict.message}: {conflict.ruleCodes.join(", ")}
                </p>
              ))}
            </div>
          ) : (
            <div className="earning-conflict-clear">
              <CheckCircle2 aria-hidden="true" /> No deterministic rule
              conflicts
            </div>
          )}
        </aside>
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
                ? "Ready for immutable draft review"
                : "V2 draft needs attention"}
            </span>
            <p
              aria-live="polite"
              className={`action-message ${actionState.kind}`}
            >
              {actionState.message ||
                (validation.success
                  ? `${validRules.filter((rule) => rule.enabled).length} enabled rules; saving does not change the live programme.`
                  : "Resolve every contract error before saving.")}
            </p>
            {validationMessages.length ? (
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
            {pending ? "Saving V2 draft…" : "Save V2 earning rules"}
          </button>
        </section>
      ) : (
        <section className="ui-surface programme-read-only-bar">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Read-only programme access</strong>
            <p>Only organization owners and admins can create a V2 draft.</p>
          </div>
        </section>
      )}
    </form>
  );
}

function EffectInput({
  canEdit,
  index,
  rule,
  updateRule,
}: Readonly<{
  canEdit: boolean;
  index: number;
  rule: EarningRuleV2;
  updateRule: (
    index: number,
    next: (rule: EarningRuleV2) => EarningRuleV2,
  ) => void;
}>) {
  if (rule.effect.kind === "base_rate") {
    return (
      <label>
        <span>Points per major unit</span>
        <input
          disabled={!canEdit}
          min="1"
          type="number"
          value={rule.effect.pointsPerMajorUnit}
          onChange={(event) =>
            updateRule(index, (current) => ({
              ...current,
              effect: {
                kind: "base_rate",
                pointsPerMajorUnit: event.target.value,
              },
            }))
          }
        />
      </label>
    );
  }
  if (rule.effect.kind === "multiplier") {
    return (
      <label>
        <span>Multiplier</span>
        <input
          disabled={!canEdit}
          max="10"
          min="1.0001"
          step="0.0001"
          type="number"
          value={rule.effect.multiplierBasisPoints / 10_000}
          onChange={(event) =>
            updateRule(index, (current) => ({
              ...current,
              effect: {
                kind: "multiplier",
                multiplierBasisPoints: Math.round(
                  Number(event.target.value) * 10_000,
                ),
              },
            }))
          }
        />
      </label>
    );
  }
  return (
    <label>
      <span>Bonus points</span>
      <input
        disabled={!canEdit}
        min="1"
        type="number"
        value={rule.effect.points}
        onChange={(event) =>
          updateRule(index, (current) => ({
            ...current,
            effect: { kind: "fixed_bonus", points: event.target.value },
          }))
        }
      />
    </label>
  );
}

function ConditionFields({
  canEdit,
  index,
  rule,
  updateConditions,
}: Readonly<{
  canEdit: boolean;
  index: number;
  rule: EarningRuleV2;
  updateConditions: (
    index: number,
    patch: Partial<EarningRuleConditionsV2>,
  ) => void;
}>) {
  const commerceSelectors =
    rule.source === "purchase" || rule.source === "verified_product_review";
  return (
    <fieldset className="earning-rule-fieldset">
      <legend>Eligibility</legend>
      <div className="earning-condition-grid">
        {commerceSelectors ? (
          <>
            <SelectorField
              disabled={!canEdit}
              label="Included product IDs"
              value={rule.conditions.productIds}
              onChange={(productIds) => updateConditions(index, { productIds })}
            />
            <SelectorField
              disabled={!canEdit}
              label="Included category IDs"
              value={rule.conditions.categoryIds}
              onChange={(categoryIds) =>
                updateConditions(index, { categoryIds })
              }
            />
          </>
        ) : null}
        {rule.source === "purchase" ? (
          <>
            <SelectorField
              disabled={!canEdit}
              label="Currencies"
              value={rule.conditions.currencyCodes}
              transform={(value) => value.toUpperCase()}
              onChange={(currencyCodes) =>
                updateConditions(index, { currencyCodes })
              }
            />
            <SelectorField
              disabled={!canEdit}
              label="Markets"
              value={rule.conditions.markets}
              transform={(value) => value.toUpperCase()}
              onChange={(markets) => updateConditions(index, { markets })}
            />
          </>
        ) : null}
        <SelectorField
          disabled={!canEdit}
          label="Channels"
          value={rule.conditions.channels}
          onChange={(channels) => updateConditions(index, { channels })}
        />
        <SelectorField
          disabled={!canEdit}
          label="Segments"
          value={rule.conditions.segmentCodes}
          onChange={(segmentCodes) => updateConditions(index, { segmentCodes })}
        />
        <SelectorField
          disabled={!canEdit}
          label="VIP tiers"
          value={rule.conditions.tierCodes}
          onChange={(tierCodes) => updateConditions(index, { tierCodes })}
        />
        {rule.source === "custom_activity" ? (
          <SelectorField
            disabled={!canEdit}
            label="Signed activity codes"
            value={rule.conditions.activityCodes}
            onChange={(activityCodes) =>
              updateConditions(index, { activityCodes })
            }
          />
        ) : null}
        <label>
          <span>Starts at (UTC)</span>
          <input
            disabled={!canEdit}
            type="datetime-local"
            value={isoToDateTimeLocal(rule.conditions.startsAt)}
            onChange={(event) =>
              updateConditions(index, {
                startsAt: dateTimeLocalToIso(event.target.value),
              })
            }
          />
        </label>
        <label>
          <span>Ends at (UTC, exclusive)</span>
          <input
            disabled={!canEdit}
            type="datetime-local"
            value={isoToDateTimeLocal(rule.conditions.endsAt)}
            onChange={(event) =>
              updateConditions(index, {
                endsAt: dateTimeLocalToIso(event.target.value),
              })
            }
          />
        </label>
      </div>
      <p>Leave selector lists empty to allow every value in that dimension.</p>
    </fieldset>
  );
}

function SelectorField({
  disabled,
  label,
  onChange,
  transform,
  value,
}: Readonly<{
  disabled: boolean;
  label: string;
  onChange: (value: string[]) => void;
  transform?: (value: string) => string;
  value: readonly string[];
}>) {
  return (
    <label>
      <span>{label}</span>
      <input
        disabled={disabled}
        placeholder="All"
        value={value.join(", ")}
        onChange={(event) => {
          const normalized = selectorList(event.target.value);
          onChange(transform ? normalized.map(transform) : normalized);
        }}
      />
    </label>
  );
}

function ExclusionFields({
  canEdit,
  exclusions,
  index,
  updateExclusions,
}: Readonly<{
  canEdit: boolean;
  exclusions: PurchaseExclusionsV2;
  index: number;
  updateExclusions: (
    index: number,
    patch: Partial<PurchaseExclusionsV2>,
  ) => void;
}>) {
  const toggles: readonly [
    keyof Pick<
      PurchaseExclusionsV2,
      "shipping" | "tax" | "fees" | "giftCardPayments" | "discounts"
    >,
    string,
  ][] = [
    ["shipping", "Exclude shipping"],
    ["tax", "Exclude tax"],
    ["fees", "Exclude fees"],
    ["giftCardPayments", "Exclude gift-card payments"],
    ["discounts", "Deduct discounts"],
  ];
  return (
    <fieldset className="earning-rule-fieldset">
      <legend>Purchase exclusions</legend>
      <div className="earning-condition-grid">
        <SelectorField
          disabled={!canEdit}
          label="Excluded product IDs"
          value={exclusions.productIds}
          onChange={(productIds) => updateExclusions(index, { productIds })}
        />
        <SelectorField
          disabled={!canEdit}
          label="Excluded category IDs"
          value={exclusions.categoryIds}
          onChange={(categoryIds) => updateExclusions(index, { categoryIds })}
        />
      </div>
      <div className="earning-checkbox-grid">
        {toggles.map(([field, label]) => (
          <label key={field}>
            <input
              checked={exclusions[field]}
              disabled={!canEdit}
              type="checkbox"
              onChange={(event) =>
                updateExclusions(index, { [field]: event.target.checked })
              }
            />
            <span>{label}</span>
          </label>
        ))}
        <label title="Store credit is excluded by invariant">
          <input checked disabled type="checkbox" />
          <span>Exclude store-credit payments</span>
        </label>
      </div>
    </fieldset>
  );
}

function CapFields({
  canEdit,
  cap,
  index,
  updateCap,
}: Readonly<{
  canEdit: boolean;
  cap: EarningRuleCapV2;
  index: number;
  updateCap: (index: number, patch: Partial<EarningRuleCapV2>) => void;
}>) {
  return (
    <fieldset className="earning-rule-fieldset">
      <legend>Value caps</legend>
      <div className="earning-condition-grid">
        <label>
          <span>Maximum points per event</span>
          <input
            disabled={!canEdit}
            min="1"
            placeholder="No cap"
            type="number"
            value={cap.perEventPoints ?? ""}
            onChange={(event) =>
              updateCap(index, {
                perEventPoints: event.target.value || null,
              })
            }
          />
        </label>
        <label>
          <span>Maximum points per member</span>
          <input
            disabled={!canEdit}
            min="1"
            placeholder="No cap"
            type="number"
            value={cap.perMemberPoints ?? ""}
            onChange={(event) =>
              updateCap(index, {
                perMemberPoints: event.target.value || null,
                memberPeriod: event.target.value
                  ? (cap.memberPeriod ?? "lifetime")
                  : null,
                rollingDays: event.target.value ? cap.rollingDays : null,
              })
            }
          />
        </label>
        <label>
          <span>Member cap period</span>
          <select
            disabled={!canEdit || cap.perMemberPoints === null}
            value={cap.memberPeriod ?? ""}
            onChange={(event) => {
              const period = event.target.value as Exclude<
                EarningRuleCapV2["memberPeriod"],
                null
              >;
              updateCap(index, {
                memberPeriod: period,
                rollingDays:
                  period === "rolling" ? (cap.rollingDays ?? 30) : null,
              });
            }}
          >
            <option value="lifetime">Lifetime</option>
            <option value="calendar_day">Calendar day</option>
            <option value="calendar_month">Calendar month</option>
            <option value="calendar_year">Calendar year</option>
            <option value="rolling">Rolling period</option>
          </select>
        </label>
        {cap.memberPeriod === "rolling" ? (
          <label>
            <span>Rolling days</span>
            <input
              disabled={!canEdit}
              max="3650"
              min="1"
              type="number"
              value={cap.rollingDays ?? 30}
              onChange={(event) =>
                updateCap(index, { rollingDays: Number(event.target.value) })
              }
            />
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

function SimulationResult({
  result,
}: Readonly<{
  result:
    | Readonly<{ ok: true; evaluation: EarningEvaluationV2 }>
    | Readonly<{ ok: false; message: string }>;
}>) {
  if (!result.ok) {
    return (
      <div className="earning-simulation-error" role="status">
        <AlertTriangle aria-hidden="true" />
        <span>{result.message}</span>
      </div>
    );
  }
  return (
    <div className="earning-simulation-result" aria-live="polite">
      <span>Pending award</span>
      <strong>{result.evaluation.awardedPoints} points</strong>
      <small>
        {result.evaluation.eligibleSpendMinor} eligible minor units · available{" "}
        {new Date(result.evaluation.availableAt).toLocaleDateString("en-GB", {
          timeZone: "UTC",
        })}{" "}
        UTC
      </small>
      <ul>
        {result.evaluation.contributions.map((contribution) => (
          <li key={contribution.ruleCode}>
            <span>{contribution.ruleCode}</span>
            <strong>+{contribution.awardedPoints}</strong>
          </li>
        ))}
      </ul>
      {result.evaluation.selectedMultiplierRuleCode ? (
        <p>
          Winning multiplier: {result.evaluation.selectedMultiplierRuleCode}
        </p>
      ) : null}
    </div>
  );
}

function runSimulation(
  definition: ProgrammeDefinitionV2,
  simulator: SimulatorState,
  occurredAt: string,
):
  | Readonly<{ ok: true; evaluation: EarningEvaluationV2 }>
  | Readonly<{ ok: false; message: string }> {
  const parsed = programmeDefinitionV2.safeParse(definition);
  if (!parsed.success) {
    return { ok: false, message: "Finish the V2 contract before simulating." };
  }
  const common = {
    eventId: "merchant-simulation",
    occurredAt,
    channel: simulator.channel,
    segmentCodes: [],
    tierCode: simulator.tierCode,
    memberRuleUsage: {},
  };
  let fact: EarningFactV2;
  if (simulator.source === "purchase") {
    const grossMinor = decimalToMinor(
      simulator.amount,
      parsed.data.currencyMinorUnitDigits,
    );
    if (grossMinor === null) {
      return {
        ok: false,
        message: "Enter an exact non-negative order amount.",
      };
    }
    fact = {
      ...common,
      source: "purchase",
      currencyCode: parsed.data.currencyCode,
      market: simulator.market,
      lines: [
        {
          lineId: "line-1",
          productId: simulator.productId,
          categoryIds: selectorList(simulator.categories),
          grossMinor,
          discountMinor: "0",
          refundedMinor: "0",
          paymentKind: "money",
        },
      ],
      shippingMinor: "0",
      shippingRefundedMinor: "0",
      taxMinor: "0",
      taxRefundedMinor: "0",
      feeMinor: "0",
      feeRefundedMinor: "0",
    };
  } else {
    fact = {
      ...common,
      source: simulator.source,
      verified: true,
      activityReference: "merchant-simulation",
      activityCode:
        simulator.source === "custom_activity"
          ? simulator.activityCode
          : simulator.source,
      productId:
        simulator.source === "verified_product_review"
          ? simulator.productId
          : null,
      categoryIds:
        simulator.source === "verified_product_review"
          ? selectorList(simulator.categories)
          : [],
    };
  }
  try {
    return { ok: true, evaluation: simulateEarningV2(parsed.data, fact) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The event could not be simulated.",
    };
  }
}

function sourceLabel(source: EarningSourceV2): string {
  return (
    sourceOptions.find((option) => option.value === source)?.label ?? source
  );
}

function effectLabel(rule: EarningRuleV2): string {
  if (rule.effect.kind === "base_rate") {
    return `${rule.effect.pointsPerMajorUnit} points per major currency unit`;
  }
  if (rule.effect.kind === "multiplier") {
    return `${rule.effect.multiplierBasisPoints / 10_000}× eligible base points`;
  }
  return `${rule.effect.points} point stackable bonus`;
}

function isoToDateTimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
