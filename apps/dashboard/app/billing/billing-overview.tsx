import type {
  BillingSummaryV1,
  ManagedBillingCommercialState,
} from "@starfiniti/contracts";
import {
  Ban,
  CheckCircle2,
  CloudCog,
  DatabaseZap,
  ExternalLink,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

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

export function billingStatePresentation(
  summary: BillingSummaryV1,
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
    return {
      badge: stateLabels[summary.commercialState],
      title: "New managed growth is restricted",
      description:
        "Existing balances, refunds, reconciliation, exports, checkout, and promised rewards remain available while the commercial state is resolved.",
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
}: Readonly<{ summary: BillingSummaryV1 | null }>) {
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
          <p>{presentation.description}</p>
        </div>
      </section>

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
            <h2 id="provider-controls-title">
              {summary.deploymentMode === "self_hosted"
                ? "External billing is not required"
                : "Checkout and portal are not enabled"}
            </h2>
            <p>
              {summary.deploymentMode === "self_hosted"
                ? "This installation keeps commercial control local and never requires Stripe configuration or a remote licence check."
                : "No external billing action is exposed until signed server-side checkout, portal, and webhook lifecycle controls pass their production gate."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
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
