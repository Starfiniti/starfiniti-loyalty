import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveMerchantLocale } from "../merchant-locale";
import { readSupabasePublicConfig } from "./config";
import {
  SUPABASE_SERVER_AUTH_OPTIONS,
  supabaseServerCookieOptions,
} from "./server-options";

const REQUEST_LOCALE_HEADER = "x-starfiniti-locale";

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

export function localeRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(
    REQUEST_LOCALE_HEADER,
    resolveMerchantLocale(request.nextUrl.searchParams.get("lang")),
  );
  return headers;
}

export function authenticatedHomeTarget(source: URL): URL {
  const target = new URL(source);
  const locale = resolveMerchantLocale(target.searchParams.get("lang"));
  target.pathname = "/";
  target.search = "";
  if (locale === "sl-SI") target.searchParams.set("lang", locale);
  return target;
}

export function unauthenticatedLoginTarget(source: URL): URL {
  const target = new URL(source);
  const locale = resolveMerchantLocale(target.searchParams.get("lang"));
  target.searchParams.delete("lang");
  const next = `${target.pathname}${target.search}`;
  target.pathname = "/login";
  target.search = "";
  target.searchParams.set("next", next);
  if (locale === "sl-SI") target.searchParams.set("lang", locale);
  return target;
}

export async function updateSupabaseSession(
  request: NextRequest,
  forwardedHeaders?: Headers,
): Promise<NextResponse> {
  const requestHeaders = forwardedHeaders
    ? new Headers(forwardedHeaders)
    : localeRequestHeaders(request);
  requestHeaders.set(
    REQUEST_LOCALE_HEADER,
    resolveMerchantLocale(request.nextUrl.searchParams.get("lang")),
  );
  if (request.nextUrl.pathname === "/auth/callback") {
    const callbackResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    callbackResponse.headers.set("Cache-Control", "private, no-store");
    callbackResponse.headers.set("Vary", "Cookie");
    callbackResponse.headers.set("Referrer-Policy", "no-referrer");
    return callbackResponse;
  }
  if (request.nextUrl.pathname.startsWith("/loyalty/")) {
    const publicResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    publicResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    return publicResponse;
  }
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const config = readSupabasePublicConfig();
  const supabase = createServerClient(config.url, config.publishableKey, {
    auth: SUPABASE_SERVER_AUTH_OPTIONS,
    cookieOptions: supabaseServerCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
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
    const target = unauthenticatedLoginTarget(request.nextUrl);
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
    const target = authenticatedHomeTarget(request.nextUrl);
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
