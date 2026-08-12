"use client";

import {
  contrastAgainstWhite,
  type ExperienceThemeDefinitionV1,
} from "@starfiniti/contracts";
import { useActionState, useMemo, useState } from "react";
import { experienceFontStack } from "@/lib/experience-theme";
import { saveExperienceTheme } from "./actions";

const initialActionState = { kind: "idle", message: "" } as const;

export function ExperienceEditor({
  canEdit,
  initialTheme,
  operationId,
  programmeGroupId,
  workspaceId,
}: Readonly<{
  canEdit: boolean;
  initialTheme: ExperienceThemeDefinitionV1;
  operationId: string;
  programmeGroupId: string;
  workspaceId: string;
}>) {
  const [theme, setTheme] = useState(initialTheme);
  const [actionState, formAction, pending] = useActionState(
    saveExperienceTheme,
    initialActionState,
  );
  const contrast = useMemo(
    () => contrastAgainstWhite(theme.brandColor),
    [theme.brandColor],
  );

  return (
    <form className="experience-editor" action={formAction}>
      <input name="operationId" type="hidden" value={operationId} />
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
      <section className="experience-controls" aria-labelledby="theme-title">
        <div className="section-heading">
          <div>
            <p className="login-eyebrow">Controlled design tokens</p>
            <h2 id="theme-title">Customer theme</h2>
          </div>
          <span>{canEdit ? "Owner/admin" : "Read only"}</span>
        </div>

        <div className="experience-fields">
          <label>
            <span>Brand color</span>
            <div className="color-field">
              <input
                aria-label="Brand color picker"
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
              White-text contrast {contrast.toFixed(2)}:1 · minimum 4.5:1
            </small>
          </label>
          <label>
            <span>Display font</span>
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
              <option value="system-sans">System sans</option>
              <option value="editorial-serif">Editorial serif</option>
              <option value="modern-serif">Modern serif</option>
            </select>
            <small>
              Local stacks only; no remote font or tracking request.
            </small>
          </label>
          <label>
            <span>Card radius</span>
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
              <option value="8">Compact · 8px</option>
              <option value="14">Balanced · 14px</option>
              <option value="22">Soft · 22px</option>
            </select>
          </label>
          <label>
            <span>Widget position</span>
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
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="wide-field">
            <span>Guest headline</span>
            <input
              disabled={!canEdit}
              maxLength={120}
              name="heroText"
              onChange={(event) =>
                setTheme({ ...theme, heroText: event.target.value })
              }
              required
              value={theme.heroText}
            />
          </label>
          <label>
            <span>Points label</span>
            <input
              disabled={!canEdit}
              maxLength={30}
              name="pointsLabel"
              onChange={(event) =>
                setTheme({ ...theme, pointsLabel: event.target.value })
              }
              required
              value={theme.pointsLabel}
            />
          </label>
          <fieldset className="experience-toggles">
            <legend>Visible sections</legend>
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
              Tier progress
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
              Available rewards
            </label>
          </fieldset>
        </div>

        <div className="experience-save">
          <p>
            Raw CSS, JavaScript, font URLs, and uploads are excluded from this
            boundary.
          </p>
          <button
            className="primary"
            disabled={!canEdit || pending || contrast < 4.5}
            type="submit"
          >
            {pending ? "Saving…" : "Save theme"}
          </button>
        </div>
        <p aria-live="polite" className={`action-message ${actionState.kind}`}>
          {actionState.message}
        </p>
      </section>

      <section className="experience-preview" aria-labelledby="preview-title">
        <div className="section-heading">
          <div>
            <p className="login-eyebrow">Responsive preview</p>
            <h2 id="preview-title">Member wallet</h2>
          </div>
          <span>Sample data</span>
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
              Rewards
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
              <small>Your balance</small>
              <strong>
                2,450 <span>{theme.pointsLabel}</span>
              </strong>
              {theme.showTier ? (
                <div className="wallet-tier">
                  <span>Bloom</span>
                  <span>€182 to Icon</span>
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
                  Your rewards
                </h3>
                <div>
                  <article style={{ borderRadius: theme.cardRadiusPx }}>
                    <strong>€5 discount</strong>
                    <span>500 {theme.pointsLabel}</span>
                    <span
                      className="wallet-redeem"
                      style={{ backgroundColor: theme.brandColor }}
                    >
                      Redeem
                    </span>
                  </article>
                  <article style={{ borderRadius: theme.cardRadiusPx }}>
                    <strong>Free shipping</strong>
                    <span>700 {theme.pointsLabel}</span>
                    <span
                      className="wallet-redeem"
                      style={{ backgroundColor: theme.brandColor }}
                    >
                      Redeem
                    </span>
                  </article>
                </div>
              </div>
            ) : null}
          </div>
          <span
            aria-label={`Widget preview on the ${theme.widgetPosition}`}
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
            {theme.heroText}
          </h3>
          <p>Earn {theme.pointsLabel} on every eligible order.</p>
          <span style={{ backgroundColor: theme.brandColor }}>Join free</span>
        </div>
      </section>
    </form>
  );
}
