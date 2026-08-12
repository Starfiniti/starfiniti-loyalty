import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfig } from "./config";

function isPublicPage(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/claim/") ||
    pathname.startsWith("/loyalty/")
  );
}

export function isCustomerExportReauthentication(
  pathname: string,
  value: string | null,
): boolean {
  return pathname === "/login" && value === "customer-export";
}

function responseWithAuthState(
  source: NextResponse,
  target: URL,
): NextResponse {
  const response = NextResponse.redirect(target);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  ["cache-control", "expires", "pragma"].forEach((key) => {
    const value = source.headers.get(key);
    if (value) response.headers.set(key, value);
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function updateSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith("/loyalty/")) {
    const publicResponse = NextResponse.next({ request });
    publicResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    return publicResponse;
  }
  let response = NextResponse.next({ request });
  const config = readSupabasePublicConfig();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && typeof data?.claims?.sub === "string";
  const publicPage = isPublicPage(request.nextUrl.pathname);

  if (!authenticated && !publicPage) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return responseWithAuthState(response, target);
  }

  const customerExportReauthentication = isCustomerExportReauthentication(
    request.nextUrl.pathname,
    request.nextUrl.searchParams.get("reauth"),
  );

  if (
    authenticated &&
    request.nextUrl.pathname === "/login" &&
    !customerExportReauthentication
  ) {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return responseWithAuthState(response, target);
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/claim/")
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  if (request.nextUrl.pathname.startsWith("/claim/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
