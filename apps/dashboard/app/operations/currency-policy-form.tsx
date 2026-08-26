"use client";

import type { CurrencyConversionPolicyV1 } from "@starfiniti/contracts";
import {
  BadgeDollarSign,
  Check,
  CircleOff,
  Clock3,
  DatabaseZap,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  configureProgrammeCurrencyPolicy,
  type CurrencyPolicyActionState,
} from "./currency-policy-actions";

const initialState: CurrencyPolicyActionState = { kind: "idle", message: "" };

type Draft = Readonly<{
  sourceCurrencyCode: string;
  sourceMinorUnitDigits: number;
  providerKey: string;
  maxRateAgeSeconds: number;
  state: "enabled" | "disabled";
  expectedRevision: number;
}>;

function draftFromPolicy(policy?: CurrencyConversionPolicyV1): Draft {
  return policy
    ? {
        sourceCurrencyCode: policy.sourceCurrencyCode,
        sourceMinorUnitDigits: policy.sourceMinorUnitDigits,
        providerKey: policy.providerKey,
        maxRateAgeSeconds: policy.maxRateAgeSeconds,
        state: policy.state,
        expectedRevision: policy.revision,
      }
    : {
        sourceCurrencyCode: "",
        sourceMinorUnitDigits: 2,
        providerKey: "",
        maxRateAgeSeconds: 86_400,
        state: "disabled",
        expectedRevision: 0,
      };
}

