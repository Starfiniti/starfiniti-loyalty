"use client";

import {
  contrastAgainstWhite,
  type ExperienceCopyDefinitionV2,
  type ExperienceHeroAssetV2,
  type ExperienceSectionV2,
  type ExperienceThemeDefinitionV2,
} from "@starfiniti/contracts";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  CircleUserRound,
  Crown,
  Gift,
  History,
  LayoutDashboard,
  Monitor,
  PanelTop,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  UsersRound,
  WifiOff,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useActionState, useMemo, useState } from "react";
import { experienceFontStack } from "@/lib/experience-theme";
import { visibleCustomerExperienceSections } from "@/lib/customer-experience-presentation";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import { saveExperienceCopy, saveExperienceTheme } from "./actions";

const initialActionState = { kind: "idle", message: "" } as const;

const sectionMeta: Readonly<
  Record<
    ExperienceSectionV2,
    Readonly<{
      label: string;
      detail: string;
      icon: LucideIcon;
      optional: boolean;
    }>
  >
> = {
  overview: {
    label: "Overview",
    detail: "Balance, status, and next expiry",
    icon: LayoutDashboard,
    optional: false,
  },
  earning: {
    label: "Ways to earn",
    detail: "Published earning methods",
    icon: Sparkles,
    optional: false,
  },
  rewards: {
    label: "Rewards",
    detail: "Discovery and redemption",
    icon: Gift,
    optional: true,
  },
  vip: {
    label: "VIP status",
    detail: "Tier progress and history",
    icon: Crown,
    optional: true,
  },
  referrals: {
    label: "Referrals",
    detail: "Sharing and qualification",
    icon: UsersRound,
    optional: true,
  },
  history: {
    label: "Points history",
    detail: "Immutable value changes",
    icon: History,
    optional: false,
  },
  account: {
    label: "Account",
    detail: "Connection, privacy, and export",
    icon: CircleUserRound,
    optional: false,
  },
};

const heroIcons: Readonly<Record<ExperienceHeroAssetV2, LucideIcon | null>> = {
  none: null,
  sparkles: Sparkles,
  gift: Gift,
  crown: Crown,
};

type PreviewSurface = "member" | "public" | "woocommerce";
type PreviewViewport = "desktop" | "mobile";
type PreviewState = "ready" | "guest" | "offline" | "empty";

