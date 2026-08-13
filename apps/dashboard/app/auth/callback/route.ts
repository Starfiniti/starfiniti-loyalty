import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPublicUrl, workforceSsoFlowId } from "@/lib/workforce-sso";

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
  let failureReason = code ? "exchange_failed" : "code_missing";
  if (code) {
    const supabase = await createSupabaseServerClient();
    const flowId = workforceSsoFlowId(
      requestUrl.searchParams.get("sb_flow_id"),
    );
    const cookieStore = await cookies();
    const verifierCookiePresent = flowId
      ? cookieStore.has(`sb-api-auth-token-flow-${flowId}-code-verifier`)
      : cookieStore.has("sb-api-auth-token-code-verifier");
    if (!flowId) failureReason = "flow_id_missing";
    if (!verifierCookiePresent) failureReason = "verifier_cookie_missing";
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) {
      return privateRedirect(
        dashboardPublicUrl(
          publicOrigin,
          safeAppPath(requestUrl.searchParams.get("next")),
        ),
      );
    }
  }

  publicLogin.searchParams.set("error", "authentication_failed");
  publicLogin.searchParams.set("reason", failureReason);
  return privateRedirect(publicLogin);
}
