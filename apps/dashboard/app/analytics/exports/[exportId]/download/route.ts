import { NextRequest, NextResponse } from "next/server";
import {
  ANALYTICS_EXPORT_COOKIE,
  analyticsExportDownloadPath,
  analyticsExportHeaders,
} from "@/lib/analytics-export";
import { isSupabaseSessionId } from "@/lib/customer-export";
import { consumeAnalyticsExport } from "@/lib/server/analytics-exports";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
): Promise<NextResponse> {
  const { exportId } = await context.params;
  const downloadPath = analyticsExportDownloadPath(exportId);
  const failureUrl = new URL("/analytics?export=unavailable", request.url);
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const authUserId = claims.data?.claims?.sub;
  const sessionId = claims.data?.claims?.session_id;
  const token = request.cookies.get(ANALYTICS_EXPORT_COOKIE)?.value;
  if (
    claims.error ||
    typeof authUserId !== "string" ||
    !isSupabaseSessionId(sessionId) ||
    !token
  ) {
    return clearCapability(NextResponse.redirect(failureUrl), downloadPath);
  }
  try {
    const exportResult = await consumeAnalyticsExport(
      exportId,
      token,
      authUserId,
      sessionId,
    );
    return clearCapability(
      new NextResponse(exportResult.body, {
        headers: analyticsExportHeaders(exportResult.document.generatedAt),
      }),
      downloadPath,
    );
  } catch {
    return clearCapability(NextResponse.redirect(failureUrl), downloadPath);
  }
}

function clearCapability(response: NextResponse, path: string): NextResponse {
  response.cookies.set(ANALYTICS_EXPORT_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path,
    expires: new Date(0),
  });
  return response;
}
