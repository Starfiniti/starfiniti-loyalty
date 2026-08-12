import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, PlugZap, ShieldCheck, TriangleAlert } from "lucide-react";
import { signOut } from "@/app/actions";
import {
  canRetryConnectorEffect,
  CONNECTOR_OPERATION_ISSUE_LIMIT,
  connectorHealth,
  connectorIssueLabel,
} from "@/lib/connector-operations";
import { getConnectorOperations } from "@/lib/server/connector-operations";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { buildSupportDiagnostics } from "@/lib/support-diagnostics";
import { RetryEffectForm } from "./retry-effect-form";
import { ReconciliationForm } from "./reconciliation-form";
import { SupportDiagnosticsDownload } from "./support-diagnostics-download";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

export default async function OperationsPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") redirect("/login?next=%2Foperations");
  if (tenant.kind === "unassigned") redirect("/");
  const connections = await getConnectorOperations(tenant.context);
  const mayRetry = canRetryConnectorEffect(tenant.context.membershipRole);
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
      tabIndex={-1}
    >
      <header className="programme-topbar">
        <div>
          <Link className="programme-brand" href="/">
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <nav aria-label="Account navigation">
          <Link className="secondary" href="/programme">
            Programme
          </Link>
          <Link className="secondary" href="/customers">
            Customers
          </Link>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="customer-heading">
        <div>
          <p className="login-eyebrow">Tenant-scoped operations</p>
          <h1>Connector health</h1>
          <p>
            Inspect WooCommerce ingestion, effect, and outbound command queues.
            Private payloads and source customer identifiers stay outside the
            browser.
          </p>
        </div>
        <span className="role-badge">{tenant.context.membershipRole}</span>
      </div>

      <SupportDiagnosticsDownload diagnostics={diagnostics} />

      {connections.length === 0 ? (
        <section className="customer-panel empty-state">
          <PlugZap aria-hidden="true" />
          <h2>No WooCommerce connector</h2>
          <p>
            Connector provisioning is not yet complete for this workspace. No
            signing material is displayed or accepted here.
          </p>
        </section>
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
                      Last verified delivery:{" "}
                      {formatDate(connection.lastSeenAt)}
                    </p>
                  </div>
                </div>
                <span className={`health-badge ${health}`}>
                  {health === "attention" ? (
                    <TriangleAlert aria-hidden="true" />
                  ) : (
                    <Activity aria-hidden="true" />
                  )}
                  {health}
                </span>
              </header>

              <div className="queue-grid">
                <article>
                  <span>Delivery queue</span>
                  <strong>{connection.deliveriesReady}</strong>
                  <small>{connection.deliveriesFailed} need attention</small>
                </article>
                <article>
                  <span>Loyalty effects</span>
                  <strong>{connection.effectsReady}</strong>
                  <small>{connection.effectsFailed} need attention</small>
                </article>
                <article>
                  <span>Woo commands</span>
                  <strong>{connection.commandsReady}</strong>
                  <small>{connection.commandsFailed} need attention</small>
                </article>
                <article className="safety-card">
                  <ShieldCheck aria-hidden="true" />
                  <span>Safe retry policy</span>
                  <small>Only canonical effects can be replayed here.</small>
                </article>
              </div>

              {mayRetry &&
              (connection.status === "active" ||
                connection.status === "rotating") ? (
                <ReconciliationForm connectionId={connection.id} />
              ) : (
                <div className="reconciliation-unavailable">
                  Source reconciliation requires a live connector and an owner,
                  admin, or operator role.
                </div>
              )}

              <div className="customer-result-heading">
                <div>
                  <TriangleAlert aria-hidden="true" />
                  <strong>
                    {connection.issues.length} recent queue issues
                  </strong>
                </div>
                <span>Newest 25 · payloads withheld</span>
              </div>
              {connection.issues.length === 0 ? (
                <div className="empty-state compact">
                  <h3>No active queue issues</h3>
                  <p>The bounded operational view contains no failures.</p>
                </div>
              ) : (
                <div className="customer-table-wrap">
                  <table className="customer-table operations-table">
                    <thead>
                      <tr>
                        <th scope="col">Operation</th>
                        <th scope="col">State</th>
                        <th scope="col">Attempts</th>
                        <th scope="col">Observed</th>
                        <th scope="col">Control</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connection.issues.map((issue) => (
                        <tr key={`${issue.kind}:${issue.id}`}>
                          <td>
                            <strong>{connectorIssueLabel(issue.kind)}</strong>
                            <span>{issue.operationKind}</span>
                            <code>{issue.errorCode ?? "no_error_code"}</code>
                          </td>
                          <td>
                            <span className={`issue-state ${issue.state}`}>
                              {issue.state.replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="points-cell">{issue.attemptCount}</td>
                          <td>{formatDate(issue.observedAt)}</td>
                          <td>
                            {issue.retryAllowed && mayRetry ? (
                              <RetryEffectForm eventId={issue.id} />
                            ) : (
                              <span className="inspect-only">
                                {issue.kind === "command"
                                  ? "Inspect only — compensation may exist"
                                  : "Remediation required"}
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
