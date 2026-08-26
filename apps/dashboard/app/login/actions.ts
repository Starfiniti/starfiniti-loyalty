"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import {
  isExpectedWorkforceAuthorizeUrl,
  STARFINITI_WORKFORCE_PROVIDER,
  workforceSsoCallbackUrl,
} from "@/lib/workforce-sso";
import { resolveOrganizationFederationLogin } from "@/lib/server/enterprise-identity";
import {
  isExpectedTenantFederationAuthorizeUrl,
  tenantFederationLoginCallbackUrl,
} from "@/lib/tenant-federation-navigation";
import { CUSTOMER_COPY, resolveCustomerLocale } from "@/lib/customer-locale";
import { customerExportPath, isSupabaseSessionId } from "@/lib/customer-export";
import {
  CUSTOMER_EXPORT_COOKIE,
  issueCustomerDataExportAuthorization,
} from "@/lib/server/customer-data-export";

export type LoginState = Readonly<{ message: string }>;

export async function signInWithTenantSso(formData: FormData): Promise<never> {
  const organizationSlug = String(
    formData.get("organizationSlug") ?? "",
  ).trim();
  const nextPath = safeAppPath(formData.get("next"));
  const failurePath = `/login?${new URLSearchParams({
    error: "tenant_sso_failed",
    next: nextPath,
  }).toString()}`;
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (
    !publicOrigin ||
    organizationSlug.length < 2 ||
    organizationSlug.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(organizationSlug)
  ) {
    redirect(failurePath);
  }

  let authorizationUrl: string | null = null;
  let provider = "";
  let supabaseUrl = "";
  try {
    const login = await resolveOrganizationFederationLogin(organizationSlug);
    if (login) {
      provider = login.provider;
      const publicConfig = readSupabasePublicConfig();
      supabaseUrl = publicConfig.url;
      const supabase = await createSupabaseServerClient();
      const result = await supabase.auth.signInWithOAuth({
        provider: provider as `custom:${string}`,
        options: {
          redirectTo: tenantFederationLoginCallbackUrl(
            publicOrigin,
            nextPath,
            login.organizationId,
          ),
          scopes: "openid",
          skipBrowserRedirect: true,
        },
      });
      if (!result.error) authorizationUrl = result.data.url;
    }
  } catch {
    redirect(failurePath);
  }

  if (
    !isExpectedTenantFederationAuthorizeUrl(
      authorizationUrl,
      supabaseUrl,
      provider,
      "login",
    )
  ) {
    redirect(failurePath);
  }
  redirect(authorizationUrl);
}

function workforceSsoFailurePath(locale: string, nextPath: string): string {
  const parameters = new URLSearchParams({
    error: "workforce_sso_failed",
    lang: locale,
    next: nextPath,
  });
  return `/login?${parameters.toString()}`;
}

export async function signInWithWorkforceSso(
  formData: FormData,
): Promise<never> {
  const locale = resolveCustomerLocale(formData.get("lang"));
  const nextPath = safeAppPath(formData.get("next"));
  const failurePath = workforceSsoFailurePath(locale, nextPath);
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();

  if (!publicOrigin) redirect(failurePath);

  let authorizationUrl: string | null = null;
  let supabaseUrl = "";
  try {
    const callbackUrl = workforceSsoCallbackUrl(publicOrigin, nextPath);
    const publicConfig = readSupabasePublicConfig();
    supabaseUrl = publicConfig.url;
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.signInWithOAuth({
      provider: STARFINITI_WORKFORCE_PROVIDER,
      options: {
        redirectTo: callbackUrl,
        scopes: "openid profile email",
        skipBrowserRedirect: true,
      },
    });
    if (!result.error) authorizationUrl = result.data.url;
  } catch {
    redirect(failurePath);
  }

  if (!isExpectedWorkforceAuthorizeUrl(authorizationUrl, supabaseUrl)) {
    redirect(failurePath);
  }
  redirect(authorizationUrl);
}

export async function signIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const locale = resolveCustomerLocale(formData.get("lang"));
  const copy = CUSTOMER_COPY[locale];
  const customerExportReauthentication =
    formData.get("reauth") === "customer-export";
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 320 ||
    password.length > 1024 ||
    !email.includes("@") ||
    password.length < 8
  ) {
    return { message: copy.invalidCredentials };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { message: copy.rejectedCredentials };
  }

  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    await supabase.auth.signOut();
    return { message: copy.sessionFailed };
  }

  if (customerExportReauthentication) {
    const sessionId = claims.data.claims.session_id;
    if (!isSupabaseSessionId(sessionId)) {
      return { message: copy.exportAuthorizationFailed };
    }
    try {
      const authorization = await issueCustomerDataExportAuthorization(
        claims.data.claims.sub,
        sessionId,
      );
      const cookieStore = await cookies();
      cookieStore.set(
        CUSTOMER_EXPORT_COOKIE,
        authorization.authorization_token,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          path: "/account/loyalty/export",
          expires: new Date(authorization.expires_at),
        },
      );
    } catch {
      return { message: copy.exportAuthorizationFailed };
    }
  }

  redirect(
    customerExportReauthentication
      ? customerExportPath(locale)
      : safeAppPath(formData.get("next")),
  );
}
