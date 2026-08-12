"use client";

import { useActionState } from "react";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import { createInitialProgramme, type ProgrammeActionState } from "./actions";

const initialState: ProgrammeActionState = { kind: "idle", message: "" };

export function ProgrammeOnboarding({
  programmeGroupId,
  programmeGroupName,
  suggestedName,
  operationId,
  locale,
}: {
  programmeGroupId: string;
  programmeGroupName: string;
  suggestedName: string;
  operationId: string;
  locale: MerchantLocale;
}) {
  const t = (source: string) => merchantText(locale, source);
  const [state, action, pending] = useActionState(
    createInitialProgramme,
    initialState,
  );

  return (
    <section className="programme-panel onboarding-panel">
      <div className="programme-panel-heading">
        <div>
          <p className="login-eyebrow">{t("Step 1 of 2")}</p>
          <h2>{t("Create your programme")}</h2>
          <p>
            {locale === "sl-SI"
              ? `S tem ustvarite vsebnik programa v skupini ${programmeGroupName}. Nato boste stopnje in nagrade opredelili v ločenem nespremenljivem osnutku.`
              : `This creates the programme container in ${programmeGroupName}. You will define tiers and rewards as a separate immutable draft next.`}
          </p>
        </div>
        <span className="status-pill draft">{t("Not launched")}</span>
      </div>
      <form action={action} className="onboarding-form">
        <input name="lang" type="hidden" value={locale} />
        <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          {t("Programme name")}
          <input
            autoComplete="organization-title"
            defaultValue={suggestedName}
            maxLength={200}
            minLength={1}
            name="name"
            required
          />
          <span>{t("Shown to merchant users and in programme history.")}</span>
        </label>
        <label>
          {t("Programme slug")}
          <input
            autoCapitalize="none"
            autoComplete="off"
            defaultValue="loyalty-programme"
            maxLength={80}
            minLength={2}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            spellCheck={false}
          />
          <span>
            {t("Lowercase letters, numbers, and single hyphens only.")}
          </span>
        </label>
        <div className="onboarding-submit">
          <p>
            {t(
              "Creating this container does not award points or publish a value policy.",
            )}
          </p>
          <button className="primary" disabled={pending} type="submit">
            {pending ? t("Creating programme...") : t("Create programme")}
          </button>
        </div>
        <p aria-live="polite" className={`action-message ${state.kind}`}>
          {state.message}
        </p>
      </form>
    </section>
  );
}
