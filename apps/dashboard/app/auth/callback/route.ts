import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { safeAppPath } from "@/lib/safe-navigation";
import { claimOrganizationScimMembership } from "@/lib/server/enterprise-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabasePkceVerifierCookieName } from "@/lib/supabase/server-options";
import { dashboardPublicUrl, workforceSsoFlowId } from "@/lib/workforce-sso";

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCIM_CLAIM_OUTCOMES = new Set([
  "created",
  "updated",
  "unchanged",
  "manual_membership",
]);

function privateRedirect(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (!publicOrigin) {
    return new NextResponse("Authentication unavailable", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  let publicLogin: URL;
  try {
    publicLogin = dashboardPublicUrl(publicOrigin, "/login");
  } catch {
    return new NextResponse("Authentication unavailable", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const code = requestUrl.searchParams.get("code");
  const organizationId = requestUrl.searchParams.get("organization");
  let failureReason = code ? "exchange_failed" : "code_missing";
  if (organizationId !== null && !ORGANIZATION_ID.test(organizationId)) {
    failureReason = "federation_context_invalid";
  } else if (code) {
    const flowId = workforceSsoFlowId(
      requestUrl.searchParams.get("sb_flow_id"),
    );
    if (!flowId) {
      failureReason = "flow_id_missing";
    } else {
      const cookieStore = await cookies();
      if (!cookieStore.has(supabasePkceVerifierCookieName(flowId))) {
        failureReason = "verifier_cookie_missing";
      } else {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code, {
          flowId,
        });
        if (!error) {
          if (organizationId !== null) {
            try {
              const claim = await claimOrganizationScimMembership(
                organizationId,
                randomUUID(),
              );
              if (!SCIM_CLAIM_OUTCOMES.has(claim.outcome)) {
                failureReason = "federation_membership_unavailable";
              } else {
                return privateRedirect(
                  dashboardPublicUrl(
                    publicOrigin,
                    safeAppPath(requestUrl.searchParams.get("next")),
                  ),
                );
              }
            } catch {
              failureReason = "federation_membership_unavailable";
            }
          } else {
            return privateRedirect(
              dashboardPublicUrl(
                publicOrigin,
                safeAppPath(requestUrl.searchParams.get("next")),
              ),
            );
          }
        } else {
          failureReason = "exchange_failed";
        }
      }
    }
  }

  publicLogin.searchParams.set("error", "authentication_failed");
  publicLogin.searchParams.set("reason", failureReason);
  return privateRedirect(publicLogin);
}
