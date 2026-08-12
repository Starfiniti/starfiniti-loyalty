"use server";

import { redirect } from "next/navigation";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CUSTOMER_COPY, resolveCustomerLocale } from "@/lib/customer-locale";

export type LoginState = Readonly<{ message: string }>;

export async function signIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const locale = resolveCustomerLocale(formData.get("lang"));
  const copy = CUSTOMER_COPY[locale];
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

  redirect(safeAppPath(formData.get("next")));
}
