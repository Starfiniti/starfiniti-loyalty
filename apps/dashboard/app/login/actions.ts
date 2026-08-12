"use server";

import { redirect } from "next/navigation";
import { safeAppPath } from "@/lib/safe-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = Readonly<{ message: string }>;

export async function signIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 320 ||
    password.length > 1024 ||
    !email.includes("@") ||
    password.length < 8
  ) {
    return { message: "Enter a valid email address and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { message: "The email address or password was not accepted." };
  }

  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    await supabase.auth.signOut();
    return { message: "A secure session could not be established." };
  }

  redirect(safeAppPath(formData.get("next")));
}