export function ExperienceEditor({
  canEdit,
  copyOperationId,
  initialCopy,
  initialTheme,
  operationId,
  programmeGroupId,
  workspaceId,
  merchantLocale,
}: Readonly<{
  canEdit: boolean;
  copyOperationId: string;
  initialCopy: Readonly<{
    definition: ExperienceCopyDefinitionV2;
    revision: number;
  }>;
  initialTheme: ExperienceThemeDefinitionV2;
  operationId: string;
  programmeGroupId: string;
  workspaceId: string;
  merchantLocale: MerchantLocale;
}>) {
  const t = (source: string) => merchantText(merchantLocale, source);
  const [theme, setTheme] = useState(initialTheme);
  const [copy, setCopy] = useState(initialCopy.definition);
  const [surface, setSurface] = useState<PreviewSurface>("member");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [actionState, formAction, pending] = useActionState(
    saveExperienceTheme,
    initialActionState,
  );
  const [copyActionState, copyAction, copyPending] = useActionState(
    saveExperienceCopy,
    initialActionState,
  );
  const contrast = useMemo(
    () => contrastAgainstWhite(theme.brandColor),
    [theme.brandColor],
  );

  function updateCopy(
    field: keyof Omit<ExperienceCopyDefinitionV2, "version" | "locale">,
    value: string,
  ) {
    setCopy({ ...copy, [field]: value });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= theme.sectionOrder.length) return;
    const sectionOrder = [...theme.sectionOrder];
    [sectionOrder[index], sectionOrder[target]] = [
      sectionOrder[target]!,
      sectionOrder[index]!,
    ];
    setTheme({ ...theme, sectionOrder });
  }

  return (
    <div className="experience-editor experience-editor-v2">
      <div className="experience-controls-stack">
        <form
          action={formAction}
          aria-labelledby="theme-title"
          className="experience-controls"
        >
          <input name="lang" type="hidden" value={merchantLocale} />
          <input name="operationId" type="hidden" value={operationId} />
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input
            name="programmeGroupId"
            type="hidden"
            value={programmeGroupId}
          />
          <input name="heroText" type="hidden" value={theme.heroText} />
          <input name="pointsLabel" type="hidden" value={theme.pointsLabel} />
          {theme.sectionOrder.map((section) => (
            <input
              key={section}
              name="sectionOrder"
              type="hidden"
              value={section}
            />
          ))}

          <div className="section-heading">
            <div>
              <p className="login-eyebrow">{t("Controlled presentation")}</p>
              <h2 id="theme-title">{t("Brand and composition")}</h2>
              <p>
                {t(
                  "Use reviewed tokens and semantic sections. No custom code, remote fonts, or arbitrary assets enter customer pages.",
                )}
              </p>
            </div>
            <span>{canEdit ? t("Owner/admin") : t("Read only")}</span>
          </div>

          <div className="experience-fields experience-token-grid">
            <label>
              <span>{t("Brand color")}</span>
              <div className="color-field">
                <input
                  aria-label={t("Brand color picker")}
                  disabled={!canEdit}
                  name="brandColor"
                  onChange={(event) =>
                    setTheme({ ...theme, brandColor: event.target.value })
                  }
                  type="color"
                  value={theme.brandColor}
                />
                <code>{theme.brandColor}</code>
              </div>
              <small
                className={contrast >= 4.5 ? "contrast-pass" : "contrast-fail"}
              >
                {t("White-text contrast")} {contrast.toFixed(2)}:1 ·{" "}
                {t("minimum")} 4.5:1
              </small>
            </label>
            <label>
              <span>{t("Display font")}</span>
              <select
                disabled={!canEdit}
                name="displayFont"
                onChange={(event) =>
                  setTheme({
                    ...theme,
                    displayFont: event.target
                      .value as ExperienceThemeDefinitionV2["displayFont"],
                  })
                }
                value={theme.displayFont}
              >
                <option value="system-sans">{t("System sans")}</option>
                <option value="editorial-serif">{t("Editorial serif")}</option>
                <option value="modern-serif">{t("Modern serif")}</option>
              </select>
            </label>
            <label>
              <span>{t("Card radius")}</span>
              <select
                disabled={!canEdit}
                name="cardRadiusPx"
                onChange={(event) =>
                  setTheme({
                    ...theme,
                    cardRadiusPx: Number(
                      event.target.value,
                    ) as ExperienceThemeDefinitionV2["cardRadiusPx"],
                  })
                }
                value={theme.cardRadiusPx}
              >
                <option value="8">{t("Compact")} · 8px</option>
                <option value="14">{t("Balanced")} · 14px</option>
                <option value="22">{t("Soft")} · 22px</option>
              </select>
            </label>
            <label>
              <span>{t("Content density")}</span>
              <select
                disabled={!canEdit}
                name="density"
                onChange={(event) =>
                  setTheme({
                    ...theme,
                    density: event.target
                      .value as ExperienceThemeDefinitionV2["density"],
                  })
                }
                value={theme.density}
              >
                <option value="comfortable">{t("Comfortable")}</option>
                <option value="compact">{t("Compact")}</option>
              </select>
            </label>
            <label>
              <span>{t("Hero icon")}</span>
              <select
                disabled={!canEdit}
                name="heroAsset"
                onChange={(event) =>
                  setTheme({
                    ...theme,
                    heroAsset: event.target
                      .value as ExperienceThemeDefinitionV2["heroAsset"],
                  })
                }
                value={theme.heroAsset}
              >
                <option value="none">{t("None")}</option>
                <option value="sparkles">{t("Sparkles")}</option>
                <option value="gift">{t("Gift")}</option>
                <option value="crown">{t("Crown")}</option>
              </select>
              <small>{t("Reviewed Lucide icons only.")}</small>
            </label>
            <label>
              <span>{t("WooCommerce panel position")}</span>
              <select
                disabled={!canEdit}
                name="widgetPosition"
                onChange={(event) =>
                  setTheme({
                    ...theme,
                    widgetPosition: event.target.value as "left" | "right",
                  })
                }
                value={theme.widgetPosition}
              >
                <option value="left">{t("Left")}</option>
                <option value="right">{t("Right")}</option>
              </select>
            </label>
          </div>

          <fieldset className="experience-toggles experience-visibility-grid">
            <legend>{t("Optional customer sections")}</legend>
            <label>
              <input
                checked={theme.showRewards}
                disabled={!canEdit}
                name="showRewards"
                onChange={(event) =>
                  setTheme({ ...theme, showRewards: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <strong>{t("Rewards")}</strong>
                <small>{t("Discovery and redemption cards")}</small>
              </span>
            </label>
            <label>
              <input
                checked={theme.showTier}
                disabled={!canEdit}
                name="showTier"
                onChange={(event) =>
                  setTheme({ ...theme, showTier: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <strong>{t("VIP status")}</strong>
                <small>{t("Tier progress and history")}</small>
              </span>
            </label>
            <label>
              <input
                checked={theme.showReferrals}
                disabled={!canEdit}
                name="showReferrals"
                onChange={(event) =>
                  setTheme({ ...theme, showReferrals: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <strong>{t("Referrals")}</strong>
                <small>{t("Sharing and qualification progress")}</small>
              </span>
            </label>
          </fieldset>

          <fieldset className="experience-section-order">
            <legend>{t("Section order")}</legend>
            <p>
              {t(
                "All seven semantic sections remain in the contract. Core value, history, privacy, and account access cannot be hidden.",
              )}
            </p>
            <ol>
              {theme.sectionOrder.map((section, index) => {
                const meta = sectionMeta[section];
                const Icon = meta.icon;
                return (
                  <li key={section}>
                    <span
                      className="experience-section-icon"
                      aria-hidden="true"
                    >
                      <Icon />
                    </span>
                    <span>
                      <strong>{t(meta.label)}</strong>
                      <small>
                        {t(meta.detail)} ·{" "}
                        {t(meta.optional ? "Optional" : "Always visible")}
                      </small>
                    </span>
                    <span className="experience-order-actions">
                      <button
                        aria-label={`${t("Move")} ${t(meta.label)} ${t("up")}`}
                        disabled={!canEdit || index === 0}
                        onClick={() => moveSection(index, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`${t("Move")} ${t(meta.label)} ${t("down")}`}
                        disabled={
                          !canEdit || index === theme.sectionOrder.length - 1
                        }
                        onClick={() => moveSection(index, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </fieldset>

          <div className="experience-save">
            <p>
              {t(
                "Saving revisions one audited presentation; preview state controls are never persisted.",
              )}
            </p>
            <button
              className="primary"
              disabled={!canEdit || pending || contrast < 4.5}
              type="submit"
            >
              {pending ? t("Saving…") : t("Save presentation")}
            </button>
          </div>
          <p
            aria-live="polite"
            className={`action-message ${actionState.kind}`}
          >
            {actionState.message}
          </p>
        </form>

        <form
          action={copyAction}
          aria-labelledby="copy-title"
          className="experience-controls translation-controls"
        >
          <input name="lang" type="hidden" value={merchantLocale} />
          <input name="operationId" type="hidden" value={copyOperationId} />
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input
            name="programmeGroupId"
            type="hidden"
            value={programmeGroupId}
          />
          <div className="section-heading">
            <div>
              <p className="login-eyebrow">{t("English customer copy")}</p>
              <h2 id="copy-title">{t("Labels and messages")}</h2>
              <p>
                {t(
                  "English is the only active customer language. There is no locale switcher in this experience.",
                )}
              </p>
            </div>
            <span>
              {t("Revision")} {initialCopy.revision || "—"}
            </span>
          </div>
          <div className="experience-fields">
            <label>
              <span>{t("Points label")}</span>
              <input
                disabled={!canEdit}
                maxLength={30}
                name="pointsLabel"
                onChange={(event) =>
                  updateCopy("pointsLabel", event.target.value)
                }
                required
                value={copy.pointsLabel}
              />
            </label>
            <label className="wide-field">
              <span>{t("Guest headline")}</span>
              <input
                disabled={!canEdit}
                maxLength={120}
                name="heroText"
                onChange={(event) => updateCopy("heroText", event.target.value)}
                required
                value={copy.heroText}
              />
            </label>
            {(
              [
                ["balanceLabel", "Balance label", 40],
                ["rewardsLabel", "Rewards heading", 40],
                ["redeemLabel", "Redeem action", 30],
                ["joinLabel", "Join action", 30],
              ] as const
            ).map(([field, label, maxLength]) => (
              <label key={field}>
                <span>{t(label)}</span>
                <input
                  disabled={!canEdit}
                  maxLength={maxLength}
                  name={field}
                  onChange={(event) => updateCopy(field, event.target.value)}
                  required
                  value={copy[field]}
                />
              </label>
            ))}
            <label className="wide-field">
              <span>{t("Guest earning message")}</span>
              <input
                disabled={!canEdit}
                maxLength={120}
                name="earnMessage"
                onChange={(event) =>
                  updateCopy("earnMessage", event.target.value)
                }
                required
                value={copy.earnMessage}
              />
            </label>
          </div>
          <div className="experience-save">
            <p>
              {t(
                "Legacy stored locales remain rollback history and are not selected or rendered.",
              )}
            </p>
            <button
              className="primary"
              disabled={!canEdit || copyPending}
              type="submit"
            >
              {copyPending ? t("Saving…") : t("Save English copy")}
            </button>
          </div>
          <p
            aria-live="polite"
            className={`action-message ${copyActionState.kind}`}
          >
            {copyActionState.message}
          </p>
        </form>
      </div>

      <section
        className="experience-preview experience-preview-v2"
        aria-labelledby="preview-title"
      >
        <div className="section-heading">
          <div>
            <p className="login-eyebrow">{t("Deterministic preview")}</p>
            <h2 id="preview-title">{t("Customer composition")}</h2>
          </div>
          <span>{t("Sample data")}</span>
        </div>
        <div className="experience-preview-toolbar">
          <div aria-label={t("Preview surface")} role="group">
            {(
              [
                ["member", "Member", CircleUserRound],
                ["public", "Public page", PanelTop],
                ["woocommerce", "WooCommerce", Store],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                aria-pressed={surface === value}
                key={value}
                onClick={() => setSurface(value)}
                type="button"
              >
                <Icon aria-hidden="true" /> {t(label)}
              </button>
            ))}
          </div>
          <div aria-label={t("Preview viewport")} role="group">
            <button
              aria-label={t("Desktop preview")}
              aria-pressed={viewport === "desktop"}
              onClick={() => setViewport("desktop")}
              type="button"
            >
              <Monitor aria-hidden="true" />
            </button>
            <button
              aria-label={t("Mobile preview")}
              aria-pressed={viewport === "mobile"}
              onClick={() => setViewport("mobile")}
              type="button"
            >
              <Smartphone aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          className="experience-preview-states"
          aria-label={t("Preview state")}
          role="group"
        >
          {(
            [
              ["ready", "Ready"],
              ["guest", "Guest"],
              ["offline", "Hub offline"],
              ["empty", "Empty programme"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={previewState === value}
              key={value}
              onClick={() => setPreviewState(value)}
              type="button"
            >
              {t(label)}
            </button>
          ))}
        </div>
        <ExperiencePreview
          copy={copy}
          state={previewState}
          surface={surface}
          theme={theme}
          viewport={viewport}
        />
        <p className="experience-preview-note">
          <ShieldCheck aria-hidden="true" />
          {surface === "woocommerce"
            ? t(
                "WooCommerce renders locally cached data and native coupons; checkout never waits for the Hub.",
              )
            : t(
                "Preview uses the same bounded presentation contract as the customer read model.",
              )}
        </p>
      </section>
    </div>
  );
}

function ExperiencePreview({
  copy,
  state,
  surface,
  theme,
  viewport,
}: Readonly<{
  copy: ExperienceCopyDefinitionV2;
  state: PreviewState;
  surface: PreviewSurface;
  theme: ExperienceThemeDefinitionV2;
  viewport: PreviewViewport;
}>) {
  const HeroIcon = heroIcons[theme.heroAsset];
  const visibleSections = visibleCustomerExperienceSections(theme);
  const style = {
    "--experience-preview-brand": theme.brandColor,
    "--experience-preview-radius": `${theme.cardRadiusPx}px`,
    "--experience-preview-font": experienceFontStack(theme.displayFont),
  } as CSSProperties;

  return (
    <div
      className={`experience-composition ${viewport} ${theme.density}`}
      data-state={state}
      data-surface={surface}
      style={style}
    >
      <div className="experience-composition-topbar">
        <span aria-hidden="true">
          <Sparkles />
        </span>
        <strong>Rosy Rewards</strong>
        <small>{surface === "woocommerce" ? "My account" : "Loyalty"}</small>
      </div>

      {state === "guest" ? (
        <div className="experience-composition-guest">
          {HeroIcon ? <HeroIcon aria-hidden="true" /> : null}
          <h3>{copy.heroText}</h3>
          <p>{copy.earnMessage}</p>
          <span>{copy.joinLabel}</span>
        </div>
      ) : (
        <>
          <div className="experience-composition-hero">
            <div>
              <small>
                {state === "offline"
                  ? "Last verified balance"
                  : copy.balanceLabel}
              </small>
              <strong>{state === "empty" ? "0" : "2,450"}</strong>
              <span>{copy.pointsLabel}</span>
              <p>
                {state === "offline"
                  ? "The Hub is unavailable. Cached loyalty details remain visible."
                  : state === "empty"
                    ? "Your first eligible activity will appear here."
                    : "Bloom member · €182 to Icon"}
              </p>
            </div>
            {state === "offline" ? (
              <WifiOff aria-hidden="true" />
            ) : HeroIcon ? (
              <HeroIcon aria-hidden="true" />
            ) : null}
          </div>

          <div className="experience-composition-sections">
            {visibleSections.map((section) => {
              const meta = sectionMeta[section];
              const Icon = meta.icon;
              return (
                <article key={section}>
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>
                      {section === "rewards" ? copy.rewardsLabel : meta.label}
                    </strong>
                    <small>
                      {previewSectionDetail(section, state, surface, copy)}
                    </small>
                  </span>
                </article>
              );
            })}
          </div>
        </>
      )}

      {surface === "woocommerce" ? (
        <span
          className={`experience-composition-widget ${theme.widgetPosition}`}
        >
          <ShoppingBag aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

function previewSectionDetail(
  section: ExperienceSectionV2,
  state: PreviewState,
  surface: PreviewSurface,
  copy: ExperienceCopyDefinitionV2,
): string {
  if (state === "offline") {
    return section === "account"
      ? "Native account access remains available"
      : "Last locally verified customer state";
  }
  if (state === "empty") {
    return section === "history"
      ? "No points activity yet"
      : "This section is ready for published content";
  }
  const details: Record<ExperienceSectionV2, string> = {
    overview: "2,450 available · 120 pending",
    earning: "5 points per eligible €1",
    rewards: `€5 discount · ${copy.redeemLabel}`,
    vip: "Bloom · 64% to Icon",
    referrals: "Share link ready · 2 qualified",
    history: "Order released · +750 points",
    account:
      surface === "woocommerce"
        ? "Native My account and coupon access"
        : "Verified store · export available",
  };
  return details[section];
}
