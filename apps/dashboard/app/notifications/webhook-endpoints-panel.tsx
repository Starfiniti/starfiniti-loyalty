"use client";

import type {
  NotificationWebhookEndpointReadV1,
  NotificationWebhookEndpointsDocumentV1,
  NotificationEventV1,
} from "@starfiniti/contracts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  LockKeyhole,
  Plus,
  RotateCw,
  Trash2,
  Webhook,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  changeWebhookEndpointStateAction,
  createWebhookEndpointAction,
  rotateWebhookEndpointAction,
  type WebhookActionState,
} from "./webhook-actions";

const initialState: WebhookActionState = {
  kind: "idle",
  message: "",
  secret: null,
};
const eventTypes = [
  "loyalty.points.earned",
  "loyalty.points.released",
  "loyalty.points.expiring",
  "loyalty.reward.changed",
  "loyalty.tier.changed",
  "loyalty.referral.changed",
  "loyalty.campaign.effect",
  "loyalty.connector.health",
  "loyalty.billing.changed",
] as const satisfies readonly NotificationEventV1["eventType"][];

type OperationIds = Readonly<{
  create: string;
  endpoints: Readonly<
    Record<
      string,
      Readonly<{ disable: string; rotate: string; retire: string }>
    >
  >;
}>;

export function WebhookEndpointsPanel({
  document,
  operationIds,
  workspaceId,
}: Readonly<{
  document: NotificationWebhookEndpointsDocumentV1;
  operationIds: OperationIds;
  workspaceId: string;
}>) {
  return (
    <section
      className="notification-webhook-panel"
      aria-labelledby="notification-webhook-title"
    >
      <div className="notification-panel-heading">
        <div>
          <p className="login-eyebrow">Provider-neutral integration</p>
          <h2 id="notification-webhook-title">Signed webhook endpoints</h2>
          <p>
            Inspect the real event flow, rotate endpoint-bound keys, and stop
            delivery without exposing payloads, customer contact, or worker
            credentials.
          </p>
        </div>
        <span className="ui-badge ui-badge-neutral">
          {document.endpoints.length} ENDPOINTS
        </span>
      </div>

      {document.canManage ? (
        <CreateEndpointForm
          operationId={operationIds.create}
          workspaceId={workspaceId}
        />
      ) : (
        <div className="notification-webhook-readonly" role="note">
          <LockKeyhole aria-hidden="true" />
          <span>Owner or admin access is required for lifecycle changes.</span>
        </div>
      )}

      {document.endpoints.length === 0 ? (
        <div className="notification-healthy-state">
          <Webhook aria-hidden="true" />
          <div>
            <strong>No generic webhook is configured</strong>
            <p>SMTP and Klaviyo delivery are unaffected.</p>
          </div>
        </div>
      ) : (
        <div className="notification-webhook-grid">
          {document.endpoints.map((endpoint) => (
            <EndpointCard
              canManage={document.canManage}
              endpoint={endpoint}
              key={endpoint.endpointId}
              operationIds={operationIds.endpoints[endpoint.endpointId]!}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CreateEndpointForm({
  operationId,
  workspaceId,
}: Readonly<{ operationId: string; workspaceId: string }>) {
  const [state, action, pending] = useActionState(
    createWebhookEndpointAction,
    initialState,
  );
  return (
    <details className="notification-webhook-create">
      <summary>
        <Plus aria-hidden="true" /> Add endpoint
      </summary>
      <form action={action}>
        <input name="operationId" type="hidden" value={operationId} />
        <input name="workspaceId" type="hidden" value={workspaceId} />
        <div className="notification-webhook-fields">
          <label>
            <span>Endpoint name</span>
            <input
              maxLength={120}
              name="label"
              placeholder="Lifecycle automation"
              required
            />
          </label>
          <label>
            <span>HTTPS destination</span>
            <input
              inputMode="url"
              maxLength={2048}
              name="destinationUrl"
              placeholder="https://example.com/webhooks/starfiniti"
              required
              type="url"
            />
          </label>
          <label>
            <span>Requests per minute</span>
            <input
              defaultValue="60"
              max="600"
              min="1"
              name="rateLimitPerMinute"
              required
              type="number"
            />
          </label>
        </div>
        <fieldset className="notification-webhook-events">
          <legend>Subscribed event types</legend>
          {eventTypes.map((eventType) => (
            <label key={eventType}>
              <input
                defaultChecked={eventType === "loyalty.connector.health"}
                name="eventTypes"
                type="checkbox"
                value={eventType}
              />
              <span>{eventType}</span>
            </label>
          ))}
        </fieldset>
        <label className="notification-webhook-confirmation">
          <input name="confirmation" type="checkbox" value="create" />
          <span>
            I reviewed the destination and can securely transfer the one-time
            signing secret.
          </span>
        </label>
        <button
          className="button button-primary"
          disabled={pending}
          type="submit"
        >
          <KeyRound aria-hidden="true" />
          {pending ? "Creating…" : "Create disabled endpoint"}
        </button>
        <ActionNotice state={state} />
      </form>
    </details>
  );
}

function EndpointCard({
  canManage,
  endpoint,
  operationIds,
}: Readonly<{
  canManage: boolean;
  endpoint: NotificationWebhookEndpointReadV1;
  operationIds: Readonly<{
    disable: string;
    rotate: string;
    retire: string;
  }>;
}>) {
  const outstanding =
    BigInt(endpoint.counts.pending) +
    BigInt(endpoint.counts.processing) +
    BigInt(endpoint.counts.retryable) +
    BigInt(endpoint.counts.held);
  const failures =
    BigInt(endpoint.counts.deadLetter) + BigInt(endpoint.counts.manualReview);
  return (
    <article className={`notification-webhook-card is-${endpoint.state}`}>
      <div className="notification-webhook-card-heading">
        <span className="notification-webhook-icon" aria-hidden="true">
          <Webhook />
        </span>
        <div>
          <h3>{endpoint.label}</h3>
          <p>{endpoint.destinationUrl ?? "Live destination removed"}</p>
        </div>
        <span
          className={`ui-badge ${
            endpoint.state === "active"
              ? "ui-badge-success"
              : endpoint.state === "retired"
                ? "ui-badge-neutral"
                : "ui-badge-warning"
          }`}
        >
          {endpoint.state.toUpperCase()}
        </span>
      </div>
      <dl className="notification-webhook-metrics">
        <div>
          <dt>
            <CheckCircle2 aria-hidden="true" /> Completed
          </dt>
          <dd>{endpoint.counts.completed}</dd>
        </div>
        <div>
          <dt>
            <Activity aria-hidden="true" /> Outstanding
          </dt>
          <dd>{outstanding.toString()}</dd>
        </div>
        <div className={failures > 0n ? "is-alert" : ""}>
          <dt>
            <AlertTriangle aria-hidden="true" /> Needs attention
          </dt>
          <dd>{failures.toString()}</dd>
        </div>
      </dl>
      <div className="notification-webhook-evidence">
        <span>
          <KeyRound aria-hidden="true" /> Current key ···
          {endpoint.currentSecretHint ?? "removed"}
        </span>
        <span>
          <Clock3 aria-hidden="true" /> Last attempt{" "}
          {formatDate(endpoint.lastAttemptAt)}
        </span>
        <span>{endpoint.eventTypes.length} subscribed event types</span>
        <span>{endpoint.rateLimitPerMinute}/minute database limit</span>
      </div>
      {endpoint.lastErrorCode ? (
        <p className="notification-webhook-error">
          Last canonical error: <code>{endpoint.lastErrorCode}</code>
        </p>
      ) : null}
      {endpoint.state === "disabled" ? (
        <p className="notification-webhook-next-step">
          Awaiting reviewed secret mount and isolated worker activation. No
          event can be authorized in this state.
        </p>
      ) : null}
      {canManage && endpoint.state !== "retired" ? (
        <div className="notification-webhook-actions">
          {endpoint.state === "active" ? (
            <LifecycleForm
              action="disable"
              endpointId={endpoint.endpointId}
              operationId={operationIds.disable}
            />
          ) : (
            <>
              <RotateForm
                endpointId={endpoint.endpointId}
                operationId={operationIds.rotate}
              />
              <LifecycleForm
                action="retire"
                endpointId={endpoint.endpointId}
                operationId={operationIds.retire}
              />
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function RotateForm({
  endpointId,
  operationId,
}: Readonly<{ endpointId: string; operationId: string }>) {
  const [state, action, pending] = useActionState(
    rotateWebhookEndpointAction,
    initialState,
  );
  return (
    <details>
      <summary>
        <RotateCw aria-hidden="true" /> Rotate key
      </summary>
      <form action={action}>
        <input name="endpointId" type="hidden" value={endpointId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          <span>Prior-key overlap (seconds)</span>
          <input
            defaultValue="3600"
            max="86400"
            min="0"
            name="overlapSeconds"
            required
            type="number"
          />
        </label>
        <label className="notification-webhook-confirmation">
          <input name="confirmation" type="checkbox" value="rotate" />
          <span>I can copy and mount the one-time replacement secret now.</span>
        </label>
        <button className="button" disabled={pending} type="submit">
          {pending ? "Rotating…" : "Rotate while disabled"}
        </button>
        <ActionNotice state={state} />
      </form>
    </details>
  );
}

function LifecycleForm({
  action: lifecycleAction,
  endpointId,
  operationId,
}: Readonly<{
  action: "disable" | "retire";
  endpointId: string;
  operationId: string;
}>) {
  const [state, action, pending] = useActionState(
    changeWebhookEndpointStateAction,
    initialState,
  );
  const destructive = lifecycleAction === "retire";
  return (
    <details>
      <summary className={destructive ? "is-destructive" : ""}>
        {destructive ? (
          <Trash2 aria-hidden="true" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
        {destructive ? "Retire" : "Disable"}
      </summary>
      <form action={action}>
        <input name="action" type="hidden" value={lifecycleAction} />
        <input name="endpointId" type="hidden" value={endpointId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          <span>Reason</span>
          <input maxLength={200} name="reason" required />
        </label>
        <label className="notification-webhook-confirmation">
          <input name="confirmation" type="checkbox" value={lifecycleAction} />
          <span>
            {destructive
              ? "I understand retirement is final and removes the live destination."
              : "I understand no new delivery will be authorized."}
          </span>
        </label>
        <button
          className={destructive ? "button button-danger" : "button"}
          disabled={pending}
          type="submit"
        >
          {pending
            ? `${destructive ? "Retiring" : "Disabling"}…`
            : `${destructive ? "Retire" : "Disable"} endpoint`}
        </button>
        <ActionNotice state={state} />
      </form>
    </details>
  );
}

function ActionNotice({ state }: Readonly<{ state: WebhookActionState }>) {
  const [copied, setCopied] = useState(false);
  if (state.kind === "idle") return null;
  return (
    <div
      className={`notification-webhook-notice is-${state.kind}`}
      role={state.kind === "error" ? "alert" : "status"}
    >
      <p>{state.message}</p>
      {state.secret ? (
        <div className="notification-webhook-secret">
          <code>{state.secret}</code>
          <button
            className="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.secret!);
              setCopied(true);
            }}
            type="button"
          >
            <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy once"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "not yet recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
