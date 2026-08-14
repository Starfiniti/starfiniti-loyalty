"use client";

import type {
  CustomerReferralExperienceV1,
  CustomerReferralHistoryItemV1,
} from "@starfiniti/contracts";
import {
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Gift,
  RotateCcw,
  Share2,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  createCustomerReferralLink,
  type CustomerReferralLinkState,
} from "./referral-actions";

const idle: CustomerReferralLinkState = {
  kind: "idle",
  message: "",
  shareUrl: null,
};

function formatPoints(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-GB");
  } catch {
    return "0";
  }
}

function formatMinor(
  value: string,
  currencyCode: string,
  digits: number,
): string {
  try {
    const amount = BigInt(value);
    const scale = 10n ** BigInt(digits);
    const major = amount / scale;
    const minor = (amount % scale).toString().padStart(digits, "0");
    return `${currencyCode} ${major.toLocaleString("en-GB")}${digits > 0 ? `.${minor}` : ""}`;
  } catch {
    return `${currencyCode} 0`;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

const statePresentation = {
  captured: {
    label: "Waiting for a qualifying purchase",
    detail: "Your friend has not completed the required order yet.",
    icon: Clock3,
    tone: "pending",
  },
  pending_review: {
    label: "Store review",
    detail: "The store is reviewing this referral before value is issued.",
    icon: ShieldCheck,
    tone: "review",
  },
  blocked: {
    label: "Not eligible",
    detail: "This referral did not meet the programme requirements.",
    icon: XCircle,
    tone: "closed",
  },
  cooling: {
    label: "Return period in progress",
    detail: "The purchase qualified. Points follow after the cooling period.",
    icon: Clock3,
    tone: "pending",
  },
  qualified: {
    label: "Reward issued",
    detail: "Referral points were issued through the protected ledger.",
    icon: CheckCircle2,
    tone: "success",
  },
  rejected: {
    label: "Not eligible",
    detail: "This referral did not meet the programme requirements.",
    icon: XCircle,
    tone: "closed",
  },
  reversed: {
    label: "Reversed after refund",
    detail: "The original order was refunded and both rewards were reversed.",
    icon: RotateCcw,
    tone: "closed",
  },
} as const;

function ReferralHistoryRow({
  item,
}: Readonly<{ item: CustomerReferralHistoryItemV1 }>) {
  const presentation = statePresentation[item.state];
  const Icon = presentation.icon;
  return (
    <li className={`member-referral-history-row ${presentation.tone}`}>
      <span className="member-referral-history-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <strong>{presentation.label}</strong>
        <span>{presentation.detail}</span>
        <small>Started {formatDate(item.capturedAt)}</small>
      </div>
      <b>{formatPoints(item.rewardPoints)} points</b>
    </li>
  );
}

export function CustomerReferralPanel({
  experience,
  operationId,
}: Readonly<{
  experience: CustomerReferralExperienceV1;
  operationId: string;
}>) {
  const [state, action, pending] = useActionState(
    createCustomerReferralLink,
    idle,
  );
  const [shareStatus, setShareStatus] = useState("");
  const shareUrl = state.shareUrl ?? experience.shareUrl;

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Referral link copied.");
    } catch {
      setShareStatus("Select and copy the link below.");
    }
  }

  async function shareLink() {
    if (!shareUrl) return;
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "Loyalty referral",
        text: "Join me and earn loyalty points on your first qualifying order.",
        url: shareUrl,
      });
      setShareStatus("Referral link shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("Sharing was unavailable. You can copy the link instead.");
    }
  }

  const programmePaused = experience.sharingState === "paused";
  const advocateDisabled = experience.sharingState === "disabled";
  return (
    <section
      className="member-referral-panel"
      aria-labelledby={`referral-title-${experience.accountId}`}
    >
      <header className="member-referral-heading">
        <span className="member-referral-heading-icon" aria-hidden="true">
          <UserRoundPlus />
        </span>
        <div>
          <p>Give and get</p>
          <h3 id={`referral-title-${experience.accountId}`}>
            Invite friends, earn points
          </h3>
          <span>
            Your friend earns {formatPoints(experience.friendRewardPoints)}
            points and you earn {formatPoints(experience.advocateRewardPoints)}
            points after an eligible first order.
          </span>
        </div>
      </header>

      <div className="member-referral-policy">
        <div>
          <Gift aria-hidden="true" />
          <span>Minimum first order</span>
          <strong>
            {formatMinor(
              experience.minimumEligibleSpendMinor,
              experience.currencyCode,
              experience.currencyMinorUnitDigits,
            )}
          </strong>
        </div>
        <div>
          <Clock3 aria-hidden="true" />
          <span>Return cooling period</span>
          <strong>
            {experience.coolingDays} day
            {experience.coolingDays === 1 ? "" : "s"}
          </strong>
        </div>
      </div>

      {programmePaused || advocateDisabled ? (
        <div className="member-referral-paused" role="status">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>
              {advocateDisabled
                ? "Your referral link is disabled"
                : "New referral sharing is paused"}
            </strong>
            <span>
              Existing progress and history remain available. Previously issued
              points are unchanged.
            </span>
          </div>
        </div>
      ) : shareUrl ? (
        <div className="member-referral-share">
          <label htmlFor={`referral-url-${experience.accountId}`}>
            Your private referral link
          </label>
          <div>
            <input
              id={`referral-url-${experience.accountId}`}
              readOnly
              type="url"
              value={shareUrl}
            />
            <button type="button" onClick={copyLink}>
              <Clipboard aria-hidden="true" /> Copy
            </button>
            <button type="button" onClick={shareLink}>
              <Share2 aria-hidden="true" /> Share
            </button>
          </div>
          <p className="member-referral-safety">
            The link contains an opaque referral code only. It does not expose
            your email, customer number, or loyalty balance.
          </p>
          <p className="member-referral-live" aria-live="polite">
            {shareStatus || state.message}
          </p>
        </div>
      ) : (
        <form action={action} className="member-referral-create">
          <input name="accountId" type="hidden" value={experience.accountId} />
          <input name="operationId" type="hidden" value={operationId} />
          <p>
            Create one private link for this linked store account. You can copy
            or share it anywhere.
          </p>
          <button disabled={pending} type="submit">
            <UserRoundPlus aria-hidden="true" />
            {pending ? "Creating link…" : "Create my referral link"}
          </button>
          <p className={`action-message ${state.kind}`} aria-live="polite">
            {state.message}
          </p>
        </form>
      )}

      <div className="member-referral-counts" aria-label="Referral progress">
        <div>
          <UsersRound aria-hidden="true" />
          <span>Started</span>
          <strong>{formatPoints(experience.counts.total)}</strong>
        </div>
        <div>
          <Clock3 aria-hidden="true" />
          <span>In progress</span>
          <strong>{formatPoints(experience.counts.pending)}</strong>
        </div>
        <div>
          <Check aria-hidden="true" />
          <span>Rewarded</span>
          <strong>{formatPoints(experience.counts.qualified)}</strong>
        </div>
      </div>

      <div className="member-referral-history">
        <div>
          <h4>Referral history</h4>
          <span>Private progress only—friend identities are never shown.</span>
        </div>
        {experience.history.length === 0 ? (
          <p className="member-muted">
            No friends have started a referral yet. Share your private link to
            begin.
          </p>
        ) : (
          <ul>
            {experience.history.map((item) => (
              <ReferralHistoryRow item={item} key={item.referralId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
