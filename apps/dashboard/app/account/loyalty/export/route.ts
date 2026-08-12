import { NextRequest, NextResponse } from "next/server";
import {
  CUSTOMER_EXPORT_COOKIE,
  consumeCustomerDataExport,
} from "@/lib/server/customer-data-export";
import {
  customerDataExportHeaders,
  customerExportReauthenticationPath,
  isSupabaseSessionId,
} from "@/lib/customer-export";
import { resolveCustomerLocale } from "@/lib/customer-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const locale = resolveCustomerLocale(
    request.nextUrl.searchParams.get("lang"),
  );
  const reauthenticationUrl = new URL(
    customerExportReauthenticationPath(locale),
    request.url,
  );
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const verifiedClaims = claims.data?.claims;
  const authUserId = verifiedClaims?.sub;
  const sessionId = verifiedClaims?.session_id;
  const authorizationToken = request.cookies.get(CUSTOMER_EXPORT_COOKIE)?.value;

  if (
    claims.error ||
    !verifiedClaims ||
    typeof authUserId !== "string" ||
    !isSupabaseSessionId(sessionId) ||
    !authorizationToken
  ) {
    return NextResponse.redirect(reauthenticationUrl);
  }

  try {
    const email =
      typeof verifiedClaims.email === "string" ? verifiedClaims.email : null;
    const document = await consumeCustomerDataExport(
      authorizationToken,
      authUserId,
      sessionId,
      email,
    );
    const response = new NextResponse(
      `${JSON.stringify(document, null, 2)}\n`,
      {
        headers: customerDataExportHeaders(document.generatedAt),
      },
    );
    response.cookies.set(CUSTOMER_EXPORT_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/account/loyalty/export",
      expires: new Date(0),
    });
    return response;
  } catch {
    const response = NextResponse.redirect(reauthenticationUrl);
    response.cookies.set(CUSTOMER_EXPORT_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/account/loyalty/export",
      expires: new Date(0),
    });
    return response;
  }
}
