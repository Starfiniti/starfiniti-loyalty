import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOrganizationFederationWorkspace,
  resolveOrganizationFederationLogin,
} from "@/lib/server/enterprise-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabasePkceVerifierCookieName } from "@/lib/supabase/server-options";
import { dashboardPublicUrl, workforceSsoFlowId } from "@/lib/workforce-sso";

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function privateRedirect(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function outcomeUrl(
  publicOrigin: string,
  outcome: "success" | "failed",
  reason?: string,
): URL {
  const target = dashboardPublicUrl(publicOrigin, "/organization/access");
  target.searchParams.set("federationLink", outcome);
  if (reason) target.searchParams.set("reason", reason);
  return target;
}

export async function GET(request: Request) {
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (!publicOrigin) {
    return new NextResponse("Authentication unavailable", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const requestUrl = new URL(request.url);
  const organizationId = requestUrl.searchParams.get("organization") ?? "";
  const code = requestUrl.searchParams.get("code");
  const flowId = workforceSsoFlowId(requestUrl.searchParams.get("sb_flow_id"));
  if (!ORGANIZATION_ID.test(organizationId) || !code || !flowId) {
    return privateRedirect(
      outcomeUrl(publicOrigin, "failed", "callback_invalid"),
    );
  }

  const cookieStore = await cookies();
  if (!cookieStore.has(supabasePkceVerifierCookieName(flowId))) {
    return privateRedirect(
      outcomeUrl(publicOrigin, "failed", "verifier_cookie_missing"),
    );
  }

  const supabase = await createSupabaseServerClient();
  const exchange = await supabase.auth.exchangeCodeForSession(code, { flowId });
  if (exchange.error) {
    return privateRedirect(
      outcomeUrl(publicOrigin, "failed", "exchange_failed"),
    );
  }

  try {
    const workspace = await getOrganizationFederationWorkspace(organizationId);
    const login = workspace
      ? await resolveOrganizationFederationLogin(workspace.organization.slug)
      : null;
    const identities = await supabase.auth.getUserIdentities();
    const linked =
      login !== null &&
      identities.error === null &&
      identities.data.identities.some(
        ({ provider }) => provider === login.provider,
      );
    if (!workspace || !linked) {
      return privateRedirect(
        outcomeUrl(publicOrigin, "failed", "link_not_verified"),
      );
    }
  } catch {
    return privateRedirect(
      outcomeUrl(publicOrigin, "failed", "link_not_verified"),
    );
  }

  return privateRedirect(outcomeUrl(publicOrigin, "success"));
}
