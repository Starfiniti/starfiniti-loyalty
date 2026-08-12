"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  merchantLocalePath,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";

export async function signOut(formData: FormData): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(
    merchantLocalePath("/login", resolveMerchantLocale(formData.get("lang"))),
  );
}
