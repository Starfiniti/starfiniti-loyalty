import type {
  BillingSummaryV2,
  ManagedBillingUsageSummaryV1,
  ManagedBillingPlanOptionV1,
  ManagedBillingCommercialState,
} from "@starfiniti/contracts";
import {
  ArrowRight,
  Ban,
  BarChart3,
  CheckCircle2,
  CloudCog,
  DatabaseZap,
  ExternalLink,
  FileCheck2,
  History,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { randomUUID } from "node:crypto";

type BillingTone = "positive" | "warning" | "restricted" | "neutral";

type BillingPresentation = Readonly<{
  badge: string;
  description: string;
  provider: string;
  title: string;
  tone: BillingTone;
}>;

const stateLabels: Record<ManagedBillingCommercialState, string> = {
  self_hosted: "Self-hosted",
  unconfigured: "Not configured",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  grace: "Grace period",
  suspended: "Growth restricted",
  cancelled: "Cancelled",
  contract_managed: "Contract managed",
};

const stateSourceLabels: Record<BillingSummaryV2["stateSource"], string> = {
  self_hosted: "Local deployment",
  unconfigured: "Awaiting configuration",
  provider: "Provider lifecycle",
  manual_contract: "Approved contract",
};

const restrictionReasonLabels: Record<
  BillingSummaryV2["restrictionReason"],
  string
> = {
  none: "No restriction",
  billing_unconfigured: "Billing is not configured",
  payment_past_due: "Payment is past due",
  grace_expired: "Grace period ended",
  provider_suspended: "Provider suspension",
  provider_cancelled: "Provider cancellation",
};

type BillingRecoveryGuidance = Readonly<{
  description: string;
  steps: readonly string[];
  title: string;
}>;

export function billingRecoveryGuidance(
  summary: BillingSummaryV2,
  canManage: boolean,
  planCount = 0,
): BillingRecoveryGuidance | null {
  if (summary.deploymentMode === "self_hosted") return null;

  if (summary.commercialState === "grace") {
    return {
      title: "Use the grace window to resolve billing",
      description:
        "New setup is still available. Resolve the provider issue before the displayed deadline so growth continues without interruption.",
      steps: canManage
        ? [
            "Open the billing portal below and resolve the outstanding provider action.",
            "Return after the verified webhook updates this page; browser redirects never restore authority.",
          ]
        : [
            "Ask an active organization owner to resolve the outstanding provider action.",
            "Keep operating normally; balances, checkout, refunds, and promised rewards are unaffected.",
          ],
    };
  }

  if (summary.growthConfigurationAllowed) return null;

  if (canManage && !summary.providerLinked && planCount === 0) {
    return {
      title: "Managed plan setup is unavailable",
      description:
        "No reviewed managed plan is published for this tenant. Browser input cannot create billing authority or provider configuration.",
      steps: [
        "Ask the deployment operator to publish an approved plan and provider configuration.",
        "Continue using balances, programme history, reconciliation, exports, checkout, and promised rewards while setup is unavailable.",
      ],
    };
  }

  return {
    title: "Restore new configuration",
    description: canManage
      ? summary.providerLinked
        ? "Resolve the subscription in the billing portal. Commercial access reopens only after verified lifecycle evidence reaches PostgreSQL."
        : "Choose an approved plan below. Commercial access reopens only after verified lifecycle evidence reaches PostgreSQL."
      : "An active organization owner must restore commercial access. Existing configuration and loyalty operations remain available while you wait.",
    steps: canManage
      ? [
          summary.providerLinked
            ? "Open the billing portal below and resolve the subscription state."
            : "Choose an available managed plan below to start secure checkout.",
          "Return after provider verification; a checkout or portal redirect is never treated as authority.",
          "Continue using balances, programme history, reconciliation, exports, checkout, and promised rewards throughout recovery.",
        ]
      : [
          "Contact an active organization owner with the restriction reason shown above.",
          "Continue using balances, programme history, reconciliation, exports, checkout, and promised rewards.",
        ],
  };
}

export function billingProviderControlsPresentation(
  summary: BillingSummaryV2,
  canManage: boolean,
  planCount: number,
): Readonly<{ description: string; title: string }> {
  if (summary.deploymentMode === "self_hosted") {
    return {
      title: "External billing is not required",
      description:
        "This installation keeps commercial control local and never requires Stripe configuration or a remote licence check.",
    };
  }
  if (summary.commercialState === "contract_managed") {
    return {
      title: "Approved enterprise contract",
      description:
        "Effective contract evidence controls commercial access. Self-serve checkout and provider payment settings are not used for this state.",
    };
  }
  if (!canManage) {
    return {
      title: "Owner-managed billing",
      description:
        "Only an active organization owner can open provider payment settings or choose a managed plan.",
    };
  }
  if (summary.providerLinked) {
    return {
      title: "Secure billing portal available",
      description:
        "The owner-only portal can resolve payment or subscription issues. Only a separately verified webhook can change commercial authority.",
    };
  }
  if (planCount > 0) {
    return {
      title: "Secure plan checkout available",
      description:
        "Choose a reviewed plan above to open Stripe Checkout. Returning to this page does not grant access without verified lifecycle evidence.",
    };
  }
  return {
    title: "Billing actions are not configured",
    description:
      "No provider action is exposed until reviewed plans and server-side billing controls are configured for this tenant.",
  };
}

export function billingStatePresentation(
  summary: BillingSummaryV2,
): BillingPresentation {
  if (summary.commercialState === "self_hosted") {
    return {
      badge: stateLabels.self_hosted,
      title: "Self-hosted stays local",
      description:
        "Stripe is neither required nor contacted. Commercial access is controlled locally and loyalty value remains fully available.",
      provider: "Not required",
      tone: "positive",
    };
  }

  if (summary.commercialState === "unconfigured") {
    return {
      badge: stateLabels.unconfigured,
      title: "Managed billing is not configured",
      description:
        "Existing loyalty value and protected operations remain available. New managed growth stays restricted until an authoritative commercial state exists.",
      provider: summary.providerLinked ? "Account linked" : "Not linked",
      tone: "warning",
    };
  }

  if (!summary.growthConfigurationAllowed) {
    const restrictedDescription =
      summary.restrictionReason === "grace_expired"
        ? "The approved grace period has ended. Existing balances, refunds, reconciliation, exports, checkout, and promised rewards remain available."
        : summary.restrictionReason === "payment_past_due"
          ? "Payment is past due and no active grace decision allows new setup. Existing loyalty value and every protected operation remain available."
          : summary.restrictionReason === "provider_cancelled"
            ? "The managed subscription is cancelled. Existing loyalty value and every protected operation remain available while commercial access is recovered."
            : "The provider lifecycle restricts new managed setup. Existing balances, refunds, reconciliation, exports, checkout, and promised rewards remain available.";
    return {
      badge: stateLabels[summary.commercialState],
      title: "New managed growth is restricted",
      description: restrictedDescription,
      provider: "Linked privately",
      tone: "restricted",
    };
  }

  if (summary.commercialState === "grace") {
    return {
      badge: stateLabels.grace,
      title: "Managed billing is in a grace period",
      description:
        "New configuration remains available during grace. Existing loyalty value and every protected operation stay available before and after the deadline.",
      provider: "Linked privately",
      tone: "warning",
    };
  }

  return {
    badge: stateLabels[summary.commercialState],
    title:
      summary.commercialState === "contract_managed"
        ? "Enterprise contract is active"
        : "Managed billing is in good standing",
    description:
      "New configuration is available. The database remains the tenant-scoped authority for commercial access and preserves loyalty value independently.",
    provider:
      summary.commercialState === "contract_managed"
        ? "Contract managed"
        : "Linked privately",
    tone: "positive",
  };
}

const protectedOperations = [
  ["Balance access", "Members can always read their loyalty value."],
  ["Refunds", "Commerce reversals continue to correct the ledger."],
  ["Reconciliation", "Operators can still prove every effect."],
  ["Checkout independence", "WooCommerce never waits for billing or the hub."],
  ["Exports", "Tenant data remains available for retrieval."],
  ["Promised rewards", "Already promised redemptions stay fulfilable."],
] as const;

export function BillingOverview({
  summary,
  usageSummary = null,
  plans = [],
  organizationId = "00000000-0000-4000-8000-000000000000",
  portalOperationId = "00000000-0000-4000-8000-000000000001",
  canManage = false,
  startSessionAction,
}: Readonly<{
  summary: BillingSummaryV2 | null;
  usageSummary?: ManagedBillingUsageSummaryV1 | null;
  plans?: readonly ManagedBillingPlanOptionV1[];
  organizationId?: string;
  portalOperationId?: string;
  canManage?: boolean;
  startSessionAction: (formData: FormData) => Promise<never>;
}>) {
  if (!summary) {
    return (
      <section className="billing-unavailable" role="alert">
        <TriangleAlert aria-hidden="true" />
        <div>
          <p className="login-eyebrow">Commercial administration</p>
          <h1>Billing state unavailable</h1>
          <p>
            The live tenant-scoped projection could not be verified. No
            commercial status or provider information was inferred from the
            browser session.
          </p>
        </div>
      </section>
    );
  }

  const presentation = billingStatePresentation(summary);
  const deploymentIcon =
    summary.deploymentMode === "self_hosted" ? ServerCog : CloudCog;
  const DeploymentIcon = deploymentIcon;
  const recoveryGuidance = billingRecoveryGuidance(
    summary,
    canManage,
    plans.length,
  );
  const providerControls = billingProviderControlsPresentation(
    summary,
    canManage,
    plans.length,
  );

  return (
    <div className="billing-overview">
      <section className="billing-hero">
        <div className="billing-hero-copy">
          <p className="login-eyebrow">Commercial administration</p>
          <h1>Billing &amp; plan</h1>
          <p>
            See the commercial state that controls new managed configuration.
            Billing never changes earned loyalty value or checkout reliability.
          </p>
        </div>
        <span
          className={`billing-state-badge is-${presentation.tone}`}
          data-testid="billing-state"
        >
          <span aria-hidden="true" />
          {presentation.badge}
        </span>
      </section>

      <section className="billing-summary-grid" aria-label="Billing summary">
        <SummaryCard
          icon={DeploymentIcon}
          label="Deployment"
          value={
            summary.deploymentMode === "self_hosted" ? "Self-hosted" : "Managed"
          }
        />
        <SummaryCard
          icon={WalletCards}
          label="Provider"
          value={presentation.provider}
        />
        <SummaryCard
          icon={summary.growthConfigurationAllowed ? CheckCircle2 : Ban}
          label="New configuration"
          value={
            summary.growthConfigurationAllowed ? "Available" : "Restricted"
          }
        />
        <SummaryCard
          icon={FileCheck2}
          label="Authority"
          value={stateSourceLabels[summary.stateSource]}
        />
      </section>

      <section className={`billing-status-panel is-${presentation.tone}`}>
        <span className="billing-panel-icon" aria-hidden="true">
          {summary.growthConfigurationAllowed ? (
            <ShieldCheck />
          ) : (
            <LockKeyhole />
          )}
        </span>
        <div>
          <p className="login-eyebrow">Current state</p>
          <h2>{presentation.title}</h2>
          <p className="billing-state-description">
            {presentation.description}
          </p>
          <dl className="billing-state-facts">
            <div>
              <dt>Decision source</dt>
              <dd>{stateSourceLabels[summary.stateSource]}</dd>
            </div>
            <div>
              <dt>Restriction reason</dt>
              <dd>{restrictionReasonLabels[summary.restrictionReason]}</dd>
            </div>
            {summary.graceEndsAt ? (
              <div>
                <dt>Grace deadline</dt>
                <dd>{formatBillingInstant(summary.graceEndsAt)}</dd>
              </div>
            ) : null}
            {summary.contractEndsAt ? (
              <div>
                <dt>Contract term</dt>
                <dd>Through {formatBillingInstant(summary.contractEndsAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {recoveryGuidance ? (
        <section
          className={`billing-recovery-panel ${summary.growthConfigurationAllowed ? "is-warning" : "is-restricted"}`}
          aria-labelledby="billing-recovery-title"
        >
          <span className="billing-panel-icon" aria-hidden="true">
            {summary.growthConfigurationAllowed ? <History /> : <RefreshCw />}
          </span>
          <div>
            <p className="login-eyebrow">Next step</p>
            <h2 id="billing-recovery-title">{recoveryGuidance.title}</h2>
            <p>{recoveryGuidance.description}</p>
            <ol>
              {recoveryGuidance.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <BillingContinuityPanel />

      <section className="billing-protected-panel">
        <header>
          <div>
            <p className="login-eyebrow">Permanent safeguards</p>
            <h2>Billing cannot block loyalty value</h2>
            <p>
              These paths remain enabled in every commercial state, including
              delinquency, cancellation, or provider outage.
            </p>
          </div>
          <ShieldCheck aria-hidden="true" />
        </header>
        <div className="billing-protected-grid">
          {protectedOperations.map(([title, description]) => (
            <article key={title}>
              <CheckCircle2 aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {summary.deploymentMode === "managed" ? (
        <>
          <ManagedBillingControls
            canManage={canManage}
            organizationId={organizationId}
            plans={plans}
            portalOperationId={portalOperationId}
            providerLinked={summary.providerLinked}
            contractManaged={summary.commercialState === "contract_managed"}
            startSessionAction={startSessionAction}
          />
          <UsagePanel summary={usageSummary} />
        </>
      ) : null}

      <div className="billing-boundary-grid">
        <section>
          <span className="billing-panel-icon" aria-hidden="true">
            <DatabaseZap />
          </span>
          <div>
            <p className="login-eyebrow">Authority boundary</p>
            <h2>PostgreSQL decides access</h2>
            <ul>
              <li>Live organization membership is required.</li>
              <li>Browser claims never grant billing authority.</li>
              <li>Provider references stay in private tables.</li>
              <li>State changes are append-only and attributable.</li>
            </ul>
          </div>
        </section>

        <section
          className="billing-provider-controls"
          aria-labelledby="provider-controls-title"
        >
          <span className="billing-panel-icon" aria-hidden="true">
            <ExternalLink />
          </span>
          <div>
            <p className="login-eyebrow">Provider controls</p>
            <h2 id="provider-controls-title">{providerControls.title}</h2>
            <p>{providerControls.description}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

const continuityDestinations = [
  {
    href: "/customers",
    icon: UsersRound,
    label: "Member balances",
    description: "Review exact available, pending, and reserved value.",
  },
  {
    href: "/programme",
    icon: History,
    label: "Programme & history",
    description: "Read existing configuration and immutable versions.",
  },
  {
    href: "/operations",
    icon: RefreshCw,
    label: "Connector operations",
    description: "Reconcile orders, refunds, and native outcomes.",
  },
  {
    href: "/analytics",
    icon: BarChart3,
    label: "Analytics & exports",
    description: "Inspect measured outcomes and retrieve tenant evidence.",
  },
] as const;

function BillingContinuityPanel() {
  return (
    <section
      className="billing-continuity-panel"
      aria-labelledby="billing-continuity-title"
    >
      <header>
        <div>
          <p className="login-eyebrow">Operational continuity</p>
          <h2 id="billing-continuity-title">
            Your existing programme stays open
          </h2>
          <p>
            Billing can restrict new managed setup, never the evidence or value
            you already own.
          </p>
        </div>
      </header>
      <nav aria-label="Available in every commercial state">
        {continuityDestinations.map((destination) => {
          const Icon = destination.icon;
          return (
            <Link href={destination.href} key={destination.href}>
              <span aria-hidden="true">
                <Icon />
              </span>
              <span>
                <strong>{destination.label}</strong>
                <small>{destination.description}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

function UsagePanel({
  summary,
}: Readonly<{ summary: ManagedBillingUsageSummaryV1 | null }>) {
  const period = summary
    ? new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(summary.periodStart))
    : "Current UTC month";
  return (
    <section
      className="billing-usage-panel"
      aria-labelledby="billing-usage-title"
    >
      <header>
        <div>
          <p className="login-eyebrow">Measured usage</p>
          <h2 id="billing-usage-title">{period}</h2>
          <p>
            Every unit traces to immutable product evidence. Corrections are
            compensating facts; provider delivery never affects loyalty work.
          </p>
        </div>
        <span className="billing-usage-mode">
          <BarChart3 aria-hidden="true" />
          {summary?.dispatchMode === "configured"
            ? "Dispatch configured"
            : "Shadow mode"}
        </span>
      </header>
      {!summary ? (
        <p className="billing-plan-empty">
          The tenant-scoped usage projection is temporarily unavailable.
          Subscription authority and loyalty value are unaffected.
        </p>
      ) : (
        <div className="billing-usage-grid">
          {summary.meters.map((meter) => {
            const attention = BigInt(meter.attentionCount);
            const pending = BigInt(meter.pendingCount);
            return (
              <article key={meter.meterKey}>
                <small>{meter.label}</small>
                <strong>{formatUsageCount(meter.quantity)}</strong>
                <p>
                  {summary.dispatchMode === "configured"
                    ? `${formatUsageCount(meter.dispatchedQuantity)} provider-accepted${
                        pending > 0n
                          ? ` · ${formatUsageCount(meter.pendingCount)} pending`
                          : ""
                      }`
                    : `${formatUsageCount(meter.factCount)} source facts`}
                </p>
                {attention > 0n ? (
                  <span className="billing-usage-attention">
                    {formatUsageCount(meter.attentionCount)} need reconciliation
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function formatUsageCount(value: string): string {
  return new Intl.NumberFormat("en").format(BigInt(value));
}

export function formatBillingInstant(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

function ManagedBillingControls({
  canManage,
  contractManaged,
  organizationId,
  plans,
  portalOperationId,
  providerLinked,
  startSessionAction,
}: Readonly<{
  canManage: boolean;
  contractManaged: boolean;
  organizationId: string;
  plans: readonly ManagedBillingPlanOptionV1[];
  portalOperationId: string;
  providerLinked: boolean;
  startSessionAction: (formData: FormData) => Promise<never>;
}>) {
  return (
    <section
      className="billing-plan-panel"
      aria-labelledby="billing-plans-title"
      id="managed-billing-controls"
    >
      <header>
        <div>
          <p className="login-eyebrow">Managed subscription</p>
          <h2 id="billing-plans-title">Plan &amp; payment settings</h2>
          <p>
            {contractManaged
              ? "An approved enterprise contract controls this tenant without self-serve provider actions."
              : "Checkout opens on Stripe. Subscription access changes only after a separately verified webhook reaches the database."}
          </p>
        </div>
        {providerLinked && canManage ? (
          <form action={startSessionAction}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="billingAction" value="portal" />
            <input type="hidden" name="operationId" value={portalOperationId} />
            <button className="ui-button ui-button-secondary" type="submit">
              Open billing portal
              <ExternalLink aria-hidden="true" />
            </button>
          </form>
        ) : null}
      </header>

      {contractManaged ? (
        <p className="billing-plan-empty">
          Plan checkout and the billing portal are not used while the effective
          enterprise contract is authoritative. The contract term and decision
          source remain visible above.
        </p>
      ) : !canManage ? (
        <p className="billing-plan-empty">
          Only an active organization owner can change the managed plan or open
          payment settings.
        </p>
      ) : plans.length === 0 ? (
        <p className="billing-plan-empty">
          No managed plans are currently available for this tenant. Existing
          loyalty value and protected operations are unaffected.
        </p>
      ) : (
        <div className="billing-plan-grid">
          {plans.map((plan) => (
            <article key={plan.planId}>
              <div>
                <span>{plan.name}</span>
                <strong>{formatPlanPrice(plan)}</strong>
                <p>{plan.description}</p>
                {plan.trialDays > 0 ? (
                  <small>{plan.trialDays}-day trial</small>
                ) : null}
              </div>
              <form action={startSessionAction}>
                <input
                  type="hidden"
                  name="organizationId"
                  value={organizationId}
                />
                <input type="hidden" name="billingAction" value="checkout" />
                <input type="hidden" name="planId" value={plan.planId} />
                <input type="hidden" name="operationId" value={randomUUID()} />
                <button className="ui-button ui-button-primary" type="submit">
                  Choose {plan.name}
                  <ExternalLink aria-hidden="true" />
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatPlanPrice(plan: ManagedBillingPlanOptionV1): string {
  const amount = new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.currency,
  }).format(plan.unitAmountMinor / 100);
  const interval =
    plan.intervalCount === 1
      ? plan.interval
      : `${plan.intervalCount} ${plan.interval}s`;
  return `${amount} / ${interval}`;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof WalletCards;
  label: string;
  value: string;
}>) {
  return (
    <article className="billing-summary-card">
      <span aria-hidden="true">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
