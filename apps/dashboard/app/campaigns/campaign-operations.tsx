"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CirclePause,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  StopCircle,
  Users,
} from "lucide-react";
import { useActionState } from "react";
import {
  CAMPAIGN_METRIC_DICTIONARY_V1,
  type CampaignResultV1,
} from "@starfiniti/contracts";
import type {
  MerchantAudience,
  MerchantAudienceVersion,
  MerchantCampaign,
  MerchantCampaignVersion,
} from "@/lib/server/campaigns";
import {
  approveCampaignVersion,
  cancelCampaignVersion,
  createAudienceSnapshot,
  pauseCampaignVersion,
  previewCampaignVersion,
  publishAudienceVersion,
  type CampaignActionState,
} from "./actions";

const idle: CampaignActionState = { kind: "idle", message: "" };

function assignOperationId(event: React.FormEvent<HTMLFormElement>) {
  const input = event.currentTarget.elements.namedItem("operationId");
  if (input instanceof HTMLInputElement) input.value = crypto.randomUUID();
}

function StateMessage({ state }: Readonly<{ state: CampaignActionState }>) {
  if (state.kind === "idle") return null;
  return (
    <p className={`campaign-form-message is-${state.kind}`} role="status">
      {state.message}
    </p>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (["active", "published", "completed"].includes(status)) {
    return "ui-badge-success";
  }
  if (["cancelled", "paused"].includes(status)) return "ui-badge-warning";
  return "ui-badge-neutral";
}

export function AudienceCatalogue({
  audiences,
  canAuthor,
  canSnapshot,
  enabled,
}: Readonly<{
  audiences: readonly MerchantAudience[];
  canAuthor: boolean;
  canSnapshot: boolean;
  enabled: boolean;
}>) {
  return (
    <section className="campaign-panel" id="audience-catalogue">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Audience catalogue</p>
          <h2>Published segments &amp; frozen snapshots</h2>
          <p>
            Campaign approval binds an exact snapshot, so later membership
            changes never rewrite historical eligibility.
          </p>
        </div>
        <span className="campaign-count">{audiences.length} audiences</span>
      </div>
      {audiences.length === 0 ? (
        <div className="campaign-empty-state">
          <Users aria-hidden="true" />
          <h3>No audience versions yet</h3>
          <p>Build the first allowlisted audience above.</p>
        </div>
      ) : (
        <div className="campaign-catalogue-grid">
          {audiences.map((audience) => (
            <article className="campaign-catalogue-card" key={audience.id}>
              <div className="campaign-card-title">
                <div>
                  <strong>
                    {audience.versions[0]?.definition.name ?? audience.code}
                  </strong>
                  <code>{audience.code}</code>
                </div>
                <span className="campaign-count">
                  {audience.snapshots.length} snapshots
                </span>
              </div>
              <div className="campaign-version-stack">
                {audience.versions.map((version) => (
                  <AudienceVersionRow
                    canAuthor={canAuthor}
                    canSnapshot={canSnapshot}
                    enabled={enabled}
                    key={version.id}
                    snapshotCount={
                      audience.snapshots.filter(
                        (snapshot) => snapshot.audienceVersionId === version.id,
                      ).length
                    }
                    version={version}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AudienceVersionRow({
  canAuthor,
  canSnapshot,
  enabled,
  snapshotCount,
  version,
}: Readonly<{
  canAuthor: boolean;
  canSnapshot: boolean;
  enabled: boolean;
  snapshotCount: number;
  version: MerchantAudienceVersion;
}>) {
  const [publishState, publishAction, publishPending] = useActionState(
    publishAudienceVersion,
    idle,
  );
  const [snapshotState, snapshotAction, snapshotPending] = useActionState(
    createAudienceSnapshot,
    idle,
  );
  return (
    <div className="campaign-version-row">
      <div>
        <span className={`ui-badge ${statusClass(version.status)}`}>
          {version.status}
        </span>
        <strong>Version {version.versionNumber}</strong>
        <small>{version.definition.conditions.length} conditions</small>
        <small>{snapshotCount} snapshots</small>
      </div>
      {version.status === "draft" ? (
        <form action={publishAction} onSubmit={assignOperationId}>
          <input name="operationId" type="hidden" />
          <input name="audienceVersionId" type="hidden" value={version.id} />
          <input
            name="definitionSha256"
            type="hidden"
            value={version.definitionSha256}
          />
          <input name="confirmation" type="hidden" value="publish" />
          <button
            className="ui-button ui-button-secondary"
            disabled={!enabled || !canAuthor || publishPending}
            type="submit"
          >
            <CheckCircle2 aria-hidden="true" />
            {publishPending ? "Publishing…" : "Publish exact version"}
          </button>
          <StateMessage state={publishState} />
        </form>
      ) : null}
      {version.status === "published" ? (
        <form action={snapshotAction} onSubmit={assignOperationId}>
          <input name="operationId" type="hidden" />
          <input name="audienceVersionId" type="hidden" value={version.id} />
          <button
            className="ui-button ui-button-secondary"
            disabled={!enabled || !canSnapshot || snapshotPending}
            type="submit"
          >
            <RefreshCw aria-hidden="true" />
            {snapshotPending ? "Freezing…" : "Create current snapshot"}
          </button>
          <StateMessage state={snapshotState} />
        </form>
      ) : null}
    </div>
  );
}

export function CampaignCalendar({
  campaigns,
}: Readonly<{ campaigns: readonly MerchantCampaign[] }>) {
  const versions = campaigns
    .flatMap((campaign) =>
      campaign.versions.map((version) => ({ campaign, version })),
    )
    .sort(
      (left, right) =>
        Date.parse(left.version.definition.schedule.startsAt) -
        Date.parse(right.version.definition.schedule.startsAt),
    );
  const buckets = new Map<string, typeof versions>();
  for (const entry of versions) {
    const key = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: entry.version.definition.schedule.timezone,
    }).format(new Date(entry.version.definition.schedule.startsAt));
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }
  return (
    <section className="campaign-panel" id="campaign-calendar">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Campaign calendar</p>
          <h2>Schedules &amp; lifecycle</h2>
          <p>
            Review local-time evidence and accepted state without opening the
            builder.
          </p>
        </div>
        <CalendarDays aria-hidden="true" />
      </div>
      {versions.length === 0 ? (
        <div className="campaign-empty-state">
          <CalendarDays aria-hidden="true" />
          <h3>No campaign schedule yet</h3>
          <p>Create an immutable campaign draft to begin.</p>
        </div>
      ) : (
        <div className="campaign-calendar-list">
          {[...buckets.entries()].map(([month, entries]) => (
            <div className="campaign-calendar-month" key={month}>
              <h3>{month}</h3>
              <div>
                {entries.map(({ campaign, version }) => (
                  <article key={version.id}>
                    <span className="campaign-calendar-marker" />
                    <div>
                      <strong>{version.definition.name}</strong>
                      <small>
                        {version.definition.behavior.kind.replaceAll("_", " ")}{" "}
                        · v{version.versionNumber} · {campaign.code}
                      </small>
                    </div>
                    <time dateTime={version.definition.schedule.startsAt}>
                      {formatDate(version.definition.schedule.startsAt)}
                    </time>
                    <span className={`ui-badge ${statusClass(version.status)}`}>
                      {version.status}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CampaignCatalogue({
  campaigns,
  canApprove,
  canCancel,
  canPause,
  canPreview,
  enabled,
}: Readonly<{
  campaigns: readonly MerchantCampaign[];
  canApprove: boolean;
  canCancel: boolean;
  canPause: boolean;
  canPreview: boolean;
  enabled: boolean;
}>) {
  return (
    <section className="campaign-panel" id="campaign-operations">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Review &amp; operations</p>
          <h2>Preview, approve, pause or cancel</h2>
          <p>
            Approval freezes assignment and budget evidence. Pause and cancel
            remain available for accepted work even when rollout is disabled.
          </p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>
      {campaigns.length === 0 ? (
        <div className="campaign-empty-state">
          <PlayCircle aria-hidden="true" />
          <h3>No campaign versions yet</h3>
          <p>Save the first campaign draft above.</p>
        </div>
      ) : (
        <div className="campaign-operation-list">
          {campaigns.flatMap((campaign) =>
            campaign.versions.map((version) => (
              <CampaignVersionCard
                canApprove={canApprove}
                canCancel={canCancel}
                canPause={canPause}
                canPreview={canPreview}
                enabled={enabled}
                key={version.id}
                version={version}
              />
            )),
          )}
        </div>
      )}
    </section>
  );
}

function CampaignVersionCard({
  canApprove,
  canCancel,
  canPause,
  canPreview,
  enabled,
  version,
}: Readonly<{
  canApprove: boolean;
  canCancel: boolean;
  canPause: boolean;
  canPreview: boolean;
  enabled: boolean;
  version: MerchantCampaignVersion;
}>) {
  const [previewState, previewAction, previewPending] = useActionState(
    previewCampaignVersion,
    idle,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveCampaignVersion,
    idle,
  );
  const [pauseState, pauseAction, pausePending] = useActionState(
    pauseCampaignVersion,
    idle,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelCampaignVersion,
    idle,
  );
  const canPauseState = ["scheduled", "active"].includes(version.status);
  const canCancelState = ["scheduled", "active", "paused"].includes(
    version.status,
  );
  return (
    <article className="campaign-operation-card">
      <div className="campaign-card-title">
        <div>
          <span className={`ui-badge ${statusClass(version.status)}`}>
            {version.status}
          </span>
          <strong>{version.definition.name}</strong>
          <small>Version {version.versionNumber}</small>
        </div>
        <code>{version.definitionSha256.slice(0, 12)}…</code>
      </div>
      <dl className="campaign-operation-meta">
        <div>
          <dt>Behavior</dt>
          <dd>{version.definition.behavior.kind.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>{formatDate(version.definition.schedule.startsAt)}</dd>
        </div>
        <div>
          <dt>Global cap</dt>
          <dd>{version.definition.capacity.globalEffectLimit} effects</dd>
        </div>
        <div>
          <dt>Control</dt>
          <dd>{version.definition.controlBasisPoints / 100}%</dd>
        </div>
      </dl>
      {version.status === "draft" ? (
        <div className="campaign-operation-actions">
          <form action={previewAction} onSubmit={assignOperationId}>
            <VersionIdentity version={version} />
            <button
              className="ui-button ui-button-secondary"
              disabled={!enabled || !canPreview || previewPending}
              type="submit"
            >
              <BarChart3 aria-hidden="true" />
              {previewPending ? "Calculating…" : "Preview audience & liability"}
            </button>
          </form>
          {previewState.preview ? (
            <form action={approveAction} onSubmit={assignOperationId}>
              <VersionIdentity version={version} />
              <label className="campaign-approval-confirm">
                <input
                  name="confirmation"
                  required
                  type="checkbox"
                  value="approve"
                />
                <span>
                  I confirm this frozen audience and maximum liability
                </span>
              </label>
              <button
                className="ui-button ui-button-primary"
                disabled={!enabled || !canApprove || approvePending}
                type="submit"
              >
                <CheckCircle2 aria-hidden="true" />
                {approvePending ? "Approving…" : "Approve & schedule"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      {previewState.preview ? (
        <dl className="campaign-preview-grid">
          <div>
            <dt>Eligible</dt>
            <dd>{previewState.preview.eligibleMembers}</dd>
          </div>
          <div>
            <dt>Treatment</dt>
            <dd>{previewState.preview.expectedTreatmentMembers}</dd>
          </div>
          <div>
            <dt>Treatment / control</dt>
            <dd>
              {previewState.preview.expectedTreatmentMembers} /{" "}
              {previewState.preview.expectedControlMembers}
            </dd>
          </div>
          <div>
            <dt>Maximum points</dt>
            <dd>{previewState.preview.maximumPoints ?? "Not applicable"}</dd>
          </div>
          <div>
            <dt>Maximum liability (minor)</dt>
            <dd>
              {previewState.preview.maximumLiabilityMinor ?? "Not applicable"}
            </dd>
          </div>
        </dl>
      ) : null}
      <StateMessage state={previewState} />
      <StateMessage state={approveState} />
      {canPauseState || canCancelState ? (
        <div className="campaign-state-actions">
          {canPauseState ? (
            <form action={pauseAction} onSubmit={assignOperationId}>
              <input name="operationId" type="hidden" />
              <input
                name="campaignVersionId"
                type="hidden"
                value={version.id}
              />
              <label>
                <span>Operational reason</span>
                <input
                  maxLength={1000}
                  minLength={8}
                  name="reason"
                  placeholder="Pause while reviewing campaign health"
                  required
                />
              </label>
              <button
                className="ui-button ui-button-secondary"
                disabled={!canPause || pausePending}
                type="submit"
              >
                <CirclePause aria-hidden="true" />
                {pausePending ? "Pausing…" : "Pause"}
              </button>
            </form>
          ) : null}
          {canCancelState ? (
            <form action={cancelAction} onSubmit={assignOperationId}>
              <input name="operationId" type="hidden" />
              <input
                name="campaignVersionId"
                type="hidden"
                value={version.id}
              />
              <label>
                <span>Cancellation reason</span>
                <input
                  maxLength={1000}
                  minLength={8}
                  name="reason"
                  placeholder="Cancel after approved owner review"
                  required
                />
              </label>
              <button
                className="ui-button ui-button-danger"
                disabled={!canCancel || cancelPending}
                type="submit"
              >
                <StopCircle aria-hidden="true" />
                {cancelPending ? "Cancelling…" : "Cancel"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      <StateMessage state={pauseState} />
      <StateMessage state={cancelState} />
    </article>
  );
}

function VersionIdentity({
  version,
}: Readonly<{ version: MerchantCampaignVersion }>) {
  return (
    <>
      <input name="operationId" type="hidden" />
      <input name="campaignVersionId" type="hidden" value={version.id} />
      <input
        name="definitionSha256"
        type="hidden"
        value={version.definitionSha256}
      />
    </>
  );
}

export function CampaignResults({
  available,
  results,
}: Readonly<{
  available: boolean;
  results: readonly CampaignResultV1[];
}>) {
  const totals = results.reduce(
    (current, result) => ({
      eligible: current.eligible + BigInt(result.assignments.eligible),
      effects: current.effects + BigInt(result.capacity.committedEffects),
      points: current.points + BigInt(result.capacity.committedPoints),
      reviews: current.reviews + BigInt(result.triggerJobs.manualReview),
    }),
    { eligible: 0n, effects: 0n, points: 0n, reviews: 0n },
  );
  return (
    <section className="campaign-panel" id="campaign-results">
      <div className="campaign-panel-heading">
        <div>
          <p className="login-eyebrow">Canonical results</p>
          <h2>Performance, liability &amp; health</h2>
          <p>
            Directly attributed campaign outcomes reconcile to protected facts.
            They are influenced results, not experimentally measured incremental
            lift.
          </p>
        </div>
        <BarChart3 aria-hidden="true" />
      </div>
      {!available ? (
        <div className="campaign-read-warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Results temporarily unavailable</strong>
            <p>Accepted schedules and loyalty value remain unaffected.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="campaign-result-summary">
            <ResultStat label="Eligible assignments" value={totals.eligible} />
            <ResultStat label="Committed effects" value={totals.effects} />
            <ResultStat label="Committed points" value={totals.points} />
            <ResultStat
              alert={totals.reviews > 0n}
              label="Manual review"
              value={totals.reviews}
            />
          </div>
          {results.length === 0 ? (
            <div className="campaign-empty-state">
              <BarChart3 aria-hidden="true" />
              <h3>No campaign outcomes yet</h3>
              <p>
                Drafts and accepted schedules will appear here with zeroed
                facts.
              </p>
            </div>
          ) : (
            <div className="campaign-results-table-wrap">
              <table className="campaign-results-table">
                <caption>Exact campaign version outcomes</caption>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th>Committed</th>
                    <th>Points</th>
                    <th>Liability (minor)</th>
                    <th>Review</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.campaignVersionId}>
                      <th scope="row">
                        {result.campaignName}
                        <small>
                          v{result.versionNumber} · {result.campaignCode}
                        </small>
                      </th>
                      <td>
                        <span
                          className={`ui-badge ${statusClass(result.status)}`}
                        >
                          {result.status}
                        </span>
                      </td>
                      <td>{result.assignments.eligible}</td>
                      <td>{result.capacity.committedEffects}</td>
                      <td>{result.capacity.committedPoints}</td>
                      <td>{result.capacity.committedLiabilityMinor}</td>
                      <td>{result.triggerJobs.manualReview}</td>
                      <td>
                        <CampaignResultEvidence result={result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="campaign-metric-dictionary">
            <summary>Metric definitions &amp; canonical sources</summary>
            <div>
              {CAMPAIGN_METRIC_DICTIONARY_V1.map((metric) => (
                <article key={metric.key}>
                  <strong>{metric.label}</strong>
                  <span className="ui-badge ui-badge-neutral">
                    {metric.classification}
                  </span>
                  <p>{metric.definition}</p>
                  <code>{metric.canonicalSource}</code>
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function CampaignResultEvidence({
  result,
}: Readonly<{ result: CampaignResultV1 }>) {
  return (
    <details className="campaign-result-evidence">
      <summary>Inspect exact outcomes</summary>
      <div>
        <EvidenceGroup
          items={[
            ["Reserved effects", result.capacity.reservedEffects],
            ["Reserved points", result.capacity.reservedPoints],
            ["Reserved liability", result.capacity.reservedLiabilityMinor],
            ["Effect ceiling", result.capacity.globalEffectLimit],
            [
              "Point ceiling",
              result.capacity.maximumPoints ?? "Not applicable",
            ],
            [
              "Liability ceiling",
              result.capacity.maximumLiabilityMinor ?? "Not applicable",
            ],
          ]}
          title="Capacity"
        />
        <EvidenceGroup
          items={[
            ["Purchase awards", result.purchaseOutcomes.awarded],
            ["Fully reversed", result.purchaseOutcomes.reversedAwards],
            ["Control", result.purchaseOutcomes.control],
            ["Capacity exhausted", result.purchaseOutcomes.capacityExhausted],
            ["Suppressed", result.purchaseOutcomes.suppressed],
          ]}
          title="Purchase outcomes"
        />
        <EvidenceGroup
          items={[
            ["Point awards", result.triggerOutcomes.pointsAwarded],
            ["Rewards reserved", result.triggerOutcomes.rewardReserved],
            ["Point reversals", result.triggerOutcomes.pointsReversed],
            [
              "Cancellation requested",
              result.triggerOutcomes.rewardCancellationRequested,
            ],
            ["Already resolved", result.triggerOutcomes.rewardAlreadyResolved],
            ["Non-reversible", result.triggerOutcomes.rewardNonreversible],
            ["Control", result.triggerOutcomes.control],
            ["Capacity exhausted", result.triggerOutcomes.capacityExhausted],
            ["No value to reverse", result.triggerOutcomes.noValueToReverse],
          ]}
          title="Trigger outcomes"
        />
        <EvidenceGroup
          items={[
            ["Pending", result.triggerJobs.pending],
            ["Processing", result.triggerJobs.processing],
            ["Retryable", result.triggerJobs.retryable],
            ["Completed", result.triggerJobs.completed],
            ["Cancelled", result.triggerJobs.cancelled],
            ["Manual review", result.triggerJobs.manualReview],
          ]}
          title="Trigger queue"
        />
      </div>
    </details>
  );
}

function EvidenceGroup({
  items,
  title,
}: Readonly<{
  items: readonly (readonly [label: string, value: string])[];
  title: string;
}>) {
  return (
    <section>
      <h3>{title}</h3>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ResultStat({
  alert = false,
  label,
  value,
}: Readonly<{ alert?: boolean; label: string; value: bigint }>) {
  return (
    <div className={alert ? "is-alert" : ""}>
      {alert ? (
        <AlertTriangle aria-hidden="true" />
      ) : (
        <ShieldCheck aria-hidden="true" />
      )}
      <span>{label}</span>
      <strong>{value.toString()}</strong>
    </div>
  );
}
