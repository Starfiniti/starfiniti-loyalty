"use client";

import {
  contrastAgainstWhite,
  type ExperienceLocaleV1,
  type ExperienceThemeDefinitionV1,
  type ExperienceTranslationDefinitionV1,
} from "@starfiniti/contracts";
import { useActionState, useMemo, useState } from "react";
import { experienceFontStack } from "@/lib/experience-theme";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import { saveExperienceTheme, saveExperienceTranslation } from "./actions";

const initialActionState = { kind: "idle", message: "" } as const;

export function ExperienceEditor({
  canEdit,
  initialTheme,
  initialTranslations,
  operationId,
  translationOperationIds,
  programmeGroupId,
  workspaceId,
  merchantLocale,
}: Readonly<{
  canEdit: boolean;
  initialTheme: ExperienceThemeDefinitionV1;
  initialTranslations: Readonly<
    Record<
      ExperienceLocaleV1,
      Readonly<{
        definition: ExperienceTranslationDefinitionV1;
        revision: number;
      }>
    >
  >;
  operationId: string;
  translationOperationIds: Readonly<Record<ExperienceLocaleV1, string>>;
  programmeGroupId: string;
  workspaceId: string;
  merchantLocale: MerchantLocale;
}>) {
  const t = (source: string) => merchantText(merchantLocale, source);
  const [theme, setTheme] = useState(initialTheme);
  const [locale, setLocale] = useState<ExperienceLocaleV1>("en");
  const [translations, setTranslations] = useState(() => ({
    en: initialTranslations.en.definition,
    "sl-SI": initialTranslations["sl-SI"].definition,
  }));
  const [actionState, formAction, pending] = useActionState(
    saveExperienceTheme,
    initialActionState,
  );
  const [translationActionState, translationAction, translationPending] =
    useActionState(saveExperienceTranslation, initialActionState);
  const translation = translations[locale];
  const previewText = (english: string, slovenian: string) =>
    locale === "sl-SI" ? slovenian : english;
  const previewBalance = new Intl.NumberFormat(
    locale === "sl-SI" ? "sl-SI" : "en-GB",
  ).format(2450);
  const contrast = useMemo(
    () => contrastAgainstWhite(theme.brandColor),
    [theme.brandColor],
  );

  const updateTranslation = (
    field: keyof Omit<ExperienceTranslationDefinitionV1, "version" | "locale">,
    value: string,
  ) => {
    setTranslations({
      ...translations,
      [locale]: { ...translation, [field]: value },
    });
  };

  return (
    <div className="experience-editor">
      <div className="experience-controls-stack">
        <form
          className="experience-controls"
          action={formAction}
          aria-labelledby="theme-title"
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
          <div className="section-heading">
            <div>
              <p className="login-eyebrow">{t("Controlled design tokens")}</p>
              <h2 id="theme-title">{t("Customer theme")}</h2>
            </div>
            <span>{canEdit ? t("Owner/admin") : t("Read only")}</span>
          </div>

          <div className="experience-fields">
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
                      .value as ExperienceThemeDefinitionV1["displayFont"],
                  })
                }
                value={theme.displayFont}
              >
                <option value="system-sans">{t("System sans")}</option>
                <option value="editorial-serif">{t("Editorial serif")}</option>
                <option value="modern-serif">{t("Modern serif")}</option>
              </select>
              <small>
                {t("Local stacks only; no remote font or tracking request.")}
              </small>
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
                    ) as ExperienceThemeDefinitionV1["cardRadiusPx"],
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
              <span>{t("Widget position")}</span>
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
            <fieldset className="experience-toggles">
              <legend>{t("Visible sections")}</legend>
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
                {t("Tier progress")}
              </label>
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
                {t("Available rewards")}
              </label>
            </fieldset>
          </div>

          <div className="experience-save">
            <p>
              {t(
                "Raw CSS, JavaScript, font URLs, and uploads are excluded from this boundary.",
              )}
            </p>
            <button
              className="primary"
              disabled={!canEdit || pending || contrast < 4.5}
              type="submit"
            >
              {pending ? t("Saving…") : t("Save theme")}
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
          action={translationAction}
          aria-labelledby="translation-title"
          className="experience-controls translation-controls"
        >
          <input name="lang" type="hidden" value={merchantLocale} />
          <input
            name="operationId"
            type="hidden"
            value={translationOperationIds[locale]}
          />
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input
            name="programmeGroupId"
            type="hidden"
            value={programmeGroupId}
          />
          <div className="section-heading">
            <div>
              <p className="login-eyebrow">{t("Allowlisted locale copy")}</p>
              <h2 id="translation-title">{t("Customer translations")}</h2>
            </div>
            <span>
              {t("Revision")} {initialTranslations[locale].revision || "—"}
            </span>
          </div>
          <div className="experience-fields">
            <label>
              <span>{t("Preview and edit locale")}</span>
              <select
                name="locale"
                onChange={(event) =>
                  setLocale(event.target.value as ExperienceLocaleV1)
                }
                value={locale}
              >
                <option value="en">{t("English")}</option>
                <option value="sl-SI">Slovenščina</option>
              </select>
            </label>
            <label>
              <span>{t("Points label")}</span>
              <input
                disabled={!canEdit}
                maxLength={30}
                name="pointsLabel"
                onChange={(event) =>
                  updateTranslation("pointsLabel", event.target.value)
                }
                required
                value={translation.pointsLabel}
              />
            </label>
            <label className="wide-field">
              <span>{t("Guest headline")}</span>
              <input
                disabled={!canEdit}
                maxLength={120}
                name="heroText"
                onChange={(event) =>
                  updateTranslation("heroText", event.target.value)
                }
                required
                value={translation.heroText}
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
                  onChange={(event) =>
                    updateTranslation(field, event.target.value)
                  }
                  required
                  value={translation[field]}
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
                  updateTranslation("earnMessage", event.target.value)
                }
                required
                value={translation.earnMessage}
              />
            </label>
          </div>
          <div className="experience-save">
            <p>
              {t(
                "English and Slovenian are explicit launch locales. Unsupported locale selectors fail closed instead of silently mixing copy.",
              )}
            </p>
            <button
              className="primary"
              disabled={!canEdit || translationPending}
              type="submit"
            >
              {translationPending
                ? t("Saving…")
                : `${t("Save copy")} (${locale})`}
            </button>
          </div>
          <p
            aria-live="polite"
            className={`action-message ${translationActionState.kind}`}
          >
            {translationActionState.message}
          </p>
        </form>
      </div>

      <section className="experience-preview" aria-labelledby="preview-title">
        <div className="section-heading">
          <div>
            <p className="login-eyebrow">{t("Responsive preview")}</p>
            <h2 id="preview-title">{t("Member wallet")}</h2>
          </div>
          <span>{t("Sample data")}</span>
        </div>
        <div className="wallet-preview">
          <div className="wallet-preview-header">
            <span
              style={{ backgroundColor: theme.brandColor }}
              aria-hidden="true"
            >
              R
            </span>
            <strong
              style={{ fontFamily: experienceFontStack(theme.displayFont) }}
            >
              {previewText("Rewards", "Nagrade")}
            </strong>
          </div>
          <div className="wallet-preview-body">
            <article
              className="wallet-balance"
              style={{
                backgroundColor: theme.brandColor,
                borderRadius: theme.cardRadiusPx,
              }}
            >
              <small>{translation.balanceLabel}</small>
              <strong>
                {previewBalance} <span>{translation.pointsLabel}</span>
              </strong>
              {theme.showTier ? (
                <div className="wallet-tier">
                  <span>Bloom</span>
                  <span>{previewText("€182 to Icon", "Še 182 € do Icon")}</span>
                  <i>
                    <b />
                  </i>
                </div>
              ) : null}
            </article>
            {theme.showRewards ? (
              <div className="wallet-rewards">
                <h3
                  style={{ fontFamily: experienceFontStack(theme.displayFont) }}
                >
                  {translation.rewardsLabel}
                </h3>
                <div>
                  <article style={{ borderRadius: theme.cardRadiusPx }}>
                    <strong>{previewText("€5 discount", "5 € popusta")}</strong>
                    <span>500 {translation.pointsLabel}</span>
                    <span
                      className="wallet-redeem"
                      style={{ backgroundColor: theme.brandColor }}
                    >
                      {translation.redeemLabel}
                    </span>
                  </article>
                  <article style={{ borderRadius: theme.cardRadiusPx }}>
                    <strong>
                      {previewText("Free shipping", "Brezplačna dostava")}
                    </strong>
                    <span>700 {translation.pointsLabel}</span>
                    <span
                      className="wallet-redeem"
                      style={{ backgroundColor: theme.brandColor }}
                    >
                      {translation.redeemLabel}
                    </span>
                  </article>
                </div>
              </div>
            ) : null}
          </div>
          <span
            aria-label={`${t("Widget preview on the")} ${t(theme.widgetPosition === "left" ? "Left" : "Right")}`}
            className={`wallet-widget ${theme.widgetPosition}`}
            style={{ backgroundColor: theme.brandColor }}
          >
            ★
          </span>
        </div>
        <div
          className="guest-preview"
          style={{ borderRadius: theme.cardRadiusPx }}
        >
          <h3 style={{ fontFamily: experienceFontStack(theme.displayFont) }}>
            {translation.heroText}
          </h3>
          <p>{translation.earnMessage}</p>
          <span style={{ backgroundColor: theme.brandColor }}>
            {translation.joinLabel}
          </span>
        </div>
      </section>
    </div>
  );
}
