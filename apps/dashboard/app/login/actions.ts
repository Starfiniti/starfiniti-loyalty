"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CUSTOMER_COPY, resolveCustomerLocale } from "@/lib/customer-locale";
import {
  customerExportPath,
  isSupabaseSessionId,
} from "@/lib/customer-export";
import {
  CUSTOMER_EXPORT_COOKIE,
  issueCustomerDataExportAuthorization,
} from "@/lib/server/customer-data-export";

export type LoginState = Readonly<{ message: string }>;

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
