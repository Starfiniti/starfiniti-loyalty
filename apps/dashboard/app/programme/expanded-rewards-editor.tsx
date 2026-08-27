"use client";

import {
  programmeDefinitionV2,
  type ProgrammeRewardDefinitionV2,
  type RewardAvailabilityV2,
} from "@starfiniti/contracts";
import {
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  Gift,
  PackagePlus,
  Percent,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  useActionState,
  useMemo,
  useRef,
  useState,
} from "react";
import { saveProgrammeDraft, type ProgrammeActionState } from "./actions";
import { initialProgrammeDefinitionV2 } from "./earning-rules-model";
import {
  expandedRewardValidationIssues,
  isVersionedRewardCandidate,
  replaceCollapsedRewardIssues,
  validationPathHasIssue,
} from "./expanded-rewards-validation";

type RewardTemplate =
  | "fixed_discount"
  | "percentage_discount"
  | "free_shipping"
  | "free_product"
  | "exclusive_access"
  | "custom";
type ManualReward = Extract<
  ProgrammeRewardDefinitionV2,
  { kind: "exclusive_access" | "custom" }
>;
type NativeReward = Exclude<ProgrammeRewardDefinitionV2, ManualReward>;

const idle: ProgrammeActionState = { kind: "idle", message: "" };
const validationSummaryId = "expanded-rewards-validation-summary";

const templates: ReadonlyArray<
  Readonly<{
    kind: RewardTemplate;
    name: string;
    description: string;
    icon: typeof Gift;
  }>
> = [
  {
    kind: "fixed_discount",
    name: "Fixed discount",
    description: "Exact WooCommerce cart discount",
    icon: BadgeEuro,
  },
  {
    kind: "percentage_discount",
    name: "Percentage",
    description: "Uncapped percentage coupon",
    icon: Percent,
  },
  {
    kind: "free_shipping",
    name: "Free shipping",
    description: "Native free-shipping coupon",
    icon: Truck,
  },
  {
    kind: "free_product",
    name: "Free product",
    description: "Product-restricted 100% coupon",
    icon: PackagePlus,
  },
  {
    kind: "exclusive_access",
    name: "Exclusive access",
    description: "Audited store-delivered benefit",
    icon: Sparkles,
  },
  {
    kind: "custom",
    name: "Custom perk",
    description: "Manual fulfilment with an SLA",
    icon: Gift,
  },
];

function availability(): RewardAvailabilityV2 {
  return {
    startsAt: null,
    endsAt: null,
    tierCodes: [],
    segmentCodes: [],
    perCustomerLimit: null,
    globalQuantity: null,
    pointsBudget: null,
  };
}

function restrictions() {
  return {
    minimumSpendMinor: null,
    productIds: [],
    excludedProductIds: [],
    categoryIds: [],
    excludedCategoryIds: [],
    excludeSaleItems: false,
    stacking: "exclusive" as const,
  };
}

function uniqueCode(seed: string, existing: readonly string[]): string {
  if (!existing.includes(seed)) return seed;
  let suffix = 2;
  while (existing.includes(`${seed}-${suffix}`)) suffix += 1;
  return `${seed}-${suffix}`;
}

