"use client";

import type { MerchantNotificationEmailTemplateV1 } from "@starfiniti/contracts";
import { Braces, Check, FlaskConical, Save, Send } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  publishNotificationTemplate,
  sendNotificationTest,
  type NotificationActionState,
} from "./actions";

const idle: NotificationActionState = { kind: "idle", message: "" };

const eventLabels: Readonly<Record<string, string>> = {
  "loyalty.points.earned": "Points earned",
  "loyalty.points.released": "Points available",
  "loyalty.points.expiring": "Points expiring",
  "loyalty.reward.changed": "Reward update",
  "loyalty.tier.changed": "VIP tier update",
  "loyalty.referral.changed": "Referral update",
};

const sampleValues: Readonly<Record<string, string>> = {
  points: "100",
  pendingUntil: "28 Aug 2026",
  availableBalance: "500",
  expiresAt: "1 Sep 2026",
  daysRemaining: "7",
  rewardReservationId: "reward-7Q2M",
  rewardCode: "WELCOME_REWARD",
  state: "issued",
  fromTierCode: "Rose",
  toTierCode: "Bloom",
  effectiveAt: "25 Aug 2026",
  referralId: "referral-4N8K",
  party: "advocate",
};

function interpolate(template: string): string {
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu, (_, token) =>
    String(sampleValues[token] ?? `{{${token}}}`),
  );
}

function ActionMessage({
  state,
}: Readonly<{ state: NotificationActionState }>) {
  if (state.kind === "idle") return null;
  return (
    <p
      className={`notification-action-message is-${state.kind}`}
      role={state.kind === "error" ? "alert" : "status"}
    >
      {state.kind === "success" ? <Check aria-hidden="true" /> : null}
      {state.message}
    </p>
  );
}

export function NotificationTemplateStudio({
  canManage,
  publishOperationId,
  testOperationId,
  templates,
  workspaceId,
}: Readonly<{
  canManage: boolean;
  publishOperationId: string;
  testOperationId: string;
  templates: readonly MerchantNotificationEmailTemplateV1[];
  workspaceId: string;
}>) {
  const [selectedEventType, setSelectedEventType] = useState(
    templates[0]?.eventType ?? "loyalty.points.earned",
  );
  const selected = useMemo(
    () =>
      templates.find((template) => template.eventType === selectedEventType) ??
      templates[0],
    [selectedEventType, templates],
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishNotificationTemplate,
    idle,
  );
  const [testState, testAction, testPending] = useActionState(
    sendNotificationTest,
    idle,
  );
  if (!selected) return null;

  return (
    <section
      className="notification-studio"
      aria-labelledby="template-studio-title"
    >
      <div className="notification-panel-heading">
        <div>
          <p className="login-eyebrow">English transactional email</p>
          <h2 id="template-studio-title">Template studio</h2>
          <p>
            Safe text only. Publishing creates a new immutable version; messages
            already accepted keep the exact version they started with.
          </p>
        </div>
        <span className="ui-badge ui-badge-neutral">
          {selected.source === "organization" ? "CUSTOM" : "SYSTEM"} · V
          {selected.templateVersion}
        </span>
      </div>

      <div
        aria-label="Email templates"
        className="notification-template-tabs"
        role="group"
      >
        {templates.map((template) => (
          <button
            aria-pressed={template.eventType === selected.eventType}
            className={
              template.eventType === selected.eventType ? "is-active" : ""
            }
            key={template.eventType}
            onClick={() => setSelectedEventType(template.eventType)}
            type="button"
          >
            <Send aria-hidden="true" />
            <span>{eventLabels[template.eventType]}</span>
            <small>V{template.templateVersion}</small>
          </button>
        ))}
      </div>

      <div className="notification-studio-grid">
        <form
          action={publishAction}
          className="notification-template-form"
          key={selected.templateId}
        >
          <input name="workspaceId" type="hidden" value={workspaceId} />
          <input name="eventType" type="hidden" value={selected.eventType} />
          <input name="operationId" type="hidden" value={publishOperationId} />
          <label>
            <span>Subject</span>
            <input
              defaultValue={selected.subjectTemplate}
              disabled={!canManage || publishPending}
              maxLength={200}
              name="subjectTemplate"
              required
            />
          </label>
          <label>
            <span>Plain-text message</span>
            <textarea
              defaultValue={selected.textTemplate}
              disabled={!canManage || publishPending}
              maxLength={4000}
              name="textTemplate"
              required
              rows={8}
            />
          </label>
          <div className="notification-token-list" aria-label="Allowed tokens">
            <span>
              <Braces aria-hidden="true" /> Allowed tokens
            </span>
            <div>
              {selected.allowedTokens.map((token) => (
                <code key={token}>{`{{${token}}}`}</code>
              ))}
            </div>
          </div>
          <div className="notification-form-footer">
            <p>
              Markup, URLs, files, remote assets, and unknown tokens are
              blocked.
            </p>
            <button
              className="ui-button ui-button-primary"
              disabled={!canManage || publishPending}
              type="submit"
            >
              <Save aria-hidden="true" />
              {publishPending ? "Publishing…" : "Publish new version"}
            </button>
          </div>
          {!canManage ? (
            <p className="notification-role-note">
              Owner or admin access is required to publish.
            </p>
          ) : null}
          <ActionMessage state={publishState} />
        </form>

        <aside
          className="notification-email-preview"
          aria-label="Email preview"
        >
          <div className="notification-preview-toolbar">
            <span>
              <FlaskConical aria-hidden="true" /> Safe preview
            </span>
            <span>EN</span>
          </div>
          <div className="notification-preview-envelope">
            <small>STARFINITI LOYALTY</small>
            <h3>{interpolate(selected.subjectTemplate)}</h3>
            <p>{interpolate(selected.textTemplate)}</p>
            <footer>
              This preview uses fixed sample values and never customer data.
            </footer>
          </div>
          <form action={testAction} className="notification-test-form">
            <input name="workspaceId" type="hidden" value={workspaceId} />
            <input name="eventType" type="hidden" value={selected.eventType} />
            <input name="operationId" type="hidden" value={testOperationId} />
            <button
              className="ui-button"
              disabled={!canManage || testPending}
              type="submit"
            >
              <FlaskConical aria-hidden="true" />
              {testPending ? "Queueing…" : "Send active version test"}
            </button>
            <p>Recipient: your verified Starfiniti sign-in email.</p>
          </form>
          <ActionMessage state={testState} />
        </aside>
      </div>
    </section>
  );
}
