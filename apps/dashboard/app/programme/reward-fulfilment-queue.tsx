"use client";

import type {
  RewardFulfilmentCaseV1,
  RewardFulfilmentSummaryV1,
} from "@starfiniti/contracts";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  PackageCheck,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  resolveRewardFulfilment,
  startRewardFulfilment,
  type RewardFulfilmentActionState,
} from "./reward-fulfilment-actions";

const idle: RewardFulfilmentActionState = { kind: "idle", message: "" };

type CaseOperations = Readonly<{
  caseId: string;
  startOperationId: string;
  resolveOperationId: string;
}>;

function statusLabel(state: RewardFulfilmentCaseV1["state"]): string {
  return {
    pending: "Pending",
    in_progress: "In progress",
    fulfilled: "Fulfilled",
    rejected: "Rejected",
  }[state];
}

function dueLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

function FulfilmentCaseCard({
  item,
  operations,
  canOperate,
  asOf,
}: Readonly<{
  item: RewardFulfilmentCaseV1;
  operations: CaseOperations;
  canOperate: boolean;
  asOf: string;
}>) {
  const [startState, startAction, starting] = useActionState(
    startRewardFulfilment,
    idle,
  );
  const [resolveState, resolveAction, resolving] = useActionState(
    resolveRewardFulfilment,
    idle,
  );
  const overdue =
    ["pending", "in_progress"].includes(item.state) &&
    new Date(item.dueAt).getTime() < new Date(asOf).getTime();

  return (
    <article className="fulfilment-case-card">
      <header>
        <div className="fulfilment-case-icon" aria-hidden="true">
          {item.state === "fulfilled" ? (
            <PackageCheck />
          ) : item.state === "rejected" ? (
            <RotateCcw />
          ) : overdue ? (
            <CircleAlert />
          ) : (
            <Clock3 />
          )}
        </div>
        <div className="fulfilment-case-heading">
          <div>
            <strong>{item.rewardName}</strong>
            <span>{item.costPoints} points reserved</span>
          </div>
          <span className={`ui-badge fulfilment-status ${item.state}`}>
            {statusLabel(item.state)}
          </span>
        </div>
      </header>

      <div className="fulfilment-case-meta">
        <div>
          <span>Member</span>
          <Link href={`/customers/${item.customerId}`}>
            {item.customerReference} <ExternalLink aria-hidden="true" />
          </Link>
        </div>
        <div>
          <span>{overdue ? "Overdue since" : "Due"}</span>
          <strong className={overdue ? "is-overdue" : undefined}>
            {dueLabel(item.dueAt)}
          </strong>
        </div>
        <div>
          <span>Reward code</span>
          <code>{item.rewardCode}</code>
        </div>
      </div>

      <div className="fulfilment-instructions">
        <ShieldCheck aria-hidden="true" />
        <div>
          <span>Reviewed fulfilment instructions</span>
          <p>{item.instructions}</p>
        </div>
      </div>

      {item.state === "pending" && canOperate ? (
        <form action={startAction} className="fulfilment-case-actions">
          <input name="caseId" type="hidden" value={item.caseId} />
          <input
            name="operationId"
            type="hidden"
            value={operations.startOperationId}
          />
          <p>
            Starting a case does not move points. It marks the benefit as being
            worked and keeps the reservation intact.
          </p>
          <button
            className="ui-button ui-button-secondary"
            disabled={starting}
            type="submit"
          >
            <Play aria-hidden="true" />
            {starting ? "Starting…" : "Start fulfilment"}
          </button>
          <p aria-live="polite" className={`action-message ${startState.kind}`}>
            {startState.message}
          </p>
        </form>
      ) : null}

      {item.state === "in_progress" && canOperate ? (
        <form action={resolveAction} className="fulfilment-resolution-form">
          <input name="caseId" type="hidden" value={item.caseId} />
          <input
            name="operationId"
            type="hidden"
            value={operations.resolveOperationId}
          />
          <label>
            <span>Delivery reference</span>
            <input
              maxLength={500}
              name="resultReference"
              placeholder="Example: store-case:1842"
            />
            <small>Required only when confirming delivery.</small>
          </label>
          <label>
            <span>Decision note</span>
            <textarea
              maxLength={1000}
              name="reason"
              placeholder="Required when rejecting; optional fulfilment context"
              rows={3}
            />
          </label>
          <div className="fulfilment-resolution-buttons">
            <button
              className="ui-button ui-button-primary"
              disabled={resolving}
              name="resolution"
              type="submit"
              value="fulfilled"
            >
              <CheckCircle2 aria-hidden="true" /> Confirm fulfilled
            </button>
            <button
              className="ui-button ui-button-danger"
              disabled={resolving}
              name="resolution"
              type="submit"
              value="rejected"
            >
              <RotateCcw aria-hidden="true" /> Reject and return points
            </button>
          </div>
          <p className="fulfilment-resolution-warning">
            Confirm only after delivery. Reject only when you know no benefit
            was delivered. Uncertainty must remain in progress.
          </p>
          <p
            aria-live="polite"
            className={`action-message ${resolveState.kind}`}
          >
            {resolveState.message}
          </p>
        </form>
      ) : null}

      {item.state === "fulfilled" && item.resultReference ? (
        <div className="fulfilment-terminal-note success">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>Value captured</strong>
            <span>Delivery reference: {item.resultReference}</span>
          </div>
        </div>
      ) : null}
      {item.state === "rejected" ? (
        <div className="fulfilment-terminal-note neutral">
          <RotateCcw aria-hidden="true" />
          <div>
            <strong>Reservation released</strong>
            <span>
              The member&apos;s points and reward capacity were returned.
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function RewardFulfilmentQueue({
  cases,
  summary,
  operations,
  canOperate,
  asOf,
}: Readonly<{
  cases: readonly RewardFulfilmentCaseV1[];
  summary: RewardFulfilmentSummaryV1;
  operations: readonly CaseOperations[];
  canOperate: boolean;
  asOf: string;
}>) {
  const operationMap = new Map(operations.map((item) => [item.caseId, item]));
  return (
    <section
      aria-labelledby="manual-fulfilment-title"
      className="programme-fulfilment-section"
    >
      <div className="programme-workflow-header fulfilment-section-heading">
        <div>
          <span className="programme-workflow-kicker">
            <PackageCheck aria-hidden="true" /> Store-delivered benefits
          </span>
          <h2 id="manual-fulfilment-title">Manual fulfilment queue</h2>
          <p>
            Exclusive access and custom perks stay reserved until an operator
            records a definitive delivery or rejection.
          </p>
        </div>
      </div>

      <div className="fulfilment-summary-grid" aria-label="Queue summary">
        <div>
          <span>Pending</span>
          <strong>{summary.pending}</strong>
        </div>
        <div>
          <span>In progress</span>
          <strong>{summary.inProgress}</strong>
        </div>
        <div className={summary.overdue > 0 ? "has-alert" : undefined}>
          <span>Overdue</span>
          <strong>{summary.overdue}</strong>
        </div>
        <div>
          <span>Fulfilled · 30 days</span>
          <strong>{summary.fulfilled30d}</strong>
        </div>
        <div>
          <span>Rejected · 30 days</span>
          <strong>{summary.rejected30d}</strong>
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="reward-empty-state fulfilment-empty-state">
          <div className="reward-empty-icon" aria-hidden="true">
            <PackageCheck />
          </div>
          <h3>No manual benefits need attention</h3>
          <p>
            New exclusive-access and custom-perk claims will appear here with
            their original instructions and due date.
          </p>
        </div>
      ) : (
        <div className="fulfilment-case-list">
          {cases.map((item) => {
            const itemOperations = operationMap.get(item.caseId);
            return itemOperations ? (
              <FulfilmentCaseCard
                asOf={asOf}
                canOperate={canOperate}
                item={item}
                key={item.caseId}
                operations={itemOperations}
              />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}