function createReward(
  kind: RewardTemplate,
  existing: readonly string[],
  currencyMinorUnitDigits: number,
): ProgrammeRewardDefinitionV2 {
  const seed = {
    fixed_discount: "ten-off",
    percentage_discount: "ten-percent-off",
    free_shipping: "free-shipping",
    free_product: "free-product",
    exclusive_access: "exclusive-access",
    custom: "custom-perk",
  }[kind];
  const code = uniqueCode(seed, existing);
  const common = {
    code,
    name:
      templates.find((template) => template.kind === kind)?.name ?? "Reward",
    costPoints: "1000",
  };
  const native = {
    version: "2" as const,
    fulfilmentMode: "woocommerce_coupon" as const,
    validityDays: 30,
    availability: availability(),
    restrictions: restrictions(),
  };
  if (kind === "fixed_discount") {
    return {
      ...common,
      kind,
      configuration: {
        ...native,
        amountMinor: "1000",
        currencyMinorUnitDigits,
      },
    };
  }
  if (kind === "percentage_discount") {
    return {
      ...common,
      kind,
      configuration: {
        ...native,
        percentageBasisPoints: 1000,
        maximumDiscountMinor: null,
        currencyMinorUnitDigits,
      },
    };
  }
  if (kind === "free_shipping") {
    return { ...common, kind, configuration: native };
  }
  if (kind === "free_product") {
    return {
      ...common,
      kind,
      configuration: { ...native, productId: "1", quantity: 1 },
    };
  }
  return {
    ...common,
    kind,
    configuration: {
      version: "2",
      fulfilmentMode: "manual",
      availability: availability(),
      fulfilmentInstructions:
        kind === "exclusive_access"
          ? "Contact the member and confirm access before recording delivery."
          : "Review the request, deliver the perk, and retain an opaque store reference.",
      fulfilmentSlaDays: 5,
    },
  };
}

function selectorList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

