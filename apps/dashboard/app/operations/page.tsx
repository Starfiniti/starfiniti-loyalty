import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, PlugZap, ShieldCheck, TriangleAlert } from "lucide-react";
import { signOut } from "@/app/actions";
import { MerchantLocaleSwitcher } from "@/components/merchant-locale-switcher";
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
  const diagnostics = buildSupportDiagnostics({
    generatedAt: new Date().toISOString(),
    organizationId: tenant.context.organization.public_id,
    workspaceId: tenant.context.workspace?.public_id ?? null,
    programmeGroupId: tenant.context.programmeGroup?.public_id ?? null,
    issueSampleLimit: CONNECTOR_OPERATION_ISSUE_LIMIT,
    connections,
  });

  return (
    <main
      className="customer-page operations-page"
      id="main-content"
      lang={locale}
      tabIndex={-1}
    >
      <header className="programme-topbar">
        <div>
          <Link
            className="programme-brand"
            href={merchantLocalePath("/", locale)}
          >
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <div className="programme-topbar-actions">
          <MerchantLocaleSwitcher locale={locale} />
          <nav aria-label={t("Account navigation")}>
            <Link
              className="secondary"
              href={merchantLocalePath("/programme", locale)}
            >
              {t("Programme")}
            </Link>
            <Link
              className="secondary"
              href={merchantLocalePath("/customers", locale)}
            >
              {t("Customers")}
            </Link>
            <form action={signOut}>
              <input name="lang" type="hidden" value={locale} />
              <button className="secondary" type="submit">
                {t("Sign out")}
              </button>
            </form>
          </nav>
        </div>
      </header>

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

      {connections.length === 0 ? (
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
        connections.map((connection) => {
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
                          <td className="points-cell">{issue.attemptCount}</td>
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
                                    ? t("Inspect only — compensation may exist")
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
    </main>
  );
}
