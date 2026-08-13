import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicConfig } from "./config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = readSupabasePublicConfig();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot mutate cookies. The request proxy refreshes
          // sessions before rendering and applies the required response headers.
        }
      },
    },
  });
}
