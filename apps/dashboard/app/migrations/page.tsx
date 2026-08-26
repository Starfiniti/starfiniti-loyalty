import { redirect } from "next/navigation";
import {
  ArrowRightLeft,
  DatabaseBackup,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { migrationAdapterRegistryV1 } from "@starfiniti/domain";
import { MerchantShell } from "@/components/merchant-shell";
import { listCustomers } from "@/lib/server/customers";
import {
  getMigrationWorkspace,
  listMigrationCommerceConnections,
} from "@/lib/server/migrations";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { MigrationHistory } from "./migration-history";
import { MigrationWorkflow } from "./migration-workflow";

const sourceLabels = {
  generic_csv: "Generic Starfiniti CSV",
  wployalty: "WPLoyalty",
  yith_points_and_rewards: "YITH Points and Rewards",
  woorewards: "WooRewards",
} as const;

export default async function MigrationsPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Fmigrations");
  }
  if (tenant.kind === "unassigned") redirect("/");

  const programme = await getMerchantProgrammeState(tenant.context);
  const publishedVersion = programme.versions.find(
    (version) => version.status === "published",
  );
  const mayRead = ["owner", "admin", "auditor"].includes(
    tenant.context.membershipRole,
  );
  const [workspaceResult, customerResult, connectionResult] =
    await Promise.allSettled([
      mayRead ? getMigrationWorkspace(tenant.context) : Promise.resolve(null),
      mayRead ? listCustomers(tenant.context) : Promise.resolve([]),
      mayRead
        ? listMigrationCommerceConnections(tenant.context)
        : Promise.resolve([]),
    ]);
  const workspace =
    workspaceResult.status === "fulfilled" ? workspaceResult.value : null;
  const customers =
    customerResult.status === "fulfilled" ? customerResult.value : [];
  const connections =
    connectionResult.status === "fulfilled" ? connectionResult.value : [];
  const sources = migrationAdapterRegistryV1.entries
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        supportStatus: "supported";
        requiredExpiryPolicy: "merchant_selected" | "apply_default";
      } =>
        entry.supportStatus === "supported" &&
        entry.requiredExpiryPolicy !== null,
    )
    .map((entry) => ({
      sourceSystem: entry.sourceSystem,
      label: sourceLabels[entry.sourceSystem],
      format: entry.format,
      requiredExpiryPolicy: entry.requiredExpiryPolicy,
    }));

  return (
    <MerchantShell
      activePath="/migrations"
      locale="en"
      pageTitle="Migrations"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName:
          programme.programme?.name ??
          tenant.context.programmeGroup?.name ??
          "Programme setup required",
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main migration-page"
        id="main-content"
        lang="en"
        tabIndex={-1}
      >
        <section className="migration-hero">
          <div>
            <p className="login-eyebrow">Migration centre</p>
            <h1>Bring loyalty value across without losing trust</h1>
            <p>
              Validate source exports, explicitly resolve customer identities,
              and create traceable opening balances. Re-running the same work
              creates no duplicate value.
            </p>
          </div>
          <span className="migration-hero-icon" aria-hidden="true">
            <ArrowRightLeft />
          </span>
        </section>

        <section
          className="migration-principles"
          aria-label="Migration guarantees"
        >
          <Principle
            icon={FileCheck2}
            title="Dry run first"
            text="Strict adapters reject changed formats before value is possible."
          />
          <Principle
            icon={ShieldCheck}
            title="Exact approval"
            text="The database binds approval to file, mapping, programme, and totals."
          />
          <Principle
            icon={DatabaseBackup}
            title="Immutable ledger"
            text="Every imported point traces to a source row and opening transaction."
          />
        </section>

        {!mayRead ? (
          <section className="migration-disabled" role="status">
            <LockKeyhole aria-hidden="true" />
            <div>
              <h2>Privileged migration access required</h2>
              <p>
                Owners and admins can run migrations. Auditors can inspect
                receipts and reconciliation evidence. Your current role has no
                access to migration data.
              </p>
            </div>
          </section>
        ) : !workspace ||
          !tenant.context.programmeGroup ||
          !publishedVersion ? (
          <section className="migration-disabled" role="alert">
            <LockKeyhole aria-hidden="true" />
            <div>
              <h2>Migration workspace unavailable</h2>
              <p>
                Select an active workspace and programme, publish its current
                version, then refresh. No source or value operation was
                attempted.
              </p>
            </div>
          </section>
        ) : (
          <>
            <MigrationWorkflow
              canConfigure={workspace.canConfigure}
              connections={connections}
              customers={customers.map((customer) => ({
                id: customer.id,
                label: customer.maskedExternalId
                  ? `${customer.displayReference} · ${customer.maskedExternalId}`
                  : customer.displayReference,
              }))}
              programmeVersionNumber={publishedVersion.versionNumber}
              sources={sources}
            />
            <MigrationHistory
              canCorrect={workspace.canCorrect}
              workspace={workspace}
            />
          </>
        )}

        <section className="migration-format-note">
          <div>
            <strong>
              YITH stays unavailable until its current export shape is
              evidenced.
            </strong>
            <p>
              Generic CSV, WPLoyalty, and WooRewards use pinned V1 adapters. A
              changed header or property set fails closed instead of guessing.
            </p>
          </div>
          <code>registry v1</code>
        </section>
      </main>
    </MerchantShell>
  );
}

function Principle({
  icon: Icon,
  text,
  title,
}: Readonly<{
  icon: typeof FileCheck2;
  text: string;
  title: string;
}>) {
  return (
    <article>
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}
