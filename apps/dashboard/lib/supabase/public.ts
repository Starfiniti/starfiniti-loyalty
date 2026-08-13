import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "./config";

export function createPublicSupabaseClient() {
  const config = readSupabasePublicConfig();
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