function formatRateAge(seconds: number): string {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${seconds} seconds`;
}

export function CurrencyPolicyForm({
  programmeVersionId,
  programmeVersionNumber,
  baseCurrencyCode,
  baseMinorUnitDigits,
  policies,
  mayConfigure,
  configurationEnabled,
}: Readonly<{
  programmeVersionId: string;
  programmeVersionNumber: number;
  baseCurrencyCode: string;
  baseMinorUnitDigits: number;
  policies: readonly CurrencyConversionPolicyV1[];
  mayConfigure: boolean;
  configurationEnabled: boolean;
}>) {
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [selection, setSelection] = useState(
    policies[0]?.sourceCurrencyCode ?? "new",
  );
  const [draft, setDraft] = useState(() => draftFromPolicy(policies[0]));
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(
    configureProgrammeCurrencyPolicy,
    initialState,
  );
  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.sourceCurrencyCode === selection),
    [policies, selection],
  );
  const validDraft =
    /^[A-Z]{3}$/u.test(draft.sourceCurrencyCode) &&
    draft.sourceCurrencyCode !== baseCurrencyCode &&
    draft.sourceMinorUnitDigits >= 0 &&
    draft.sourceMinorUnitDigits <= 6 &&
    /^[a-z][a-z0-9_.-]{0,79}$/u.test(draft.providerKey) &&
    draft.maxRateAgeSeconds >= 60 &&
    draft.maxRateAgeSeconds <= 604_800;
  const canSubmit = mayConfigure && configurationEnabled && validDraft;

  function choosePolicy(value: string) {
    setSelection(value);
    setDraft(
      draftFromPolicy(
        policies.find((policy) => policy.sourceCurrencyCode === value),
      ),
    );
    setReviewing(false);
  }

  return (
    <section
      className="currency-policy-card"
      aria-labelledby="currency-policy-title"
    >
      <header className="currency-policy-heading">
        <div>
          <BadgeDollarSign aria-hidden="true" />
          <div>
            <p className="login-eyebrow">Exact monetary evidence</p>
            <h2 id="currency-policy-title">Multi-currency conversion</h2>
            <p>
              Convert foreign WooCommerce order facts into the immutable
              programme base. Each award retains its occurrence-time provider
              snapshot, rational rate, precision, and rounding proof.
            </p>
          </div>
        </div>
        <span className="revision-badge">
          V{programmeVersionNumber} · {baseCurrencyCode}
        </span>
      </header>

      <div
        className="currency-policy-summary"
        aria-label="Currency policy summary"
      >
        <article>
          <DatabaseZap aria-hidden="true" />
          <span>Programme base</span>
          <strong>{baseCurrencyCode}</strong>
          <small>{baseMinorUnitDigits} decimal places</small>
        </article>
        <article>
          <BadgeDollarSign aria-hidden="true" />
          <span>Configured sources</span>
          <strong>{policies.length}</strong>
          <small>
            {policies.filter((policy) => policy.state === "enabled").length}{" "}
            enabled
          </small>
        </article>
        <article>
          <Clock3 aria-hidden="true" />
          <span>Selection rule</span>
          <strong>Occurrence time</strong>
          <small>Ambiguous or stale snapshots fail closed</small>
        </article>
      </div>

      <form action={action} className="currency-policy-form">
        <input name="operationId" type="hidden" value={operationId} />
        <input
          name="programmeVersionId"
          type="hidden"
          value={programmeVersionId}
        />
        <input
          name="expectedRevision"
          type="hidden"
          value={draft.expectedRevision}
        />

        <div className="currency-policy-selector">
          <label>
            <span>Policy to review</span>
            <select
              disabled={!mayConfigure || !configurationEnabled}
              onChange={(event) => choosePolicy(event.target.value)}
              value={selection}
            >
              {policies.map((policy) => (
                <option
                  key={policy.policyVersionId}
                  value={policy.sourceCurrencyCode}
                >
                  {policy.sourceCurrencyCode} → {policy.baseCurrencyCode} ·
                  revision {policy.revision}
                </option>
              ))}
              <option value="new">Add source currency…</option>
            </select>
          </label>
          {selectedPolicy ? (
            <span className={`currency-policy-state ${selectedPolicy.state}`}>
              {selectedPolicy.state === "enabled" ? (
                <Check aria-hidden="true" />
              ) : (
                <CircleOff aria-hidden="true" />
              )}
              {selectedPolicy.state}
            </span>
          ) : (
            <span className="currency-policy-state new">New policy</span>
          )}
        </div>

        <fieldset
          className="currency-policy-fields"
          disabled={!mayConfigure || !configurationEnabled}
        >
          <legend className="sr-only">Conversion policy fields</legend>
          <label>
            <span>Source currency</span>
            <input
              autoCapitalize="characters"
              inputMode="text"
              maxLength={3}
              name="sourceCurrencyCode"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  sourceCurrencyCode: event.target.value.toUpperCase(),
                });
                setReviewing(false);
              }}
              readOnly={Boolean(selectedPolicy)}
              required
              value={draft.sourceCurrencyCode}
            />
            <small>ISO 4217 code; it cannot equal {baseCurrencyCode}.</small>
          </label>
          <label>
            <span>Decimal places</span>
            <input
              max={6}
              min={0}
              name="sourceMinorUnitDigits"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  sourceMinorUnitDigits: Number(event.target.value),
                });
                setReviewing(false);
              }}
              required
              type="number"
              value={draft.sourceMinorUnitDigits}
            />
            <small>Stored with every source amount.</small>
          </label>
          <label>
            <span>Approved provider key</span>
            <input
              autoComplete="off"
              maxLength={80}
              name="providerKey"
              onChange={(event) => {
                setDraft({ ...draft, providerKey: event.target.value });
                setReviewing(false);
              }}
              placeholder="approved-feed"
              required
              value={draft.providerKey}
            />
            <small>
              Identifier only. No credential or rate enters the browser.
            </small>
          </label>
          <label>
            <span>Maximum rate age (seconds)</span>
            <input
              max={604800}
              min={60}
              name="maxRateAgeSeconds"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  maxRateAgeSeconds: Number(event.target.value),
                });
                setReviewing(false);
              }}
              required
              type="number"
              value={draft.maxRateAgeSeconds}
            />
            <small>
              Current limit: {formatRateAge(draft.maxRateAgeSeconds)}.
            </small>
          </label>
          <label>
            <span>Processing state</span>
            <select
              name="state"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  state: event.target.value as Draft["state"],
                });
                setReviewing(false);
              }}
              value={draft.state}
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
            <small>
              Disabled blocks new conversion, never historical value.
            </small>
          </label>
        </fieldset>

        <p className="currency-policy-notice">
          Saving a policy does not ingest rates. An approved server-side adapter
          must supply signed or hashed snapshots before foreign orders can earn.
          Missing, stale, or overlapping evidence produces no award for review.
        </p>

        {!configurationEnabled ? (
          <p className="currency-policy-notice warning">
            The ecosystem capability is disabled. Existing balances, refunds,
            reconciliation, and checkout remain available.
          </p>
        ) : !mayConfigure ? (
          <p className="currency-policy-notice warning">
            Only a live owner or admin can create an immutable policy revision.
          </p>
        ) : !validDraft ? (
          <p className="currency-policy-notice warning">
            Complete a valid foreign currency, precision, provider key, and
            rate-age limit.
          </p>
        ) : null}

        {!reviewing ? (
          <button
            className="ui-button ui-button-secondary"
            disabled={!canSubmit}
            onClick={() => {
              setOperationId(crypto.randomUUID());
              setReviewing(true);
            }}
            type="button"
          >
            Review conversion policy
          </button>
        ) : (
          <div className="currency-policy-review">
            <div>
              <strong>
                {draft.sourceCurrencyCode} → {baseCurrencyCode} · {draft.state}
              </strong>
              <p>
                {draft.providerKey} · maximum age {draft.maxRateAgeSeconds}s ·
                next revision {draft.expectedRevision + 1}
              </p>
            </div>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="configure"
              />
              I reviewed the exact currency boundary.
            </label>
            <button
              className="ui-button ui-button-primary"
              disabled={pending}
              type="submit"
            >
              {pending ? "Saving…" : "Save immutable revision"}
            </button>
          </div>
        )}

        {state.kind !== "idle" ? (
          <p className={`action-message ${state.kind}`} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
