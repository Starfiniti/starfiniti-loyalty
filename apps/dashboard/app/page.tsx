import { DashboardOverview } from "@/components/dashboard-overview";
import { programmeDefinitionV1 } from "@starfiniti/contracts";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { parseOverviewRange } from "@/lib/overview";
import { getConnectorOperations } from "@/lib/server/connector-operations";
import { getOverviewReport } from "@/lib/server/overview";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";

function merchantGreeting(): string {
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Ljubljana",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart ?? "12");
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    range?: string | string[];
    lang?: string | string[];
  }>;
}>) {
  const parameters = await searchParams;
  const range = parseOverviewRange(parameters.range);
  const locale = resolveMerchantLocale(parameters.lang);
  const text = (source: string) => merchantText(locale, source);
  const state = await getAuthenticatedTenantState();
  if (state.kind === "unauthenticated") {
    redirect(merchantLocalePath("/login", locale));
  }

  if (state.kind === "unassigned") {
    return (
      <main
        className="access-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <section className="access-card">
          <p className="login-eyebrow">Starfiniti Loyalty</p>
          <h1>{text("No organization access")}</h1>
          <p>
            {text(
              "Your identity is valid, but it has no active organization membership. An owner must provision membership before tenant data is visible.",
            )}
          </p>
          <form action={signOut}>
            <input name="lang" type="hidden" value={locale} />
            <button className="secondary" type="submit">
              {text("Sign out")}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { context } = state;
  const [report, programmeState, connections] = await Promise.all([
    getOverviewReport(context, range),
    getMerchantProgrammeState(context),
    getConnectorOperations(context),
  ]);
  const baseline =
    programmeState.versions.find((version) => version.status === "draft") ??
    programmeState.versions.find((version) => version.status === "published") ??
    programmeState.versions[0];
  const definition = baseline
    ? programmeDefinitionV1.safeParse(baseline.configuration)
    : null;
  const parsedDefinition = definition?.success ? definition.data : null;
  const firstConnection = connections[0];
  const failedOperations = firstConnection
    ? firstConnection.deliveriesFailed +
      firstConnection.effectsFailed +
      firstConnection.commandsFailed
    : 0;
  return (
    <DashboardOverview
      connector={{
        connected: connections.length > 0,
        displayName: firstConnection?.displayName ?? null,
        healthy: firstConnection?.status === "active" && failedOperations === 0,
      }}
      greeting={merchantGreeting()}
      locale={locale}
      programme={{
        audit: programmeState.audit.map((event) => ({
          action: event.action,
          createdAt: event.createdAt,
          id: event.id,
        })),
        hasPublishedVersion: programmeState.versions.some(
          (version) => version.status === "published",
        ),
        id: programmeState.programme?.id ?? null,
        name:
          programmeState.programme?.name ??
          context.programmeGroup?.name ??
          text("Programme setup required"),
        reward: parsedDefinition?.rewards[0]
          ? {
              costPoints: parsedDefinition.rewards[0].costPoints,
              kind: parsedDefinition.rewards[0].kind,
              name: parsedDefinition.rewards[0].name,
            }
          : null,
        tiers:
          parsedDefinition?.tiers.map((tier) => ({
            code: tier.code,
            name: tier.name,
          })) ?? [],
        versionNumber: baseline?.versionNumber ?? null,
        versionStatus: baseline?.status ?? null,
      }}
      range={range}
      report={report}
      tenant={{
        organizationName: context.organization.name,
        workspaceName: context.workspace?.name ?? text("No active workspace"),
        programmeName:
          context.programmeGroup?.name ?? text("Programme setup required"),
        role: context.membershipRole,
      }}
    />
  );
}
