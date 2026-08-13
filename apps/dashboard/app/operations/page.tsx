import { redirect } from "next/navigation";
import { Activity, PlugZap, ShieldCheck, TriangleAlert } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  canRetryConnectorEffect,
  CONNECTOR_OPERATION_ISSUE_LIMIT,
  connectorHealth,
  connectorIssueLabel,
} from "@/lib/connector-operations";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { getConnectorOperations } from "@/lib/server/connector-operations";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { buildSupportDiagnostics } from "@/lib/support-diagnostics";
import { RetryEffectForm } from "./retry-effect-form";
import { ActivitySourceProvisioningForm } from "./activity-source-provisioning-form";
import { ConnectorProvisioningForm } from "./connector-provisioning-form";
import { ReconciliationForm } from "./reconciliation-form";
import { SupportDiagnosticsDownload } from "./support-diagnostics-download";

function formatDate(value: string | null, locale: MerchantLocale): string {
  if (!value) return merchantText(locale, "Never");
  return new Intl.DateTimeFormat(merchantIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

export default async function OperationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const operationsPath = merchantLocalePath("/operations", locale);
    redirect(
      merchantLocalePath(
        `/login?next=${encodeURIComponent(operationsPath)}`,
        locale,
      ),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));
  const [connections, programme] = await Promise.all([
    getConnectorOperations(tenant.context),
    getMerchantProgrammeState(tenant.context),
  ]);
  const mayRetry = canRetryConnectorEffect(tenant.context.membershipRole);
  const mayProvision = ["owner", "admin"].includes(
    tenant.context.membershipRole,
  );
  const hasPublishedProgramme = programme.versions.some(
    (version) => version.status === "published",
  );
  const hasPublishedV2Programme = programme.versions.some(
    (version) =>
      version.status === "published" &&
      typeof version.configuration === "object" &&
      version.configuration !== null &&
      "version" in version.configuration &&
      version.configuration.version === "2",
  );
  const wooConnections = connections.filter(
    (connection) => connection.platform === "woocommerce",
  );
  const activitySources = connections.filter(
    (connection) => connection.platform === "merchant_activity",
  );
  const diagnostics = buildSupportDiagnostics({
    generatedAt: new Date().toISOString(),
    organizationId: tenant.context.organization.public_id,
    workspaceId: tenant.context.workspace?.public_id ?? null,
    programmeGroupId: tenant.context.programmeGroup?.public_id ?? null,
    issueSampleLimit: CONNECTOR_OPERATION_ISSUE_LIMIT,
    connections,
  });

  return (
    <MerchantShell
      locale={locale}
      pageTitle="Connector operations"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName:
          programme.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main customer-page operations-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading">
          <div>
            <p className="login-eyebrow">{t("Tenant-scoped operations")}</p>
            <h1>{t("Connector health")}</h1>
            <p>
              {t(
                "Inspect WooCommerce ingestion, effect, and outbound command queues. Private payloads and source customer identifiers stay outside the browser.",
              )}
            </p>
          </div>
          <span className="role-badge">{tenant.context.membershipRole}</span>
        </div>

        <SupportDiagnosticsDownload diagnostics={diagnostics} locale={locale} />

        {wooConnections.length === 0 ? (
          mayProvision &&
          tenant.context.workspace &&
          programme.programme &&
          hasPublishedProgramme ? (
            <ConnectorProvisioningForm
              locale={locale}
              programmeId={programme.programme.id}
              programmeName={programme.programme.name}
              workspaceId={tenant.context.workspace.public_id}
              workspaceName={tenant.context.workspace.name}
            />
          ) : (
            <section className="customer-panel empty-state">
              <PlugZap aria-hidden="true" />
              <h2>{t("WooCommerce connection not ready")}</h2>
              <p>
                {t(
                  "A live owner or admin, active workspace, and published programme are required before guided provisioning. Signing material remains outside the browser.",
                )}
              </p>
            </section>
          )
        ) : (
          wooConnections.map((connection) => {
            const failedCount =
              connection.deliveriesFailed +
              connection.effectsFailed +
              connection.commandsFailed;
            const health = connectorHealth({
              status: connection.status,
              lastSeenAt: connection.lastSeenAt,
              failedCount,
            });
            return (
              <section className="connector-card" key={connection.id}>
                <header className="connector-card-heading">
                  <div>
                    <PlugZap aria-hidden="true" />
                    <div>
                      <h2>{connection.displayName}</h2>
                      <p>
                        {t("Last verified delivery:")}{" "}
                        {formatDate(connection.lastSeenAt, locale)}
                      </p>
                    </div>
                  </div>
                  <span className={`health-badge ${health}`}>
                    {health === "attention" ? (
                      <TriangleAlert aria-hidden="true" />
                    ) : (
                      <Activity aria-hidden="true" />
                    )}
                    {t(health)}
                  </span>
                </header>

                <div className="queue-grid">
                  <article>
                    <span>{t("Delivery queue")}</span>
                    <strong>{connection.deliveriesReady}</strong>
                    <small>
                      {connection.deliveriesFailed} {t("need attention")}
                    </small>
                  </article>
                  <article>
                    <span>{t("Loyalty effects")}</span>
                    <strong>{connection.effectsReady}</strong>
                    <small>
                      {connection.effectsFailed} {t("need attention")}
                    </small>
                  </article>
                  <article>
                    <span>{t("Woo commands")}</span>
                    <strong>{connection.commandsReady}</strong>
                    <small>
                      {connection.commandsFailed} {t("need attention")}
                    </small>
                  </article>
                  <article className="safety-card">
                    <ShieldCheck aria-hidden="true" />
                    <span>{t("Safe retry policy")}</span>
                    <small>
                      {t("Only canonical effects can be replayed here.")}
                    </small>
                  </article>
                </div>

                {mayRetry &&
                (connection.status === "active" ||
                  connection.status === "rotating") ? (
                  <ReconciliationForm
                    connectionId={connection.id}
                    locale={locale}
                  />
                ) : (
                  <div className="reconciliation-unavailable">
                    {t(
                      "Source reconciliation requires a live connector and an owner, admin, or operator role.",
                    )}
                  </div>
                )}

                <div className="customer-result-heading">
                  <div>
                    <TriangleAlert aria-hidden="true" />
                    <strong>
                      {connection.issues.length} {t("recent queue issues")}
                    </strong>
                  </div>
                  <span>{t("Newest 25 · payloads withheld")}</span>
                </div>
                {connection.issues.length === 0 ? (
                  <div className="empty-state compact">
                    <h3>{t("No active queue issues")}</h3>
                    <p>
                      {t("The bounded operational view contains no failures.")}
                    </p>
                  </div>
                ) : (
                  <div className="customer-table-wrap">
                    <table className="customer-table operations-table">
                      <thead>
                        <tr>
                          <th scope="col">{t("Operation")}</th>
                          <th scope="col">{t("State")}</th>
                          <th scope="col">{t("Attempts")}</th>
                          <th scope="col">{t("Observed")}</th>
                          <th scope="col">{t("Control")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connection.issues.map((issue) => (
                          <tr key={`${issue.kind}:${issue.id}`}>
                            <td>
                              <strong>
                                {t(connectorIssueLabel(issue.kind))}
                              </strong>
                              <span>{issue.operationKind}</span>
                              <code>{issue.errorCode ?? "no_error_code"}</code>
                            </td>
                            <td>
                              <span className={`issue-state ${issue.state}`}>
                                {t(issue.state.replaceAll("_", " "))}
                              </span>
                            </td>
                            <td className="points-cell">
                              {issue.attemptCount}
                            </td>
                            <td>{formatDate(issue.observedAt, locale)}</td>
                            <td>
                              {issue.retryAllowed && mayRetry ? (
                                <RetryEffectForm
                                  eventId={issue.id}
                                  locale={locale}
                                />
                              ) : (
                                <span className="inspect-only">
                                  {issue.state === "manual_review"
                                    ? t(
                                        "Verify the WooCommerce result before retrying or releasing value",
                                      )
                                    : issue.kind === "command"
                                      ? t(
                                          "Inspect only — compensation may exist",
                                        )
                                      : t("Remediation required")}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })
        )}

        <div className="customer-result-heading">
          <div>
            <Activity aria-hidden="true" />
            <strong>{t("Merchant Activity API")}</strong>
          </div>
          <span>{t("Signed server events only")}</span>
        </div>
        {activitySources.length === 0 ? (
          mayProvision &&
          tenant.context.workspace &&
          programme.programme &&
          hasPublishedV2Programme ? (
            <ActivitySourceProvisioningForm
              locale={locale}
              programmeId={programme.programme.id}
              programmeName={programme.programme.name}
              workspaceId={tenant.context.workspace.public_id}
              workspaceName={tenant.context.workspace.name}
            />
          ) : (
            <section className="customer-panel empty-state">
              <Activity aria-hidden="true" />
              <h2>{t("Merchant Activity source not ready")}</h2>
              <p>
                {t(
                  "A live owner or admin, active workspace, and published V2 programme are required. Browser self-reported activities are never accepted.",
                )}
              </p>
            </section>
          )
        ) : (
          activitySources.map((source) => {
            const failedCount = source.deliveriesFailed + source.effectsFailed;
            const health = connectorHealth({
              status: source.status,
              lastSeenAt: source.lastSeenAt,
              failedCount,
            });
            return (
              <section className="connector-card" key={source.id}>
                <header className="connector-card-heading">
                  <div>
                    <Activity aria-hidden="true" />
                    <div>
                      <h2>{source.displayName}</h2>
                      <p>
                        {t("Last verified activity:")}{" "}
                        {formatDate(source.lastSeenAt, locale)}
                      </p>
                    </div>
                  </div>
                  <span className={`health-badge ${health}`}>
                    <Activity aria-hidden="true" />
                    {t(health)}
                  </span>
                </header>
                <div className="queue-grid activity-source-grid">
                  <article>
                    <span>{t("Delivery queue")}</span>
                    <strong>{source.deliveriesReady}</strong>
                    <small>
                      {source.deliveriesFailed} {t("need attention")}
                    </small>
                  </article>
                  <article>
                    <span>{t("Loyalty effects")}</span>
                    <strong>{source.effectsReady}</strong>
                    <small>
                      {source.effectsFailed} {t("need attention")}
                    </small>
                  </article>
                  <article className="safety-card">
                    <ShieldCheck aria-hidden="true" />
                    <span>{t("Browser authority denied")}</span>
                    <small>
                      {t("Every activity requires a bounded signed delivery.")}
                    </small>
                  </article>
                </div>
              </section>
            );
          })
        )}
      </main>
    </MerchantShell>
  );
}
