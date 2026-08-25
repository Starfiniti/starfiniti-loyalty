import type {
  MerchantNotificationProviderHealthV1,
  MerchantNotificationWorkspaceV1,
} from "@starfiniti/contracts";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  MailCheck,
  Send,
  ShieldCheck,
  UsersRound,
  Webhook,
} from "lucide-react";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getNotificationWorkspace } from "@/lib/server/notifications";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { NotificationTemplateStudio } from "./template-studio";

export default async function NotificationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const path = merchantLocalePath("/notifications", locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(path)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));
  const programme = await getMerchantProgrammeState(tenant.context);
  const workspace = tenant.context.workspace;
  let notificationWorkspace: MerchantNotificationWorkspaceV1 | null = null;
  if (workspace) {
    try {
      notificationWorkspace = await getNotificationWorkspace(
        workspace.public_id,
      );
    } catch {
      notificationWorkspace = null;
    }
  }
  const canManage = ["owner", "admin"].includes(tenant.context.membershipRole);

  return (
    <MerchantShell
      activePath="/notifications"
      locale={locale}
      pageTitle="Notifications"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: workspace?.name ?? t("No workspace"),
        programmeName:
          programme.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main customer-page notification-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading notification-heading">
          <div>
            <p className="login-eyebrow">Consent-safe communications</p>
            <h1>Notification studio &amp; delivery health</h1>
            <p>
              Control English loyalty emails, verify the real delivery path, and
              inspect provider health without exposing customer contact or
              connector secrets.
            </p>
          </div>
          <span className="notification-heading-icon" aria-hidden="true">
            <BellRing />
          </span>
        </div>

        {!workspace ? (
          <NotificationUnavailable message="Create an active workspace before configuring notifications." />
        ) : !notificationWorkspace ? (
          <NotificationUnavailable message="Notification health is temporarily unavailable. Existing loyalty value and accepted messages are unaffected." />
        ) : (
          <>
            <NotificationSummary workspace={notificationWorkspace} />
            <NotificationTemplateStudio
              canManage={canManage}
              publishOperationId={crypto.randomUUID()}
              templates={notificationWorkspace.templates}
              testOperationId={crypto.randomUUID()}
              workspaceId={workspace.public_id}
            />
            <NotificationIssues workspace={notificationWorkspace} />
          </>
        )}
      </main>
    </MerchantShell>
  );
}

function NotificationUnavailable({ message }: Readonly<{ message: string }>) {
  return (
    <section className="customer-panel notification-empty" role="status">
      <BellRing aria-hidden="true" />
      <h2>Notification workspace unavailable</h2>
      <p>{message}</p>
    </section>
  );
}

function NotificationSummary({
  workspace,
}: Readonly<{ workspace: MerchantNotificationWorkspaceV1 }>) {
  const marketing = workspace.consent.loyaltyMarketing;
  const transactional = workspace.consent.loyaltyTransactional;
  return (
    <section
      className="notification-overview"
      aria-label="Notification overview"
    >
      <div className="notification-summary-card is-primary">
        <span>
          <UsersRound aria-hidden="true" /> Active customers
        </span>
        <strong>
          {BigInt(workspace.consent.activeCustomers).toLocaleString("en")}
        </strong>
        <small>Contact identities remain private</small>
      </div>
      <div className="notification-summary-card">
        <span>
          <ShieldCheck aria-hidden="true" /> Transactional consent
        </span>
        <strong>{BigInt(transactional.subscribed).toLocaleString("en")}</strong>
        <small>{transactional.suppressed} provider-suppressed</small>
      </div>
      <div className="notification-summary-card">
        <span>
          <MailCheck aria-hidden="true" /> Marketing consent
        </span>
        <strong>{BigInt(marketing.subscribed).toLocaleString("en")}</strong>
        <small>{marketing.unsubscribed} unsubscribed</small>
      </div>
      <div className="notification-summary-card">
        <span>
          <CheckCircle2 aria-hidden="true" /> Rollout
        </span>
        <strong>{workspace.entitlementEnabled ? "Enabled" : "Disabled"}</strong>
        <small>{workspace.deploymentMode.replace("_", " ")} deployment</small>
      </div>
      <div className="notification-provider-strip">
        {workspace.providers.map((provider) => (
          <ProviderHealth key={provider.provider} provider={provider} />
        ))}
      </div>
    </section>
  );
}

function ProviderHealth({
  provider,
}: Readonly<{ provider: MerchantNotificationProviderHealthV1 }>) {
  const outstanding =
    BigInt(provider.pending) +
    BigInt(provider.processing) +
    BigInt(provider.retryable) +
    BigInt(provider.held);
  const failures =
    BigInt(provider.deadLetter) +
    BigInt(provider.manualReview) +
    BigInt(provider.contactUnavailable);
  const Icon =
    provider.provider === "smtp"
      ? Send
      : provider.provider === "webhook"
        ? Webhook
        : MailCheck;
  return (
    <article>
      <div className="notification-provider-name">
        <Icon aria-hidden="true" />
        <span>
          <strong>{provider.provider.toUpperCase()}</strong>
          <small>{provider.enabled ? "Eligible" : "Not configured"}</small>
        </span>
      </div>
      <dl>
        <div>
          <dt>Completed</dt>
          <dd>{provider.completed}</dd>
        </div>
        <div>
          <dt>Outstanding</dt>
          <dd>{outstanding.toString()}</dd>
        </div>
        <div className={failures > 0n ? "is-alert" : ""}>
          <dt>Needs attention</dt>
          <dd>{failures.toString()}</dd>
        </div>
      </dl>
    </article>
  );
}

function NotificationIssues({
  workspace,
}: Readonly<{ workspace: MerchantNotificationWorkspaceV1 }>) {
  return (
    <section
      className="notification-issues"
      aria-labelledby="notification-issues-title"
    >
      <div className="notification-panel-heading">
        <div>
          <p className="login-eyebrow">Canonical operations</p>
          <h2 id="notification-issues-title">Needs attention</h2>
          <p>
            Only bounded state and error codes are shown. Customer contact,
            payloads, destinations, provider bodies, and worker identities stay
            private.
          </p>
        </div>
        <span className="ui-badge ui-badge-neutral">
          {workspace.issues.length} OPEN
        </span>
      </div>
      {workspace.issues.length === 0 ? (
        <div className="notification-healthy-state">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>No delivery issue needs attention</strong>
            <p>Accepted work is processing within its current policy.</p>
          </div>
        </div>
      ) : (
        <div className="notification-issues-table-wrap">
          <table className="notification-issues-table">
            <caption>Recent canonical notification issues</caption>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Kind</th>
                <th>State</th>
                <th>Attempts</th>
                <th>Code</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {workspace.issues.map((issue) => (
                <tr key={`${issue.provider}:${issue.referenceId}`}>
                  <th scope="row">
                    <AlertTriangle aria-hidden="true" />{" "}
                    {issue.provider.toUpperCase()}
                  </th>
                  <td>{issue.kind}</td>
                  <td>
                    <span className="ui-badge ui-badge-warning">
                      {issue.state.replace("_", " ")}
                    </span>
                  </td>
                  <td>{issue.attemptCount}</td>
                  <td>
                    <code>{issue.errorCode ?? "—"}</code>
                  </td>
                  <td>
                    <Clock3 aria-hidden="true" />{" "}
                    <time dateTime={issue.updatedAt}>
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(issue.updatedAt))}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
