import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { getOrganizationTeamWorkspace } from "@/lib/server/enterprise-identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind !== "ready") {
    return Response.json(
      { error: "organization_export_unauthorized" },
      { status: 401 },
    );
  }
  let workspace = null;
  try {
    workspace = await getOrganizationTeamWorkspace(
      tenant.context.organization.public_id,
    );
  } catch {
    return Response.json(
      { error: "organization_export_unavailable" },
      { status: 503 },
    );
  }
  if (!workspace?.mayExport) {
    return Response.json(
      { error: "organization_export_unauthorized" },
      { status: 403 },
    );
  }
  const body = JSON.stringify(
    {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      source: "immutable administration evidence and live membership state",
      workspace,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${workspace.organization.slug}-identity-snapshot.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
