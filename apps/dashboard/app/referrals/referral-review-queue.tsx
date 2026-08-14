"use client";

import type {
  ReferralReviewCaseV1,
  ReferralRiskCodeV1,
} from "@starfiniti/contracts";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useActionState } from "react";
import {
  resolveReferralReview,
  retryReferralReward,
  type ReferralReviewActionState,
} from "./actions";

const idle: ReferralReviewActionState = { kind: "idle", message: "" };

type ReviewOperation = Readonly<{
  reviewId: string;
  operationId: string;
}>;

const riskLabels: Readonly<Record<ReferralRiskCodeV1, string>> = {
  self_referral: "Self-referral",
  advocate_monthly_limit: "Advocate monthly limit",
  source_network_velocity: "Network velocity",
  device_velocity: "Device velocity",
  reused_payment_evidence: "Reused payment evidence",
  reused_shipping_evidence: "Reused shipping evidence",
};

function dateLabel(value: string | null): string {
  if (!value) return "Not qualified yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

function RiskReviewCard({
  item,
  operationId,
  canOperate,
}: Readonly<{
  item: Extract<ReferralReviewCaseV1, { kind: "risk" }>;
  operationId: string;
  canOperate: boolean;
}>) {
  const [state, action, pending] = useActionState(resolveReferralReview, idle);
  return (
    <article className="referral-review-card risk">
      <header>
        <span className="referral-review-icon" aria-hidden="true">
          <ShieldAlert />
        </span>
        <div>
          <span className="ui-badge ui-badge-warning">Risk review</span>
          <h3>{item.friendReference}</h3>
          <p>Referred by {item.advocateReference}</p>
        </div>
      </header>

      <dl className="referral-review-meta">
        <div>
          <dt>WooCommerce order</dt>
          <dd>{item.sourceOrderReference}</dd>
        </div>
        <div>
          <dt>Qualification</dt>
          <dd>
            {item.qualificationDecision === "review_held"
              ? "Eligible · held for review"
              : "Waiting for qualifying status"}
          </dd>
        </div>
        <div>
          <dt>Cooling ends</dt>
          <dd>{dateLabel(item.coolingEndsAt)}</dd>
        </div>
      </dl>

      <div className="referral-risk-codes" aria-label="Risk reasons">
        {item.riskCodes.map((code) => (
          <span className="ui-badge ui-badge-neutral" key={code}>
            {riskLabels[code]}
          </span>
        ))}
      </div>

      {canOperate ? (
        <form action={action} className="referral-review-form">
          <input
            name="attributionId"
            type="hidden"
            value={item.attributionId}
          />
          <input name="operationId" type="hidden" value={operationId} />
          <label>
            <span>Decision reason</span>
            <textarea
              maxLength={1000}
              minLength={8}
              name="reason"
              placeholder="Record the evidence used for this decision"
              required
              rows={3}
            />
          </label>
          <div className="referral-review-actions">
            <button
              className="ui-button ui-button-primary"
              disabled={pending}
              name="resolution"
              type="submit"
              value="approved"
            >
              <CheckCircle2 aria-hidden="true" /> Approve
            </button>
            <button
              className="ui-button ui-button-danger"
              disabled={pending}
              name="resolution"
              type="submit"
              value="rejected"
            >
              <XCircle aria-hidden="true" /> Reject
            </button>
          </div>
          <p className="referral-value-note">
            This decision moves no points. Approved referrals still pass the
            historical qualification, cooling, and atomic reward lifecycle.
          </p>
          <p aria-live="polite" className={`action-message ${state.kind}`}>
            {state.message}
          </p>
        </form>
      ) : (
        <p className="referral-read-only-note">
          Your role can inspect this case. An owner, admin, or operator must
          record the decision.
        </p>
      )}
    </article>
  );
}

function RewardReviewCard({
  item,
  operationId,
  canOperate,
}: Readonly<{
  item: Extract<ReferralReviewCaseV1, { kind: "reward" }>;
  operationId: string;
  canOperate: boolean;
}>) {
  const [state, action, pending] = useActionState(retryReferralReward, idle);
  return (
    <article className="referral-review-card reward">
      <header>
        <span className="referral-review-icon" aria-hidden="true">
          <RotateCcw />
        </span>
        <div>
          <span className="ui-badge ui-badge-danger">Recovery review</span>
          <h3>{item.friendReference}</h3>
          <p>Referred by {item.advocateReference}</p>
        </div>
      </header>

      <dl className="referral-review-meta">
        <div>
          <dt>Attempts</dt>
          <dd>{item.attemptCount} of 50</dd>
        </div>
        <div>
          <dt>Reviewed cycle</dt>
          <dd>{item.reviewCycle} of 4</dd>
        </div>
        <div>
          <dt>Diagnostic</dt>
          <dd>{item.errorCode.replaceAll("_", " ")}</dd>
        </div>
      </dl>

      {canOperate ? (
        <form action={action} className="referral-review-form">
          <input name="jobId" type="hidden" value={item.reviewId} />
          <input name="operationId" type="hidden" value={operationId} />
          <label>
            <span>Recovery reason</span>
            <textarea
              maxLength={1000}
              minLength={8}
              name="reason"
              placeholder="Describe the remediation completed before retry"
              required
              rows={3}
            />
          </label>
          <button
            className="ui-button ui-button-secondary"
            disabled={pending || item.reviewCycle >= 4}
            type="submit"
          >
            <RefreshCw aria-hidden="true" /> Retry bounded cycle
          </button>
          <p className="referral-value-note">
            Issuance is atomic: either both point awards committed or neither
            did. This action permits one more ten-attempt internal cycle.
          </p>
          <p aria-live="polite" className={`action-message ${state.kind}`}>
            {state.message}
          </p>
        </form>
      ) : (
        <p className="referral-read-only-note">
          Your role can inspect diagnostics but cannot restart value processing.
        </p>
      )}
    </article>
  );
}

export function ReferralReviewQueue({
  cases,
  operations,
  canOperate,
}: Readonly<{
  cases: readonly ReferralReviewCaseV1[];
  operations: readonly ReviewOperation[];
  canOperate: boolean;
}>) {
  const operationMap = new Map(
    operations.map((item) => [item.reviewId, item.operationId]),
  );
  const riskCount = cases.filter((item) => item.kind === "risk").length;
  const rewardCount = cases.filter((item) => item.kind === "reward").length;
  return (
    <>
      <section className="referral-summary-grid" aria-label="Review summary">
        <div>
          <ShieldAlert aria-hidden="true" />
          <span>Risk holds</span>
          <strong>{riskCount}</strong>
          <small>Value-neutral decisions</small>
        </div>
        <div>
          <RefreshCw aria-hidden="true" />
          <span>Reward recoveries</span>
          <strong>{rewardCount}</strong>
          <small>Atomic internal jobs</small>
        </div>
        <div>
          <Clock3 aria-hidden="true" />
          <span>Oldest case</span>
          <strong>
            {cases.length === 0 ? "—" : dateLabel(cases[0]!.createdAt)}
          </strong>
          <small>Europe/Ljubljana</small>
        </div>
      </section>

      <section
        className="referral-review-panel"
        aria-labelledby="referral-review-title"
      >
        <div className="referral-panel-heading">
          <div>
            <p className="login-eyebrow">Protected review queue</p>
            <h2 id="referral-review-title">Cases needing attention</h2>
            <p>
              Fingerprint values stay private. Reviewers see only allowlisted
              risk reasons and bounded internal diagnostics.
            </p>
          </div>
          <span className="ui-badge ui-badge-violet">{cases.length} open</span>
        </div>

        {cases.length === 0 ? (
          <div className="referral-empty-state">
            <UserRoundCheck aria-hidden="true" />
            <h3>No referral cases need attention</h3>
            <p>
              Uncertain attribution and exhausted atomic reward jobs will appear
              here without exposing private fraud fingerprints.
            </p>
          </div>
        ) : (
          <div className="referral-review-list">
            {cases.map((item) => {
              const operationId = operationMap.get(item.reviewId);
              if (!operationId) return null;
              return item.kind === "risk" ? (
                <RiskReviewCard
                  canOperate={canOperate}
                  item={item}
                  key={item.reviewId}
                  operationId={operationId}
                />
              ) : (
                <RewardReviewCard
                  canOperate={canOperate}
                  item={item}
                  key={item.reviewId}
                  operationId={operationId}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