function optionalInteger(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalBigint(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function dateValue(value: string | null): string {
  return value?.slice(0, 10) ?? "";
}

function dateBoundary(value: string, end = false): string | null {
  if (!value) return null;
  return `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function rewardIcon(kind: RewardTemplate) {
  return templates.find((template) => template.kind === kind)?.icon ?? Gift;
}

function isExpandedReward(
  value: unknown,
): value is ProgrammeRewardDefinitionV2 {
  return isVersionedRewardCandidate(value);
}

function isManualReward(
  reward: ProgrammeRewardDefinitionV2,
): reward is ManualReward {
  return reward.kind === "exclusive_access" || reward.kind === "custom";
}

function isNativeReward(
  reward: ProgrammeRewardDefinitionV2,
): reward is NativeReward {
  return !isManualReward(reward);
}

export function ExpandedRewardsEditor({
  canEdit,
  programmeId,
  initialConfiguration,
  operationId,
}: Readonly<{
  canEdit: boolean;
  programmeId: string;
  initialConfiguration: unknown;
  operationId: string;
}>) {
  const initial = useMemo(
    () => initialProgrammeDefinitionV2(initialConfiguration),
    [initialConfiguration],
  );
  const [rewards, setRewards] = useState(initial.definition.rewards);
  const [state, action, pending] = useActionState(saveProgrammeDraft, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const definition = { ...initial.definition, rewards };
  const validation = programmeDefinitionV2.safeParse(definition);
  const rewardIssues = expandedRewardValidationIssues(rewards);
  const validationIssues = validation.success
    ? []
    : replaceCollapsedRewardIssues(validation.error.issues, rewardIssues);
  const expandedRewards = rewards.filter(isExpandedReward);
  const manualCount = expandedRewards.filter(
    (reward) => reward.configuration.fulfilmentMode === "manual",
  ).length;
  const limitedCount = expandedRewards.filter((reward) => {
    const availability = reward.configuration.availability;
    return (
      availability.globalQuantity !== null ||
      availability.pointsBudget !== null ||
      availability.perCustomerLimit !== null
    );
  }).length;

  function addReward(kind: RewardTemplate) {
    setRewards((current) => [
      ...current,
      createReward(
        kind,
        current.map((reward) => reward.code),
        initial.definition.currencyMinorUnitDigits,
      ),
    ]);
  }

  function replaceReward(index: number, reward: ProgrammeRewardDefinitionV2) {
    setRewards((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? reward : item)),
    );
  }

  function updateAvailability(
    index: number,
    reward: ProgrammeRewardDefinitionV2,
    patch: Partial<
      ProgrammeRewardDefinitionV2["configuration"]["availability"]
    >,
  ) {
    replaceReward(index, {
      ...reward,
      configuration: {
        ...reward.configuration,
        availability: {
          ...reward.configuration.availability,
          ...patch,
        },
      },
    } as ProgrammeRewardDefinitionV2);
  }

  function validationField(path: string) {
    const invalid =
      !validation.success && validationPathHasIssue(validationIssues, path);

    return {
      "aria-describedby": invalid ? validationSummaryId : undefined,
      "aria-invalid": invalid || undefined,
      "data-validation-path": path,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (validation.success) return;

    event.preventDefault();
    const issuePath = validationIssues[0]?.path.join(".") ?? "";
    const fields = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>(
        "[data-validation-path]",
      ) ?? [],
    );
    const firstInvalidField = fields.find((field) => {
      const fieldPath = field.dataset.validationPath ?? "";
      return (
        issuePath === fieldPath ||
        issuePath.startsWith(`${fieldPath}.`) ||
        fieldPath.startsWith(`${issuePath}.`)
      );
    });

    (
      firstInvalidField ?? document.getElementById(validationSummaryId)
    )?.focus();
  }

  return (
    <form
      action={action}
      className="programme-workflow expanded-rewards-workflow"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <input name="programmeId" type="hidden" value={programmeId} />
      <input name="operationId" type="hidden" value={operationId} />
      <input
        name="configuration"
        type="hidden"
        value={JSON.stringify(definition)}
      />

      <div className="expanded-reward-layout">
        <section className="ui-surface expanded-reward-builder">
          <div className="programme-workflow-header">
            <div>
              <span className="programme-workflow-kicker">
                <Gift aria-hidden="true" /> Reward templates
              </span>
              <h2>Build a fulfilment-complete catalogue</h2>
              <p>
                Every new reward below either becomes a native WooCommerce
                benefit or enters the audited manual queue.
              </p>
            </div>
          </div>

          {initial.migratedFromV1 ? (
            <div className="programme-workflow-footer-note">
              <ShieldCheck aria-hidden="true" />
              <p>
                This draft starts from a V1 programme. Existing rewards stay
                unchanged; saving creates a reviewed V2 version with the same
                base earning behavior.
              </p>
            </div>
          ) : null}

          {canEdit ? (
            <div className="expanded-reward-templates" aria-label="Add reward">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.kind}
                    onClick={() => addReward(template.kind)}
                    type="button"
                  >
                    <Icon aria-hidden="true" />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                    <Plus aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : null}

          {rewards.length === 0 ? (
            <div className="reward-empty-state">
              <div className="reward-empty-icon" aria-hidden="true">
                <Gift />
              </div>
              <h3>Add the first member reward</h3>
              <p>
                Choose a native WooCommerce benefit or a store-delivered perk.
              </p>
            </div>
          ) : (
            <div className="expanded-reward-list">
              {rewards.map((item, index) => {
                if (!isExpandedReward(item)) {
                  return (
                    <article
                      className="expanded-reward-card legacy"
                      key={item.code}
                    >
                      <div className="expanded-reward-card-heading">
                        <div className="reward-kind-icon" aria-hidden="true">
                          <Gift />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {item.costPoints} points · Legacy V1 reward
                          </span>
                        </div>
                        <span className="ui-badge">Preserved</span>
                      </div>
                      <p>
                        This published-compatible reward stays unchanged. Add a
                        V2 replacement to use restrictions, limits, free
                        product, or manual fulfilment.
                      </p>
                    </article>
                  );
                }
                const reward = item;
                const Icon = rewardIcon(reward.kind);
                const manualReward = isManualReward(reward) ? reward : null;
                const nativeReward = isNativeReward(reward) ? reward : null;
                const manual = manualReward !== null;
                return (
                  <fieldset
                    className="expanded-reward-card"
                    key={`${index}:${reward.kind}`}
                  >
                    <legend>Reward {index + 1}</legend>
                    <div className="expanded-reward-card-heading">
                      <div className="reward-kind-icon" aria-hidden="true">
                        <Icon />
                      </div>
                      <div>
                        <strong>{reward.name}</strong>
                        <span>
                          {manual ? "Manual fulfilment" : "WooCommerce native"}
                        </span>
                      </div>
                      <span
                        className={`ui-badge ${manual ? "ui-badge-warning" : "ui-badge-success"}`}
                      >
                        {manual ? "Audited queue" : "Connector ready"}
                      </span>
                      {canEdit ? (
                        <button
                          aria-label={`Remove ${reward.name}`}
                          className="ui-icon-button reward-remove-button"
                          onClick={() =>
                            setRewards((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          type="button"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>

                    <div className="reward-form-grid expanded-reward-common-grid">
                      <label>
                        <span>Customer-facing name</span>
                        <input
                          {...validationField(`rewards.${index}.name`)}
                          disabled={!canEdit}
                          maxLength={200}
                          value={reward.name}
                          onChange={(event) =>
                            replaceReward(index, {
                              ...reward,
                              name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Internal code</span>
                        <input
                          {...validationField(`rewards.${index}.code`)}
                          disabled={!canEdit}
                          maxLength={80}
                          value={reward.code}
                          onChange={(event) =>
                            replaceReward(index, {
                              ...reward,
                              code: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Points cost</span>
                        <input
                          {...validationField(`rewards.${index}.costPoints`)}
                          disabled={!canEdit}
                          min="1"
                          step="1"
                          type="number"
                          value={reward.costPoints}
                          onChange={(event) =>
                            replaceReward(index, {
                              ...reward,
                              costPoints: event.target.value,
                            })
                          }
                        />
                      </label>
                      {nativeReward ? (
                        <label>
                          <span>Coupon validity (days)</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.validityDays`,
                            )}
                            disabled={!canEdit}
                            max="365"
                            min="1"
                            type="number"
                            value={nativeReward.configuration.validityDays}
                            onChange={(event) =>
                              replaceReward(index, {
                                ...nativeReward,
                                configuration: {
                                  ...nativeReward.configuration,
                                  validityDays: Number(event.target.value),
                                },
                              } as ProgrammeRewardDefinitionV2)
                            }
                          />
                        </label>
                      ) : manualReward ? (
                        <label>
                          <span>Fulfilment SLA (days)</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.fulfilmentSlaDays`,
                            )}
                            disabled={!canEdit}
                            max="90"
                            min="1"
                            type="number"
                            value={manualReward.configuration.fulfilmentSlaDays}
                            onChange={(event) =>
                              replaceReward(index, {
                                ...manualReward,
                                configuration: {
                                  ...manualReward.configuration,
                                  fulfilmentSlaDays: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      ) : null}
                    </div>

                    {reward.kind === "fixed_discount" ? (
                      <label className="expanded-reward-inline-field">
                        <span>Discount value (minor currency units)</span>
                        <input
                          {...validationField(
                            `rewards.${index}.configuration.amountMinor`,
                          )}
                          disabled={!canEdit}
                          min="1"
                          type="number"
                          value={reward.configuration.amountMinor}
                          onChange={(event) =>
                            replaceReward(index, {
                              ...reward,
                              configuration: {
                                ...reward.configuration,
                                amountMinor: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ) : null}
                    {reward.kind === "percentage_discount" ? (
                      <label className="expanded-reward-inline-field">
                        <span>Discount percentage</span>
                        <input
                          {...validationField(
                            `rewards.${index}.configuration.percentageBasisPoints`,
                          )}
                          disabled={!canEdit}
                          max="100"
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={
                            reward.configuration.percentageBasisPoints / 100
                          }
                          onChange={(event) =>
                            replaceReward(index, {
                              ...reward,
                              configuration: {
                                ...reward.configuration,
                                percentageBasisPoints: Math.round(
                                  Number(event.target.value) * 100,
                                ),
                              },
                            })
                          }
                        />
                        <small>
                          Maximum-capped percentages remain unsupported.
                        </small>
                      </label>
                    ) : null}
                    {reward.kind === "free_product" ? (
                      <div className="reward-form-grid">
                        <label>
                          <span>WooCommerce product ID</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.productId`,
                            )}
                            disabled={!canEdit}
                            inputMode="numeric"
                            value={reward.configuration.productId}
                            onChange={(event) =>
                              replaceReward(index, {
                                ...reward,
                                configuration: {
                                  ...reward.configuration,
                                  productId: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Free quantity</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.quantity`,
                            )}
                            disabled={!canEdit}
                            max="10"
                            min="1"
                            type="number"
                            value={reward.configuration.quantity}
                            onChange={(event) =>
                              replaceReward(index, {
                                ...reward,
                                configuration: {
                                  ...reward.configuration,
                                  quantity: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                    {manualReward ? (
                      <label className="expanded-reward-instructions">
                        <span>Fulfilment instructions</span>
                        <textarea
                          {...validationField(
                            `rewards.${index}.configuration.fulfilmentInstructions`,
                          )}
                          disabled={!canEdit}
                          maxLength={2000}
                          rows={4}
                          value={
                            manualReward.configuration.fulfilmentInstructions
                          }
                          onChange={(event) =>
                            replaceReward(index, {
                              ...manualReward,
                              configuration: {
                                ...manualReward.configuration,
                                fulfilmentInstructions: event.target.value,
                              },
                            })
                          }
                        />
                        <small>
                          These instructions are snapshotted when a member
                          claims the perk.
                        </small>
                      </label>
                    ) : null}

                    <details className="expanded-reward-details">
                      <summary>
                        <CalendarClock aria-hidden="true" /> Availability and
                        capacity
                      </summary>
                      <div className="reward-form-grid">
                        <label>
                          <span>Starts (UTC date, optional)</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.startsAt`,
                            )}
                            disabled={!canEdit}
                            type="date"
                            value={dateValue(
                              reward.configuration.availability.startsAt,
                            )}
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                startsAt: dateBoundary(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Ends (UTC date, optional)</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.endsAt`,
                            )}
                            disabled={!canEdit}
                            type="date"
                            value={dateValue(
                              reward.configuration.availability.endsAt,
                            )}
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                endsAt: dateBoundary(event.target.value, true),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Eligible tier codes</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.tierCodes`,
                            )}
                            disabled={!canEdit}
                            placeholder="rose, bloom"
                            value={reward.configuration.availability.tierCodes.join(
                              ", ",
                            )}
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                tierCodes: selectorList(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Per-member claims</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.perCustomerLimit`,
                            )}
                            disabled={!canEdit}
                            max="1000"
                            min="1"
                            placeholder="Unlimited"
                            type="number"
                            value={
                              reward.configuration.availability
                                .perCustomerLimit ?? ""
                            }
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                perCustomerLimit: optionalInteger(
                                  event.target.value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Global quantity</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.globalQuantity`,
                            )}
                            disabled={!canEdit}
                            min="1"
                            placeholder="Unlimited"
                            type="number"
                            value={
                              reward.configuration.availability
                                .globalQuantity ?? ""
                            }
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                globalQuantity: optionalBigint(
                                  event.target.value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Points liability budget</span>
                          <input
                            {...validationField(
                              `rewards.${index}.configuration.availability.pointsBudget`,
                            )}
                            disabled={!canEdit}
                            min="1"
                            placeholder="Unlimited"
                            type="number"
                            value={
                              reward.configuration.availability.pointsBudget ??
                              ""
                            }
                            onChange={(event) =>
                              updateAvailability(index, reward, {
                                pointsBudget: optionalBigint(
                                  event.target.value,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="expanded-reward-segment-note">
                        <Users aria-hidden="true" />
                        Audience segments stay unavailable until the M07
                        snapshot authority is live. Tier availability is
                        enforced now.
                      </div>
                    </details>

                    {nativeReward ? (
                      <details className="expanded-reward-details">
                        <summary>
                          <ShieldCheck aria-hidden="true" /> WooCommerce
                          restrictions
                        </summary>
                        <div className="reward-form-grid">
                          <label>
                            <span>Minimum spend (minor units)</span>
                            <input
                              {...validationField(
                                `rewards.${index}.configuration.restrictions.minimumSpendMinor`,
                              )}
                              disabled={!canEdit}
                              min="0"
                              placeholder="No minimum"
                              type="number"
                              value={
                                nativeReward.configuration.restrictions
                                  .minimumSpendMinor ?? ""
                              }
                              onChange={(event) =>
                                replaceReward(index, {
                                  ...nativeReward,
                                  configuration: {
                                    ...nativeReward.configuration,
                                    restrictions: {
                                      ...nativeReward.configuration
                                        .restrictions,
                                      minimumSpendMinor:
                                        event.target.value.trim() === ""
                                          ? null
                                          : event.target.value,
                                    },
                                  },
                                } as ProgrammeRewardDefinitionV2)
                              }
                            />
                          </label>
                          {reward.kind !== "free_product" ? (
                            <>
                              <label>
                                <span>Included product IDs</span>
                                <input
                                  {...validationField(
                                    `rewards.${index}.configuration.restrictions.productIds`,
                                  )}
                                  disabled={!canEdit}
                                  placeholder="42, 84"
                                  value={nativeReward.configuration.restrictions.productIds.join(
                                    ", ",
                                  )}
                                  onChange={(event) =>
                                    replaceReward(index, {
                                      ...nativeReward,
                                      configuration: {
                                        ...nativeReward.configuration,
                                        restrictions: {
                                          ...nativeReward.configuration
                                            .restrictions,
                                          productIds: selectorList(
                                            event.target.value,
                                          ),
                                        },
                                      },
                                    } as ProgrammeRewardDefinitionV2)
                                  }
                                />
                              </label>
                              <label>
                                <span>Excluded product IDs</span>
                                <input
                                  {...validationField(
                                    `rewards.${index}.configuration.restrictions.excludedProductIds`,
                                  )}
                                  disabled={!canEdit}
                                  placeholder="18, 29"
                                  value={nativeReward.configuration.restrictions.excludedProductIds.join(
                                    ", ",
                                  )}
                                  onChange={(event) =>
                                    replaceReward(index, {
                                      ...nativeReward,
                                      configuration: {
                                        ...nativeReward.configuration,
                                        restrictions: {
                                          ...nativeReward.configuration
                                            .restrictions,
                                          excludedProductIds: selectorList(
                                            event.target.value,
                                          ),
                                        },
                                      },
                                    } as ProgrammeRewardDefinitionV2)
                                  }
                                />
                              </label>
                              <label>
                                <span>Included category IDs</span>
                                <input
                                  {...validationField(
                                    `rewards.${index}.configuration.restrictions.categoryIds`,
                                  )}
                                  disabled={!canEdit}
                                  placeholder="7, 12"
                                  value={nativeReward.configuration.restrictions.categoryIds.join(
                                    ", ",
                                  )}
                                  onChange={(event) =>
                                    replaceReward(index, {
                                      ...nativeReward,
                                      configuration: {
                                        ...nativeReward.configuration,
                                        restrictions: {
                                          ...nativeReward.configuration
                                            .restrictions,
                                          categoryIds: selectorList(
                                            event.target.value,
                                          ),
                                        },
                                      },
                                    } as ProgrammeRewardDefinitionV2)
                                  }
                                />
                              </label>
                              <label>
                                <span>Excluded category IDs</span>
                                <input
                                  {...validationField(
                                    `rewards.${index}.configuration.restrictions.excludedCategoryIds`,
                                  )}
                                  disabled={!canEdit}
                                  placeholder="3, 6"
                                  value={nativeReward.configuration.restrictions.excludedCategoryIds.join(
                                    ", ",
                                  )}
                                  onChange={(event) =>
                                    replaceReward(index, {
                                      ...nativeReward,
                                      configuration: {
                                        ...nativeReward.configuration,
                                        restrictions: {
                                          ...nativeReward.configuration
                                            .restrictions,
                                          excludedCategoryIds: selectorList(
                                            event.target.value,
                                          ),
                                        },
                                      },
                                    } as ProgrammeRewardDefinitionV2)
                                  }
                                />
                              </label>
                            </>
                          ) : null}
                          <label>
                            <span>Coupon stacking</span>
                            <select
                              {...validationField(
                                `rewards.${index}.configuration.restrictions.stacking`,
                              )}
                              disabled={!canEdit}
                              value={
                                nativeReward.configuration.restrictions.stacking
                              }
                              onChange={(event) =>
                                replaceReward(index, {
                                  ...nativeReward,
                                  configuration: {
                                    ...nativeReward.configuration,
                                    restrictions: {
                                      ...nativeReward.configuration
                                        .restrictions,
                                      stacking: event.target.value as
                                        "exclusive" | "combinable",
                                    },
                                  },
                                } as ProgrammeRewardDefinitionV2)
                              }
                            >
                              <option value="exclusive">Exclusive</option>
                              <option value="combinable">Combinable</option>
                            </select>
                          </label>
                          <label className="programme-check-row">
                            <input
                              {...validationField(
                                `rewards.${index}.configuration.restrictions.excludeSaleItems`,
                              )}
                              checked={
                                nativeReward.configuration.restrictions
                                  .excludeSaleItems
                              }
                              disabled={!canEdit}
                              type="checkbox"
                              onChange={(event) =>
                                replaceReward(index, {
                                  ...nativeReward,
                                  configuration: {
                                    ...nativeReward.configuration,
                                    restrictions: {
                                      ...nativeReward.configuration
                                        .restrictions,
                                      excludeSaleItems: event.target.checked,
                                    },
                                  },
                                } as ProgrammeRewardDefinitionV2)
                              }
                            />
                            <span>Exclude sale items</span>
                          </label>
                        </div>
                      </details>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          )}
        </section>

        <aside className="ui-surface expanded-reward-summary">
          <span className="programme-workflow-kicker">
            <CheckCircle2 aria-hidden="true" /> Catalogue readiness
          </span>
          <h2>{validation.success ? "Ready for review" : "Needs attention"}</h2>
          <p>
            Saving creates a new immutable programme version. Live member value
            does not change until that exact version is published.
          </p>
          <dl className="programme-preview-summary">
            <div>
              <dt>Total rewards</dt>
              <dd>{rewards.length}</dd>
            </div>
            <div>
              <dt>Expanded native</dt>
              <dd>{expandedRewards.length - manualCount}</dd>
            </div>
            <div>
              <dt>Manual queue</dt>
              <dd>{manualCount}</dd>
            </div>
            <div>
              <dt>Capacity limited</dt>
              <dd>{limitedCount}</dd>
            </div>
          </dl>
          <div className="programme-safety-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              Points move only after PostgreSQL reserves wallet funds and reward
              capacity in one transaction.
            </p>
          </div>
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
                ? "Ready to save as a new draft"
                : "Fix the reward configuration"}
            </span>
            <p aria-live="polite" className={`action-message ${state.kind}`}>
              {state.message}
            </p>
            {!validation.success ? (
              <ul
                className="programme-validation-list"
                id={validationSummaryId}
                tabIndex={-1}
              >
                {validationIssues.slice(0, 6).map((issue) => (
                  <li key={`${issue.path.join(".")}:${issue.message}`}>
                    {issue.path.join(" → ")}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            className="ui-button ui-button-primary programme-save-button"
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save rewards as new draft"}
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
