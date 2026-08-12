type PublicEnvironment = Readonly<{
  [name: string]: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}>;

export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

function isPrivilegedKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return true;

  const payload = value.split(".")[1];
  if (!payload) return false;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    return claims.role === "service_role" || claims.role === "supabase_admin";
  } catch {
    return false;
  }
}

export function readSupabasePublicConfig(
  environment: PublicEnvironment = process.env,
): SupabasePublicConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("supabase_public_config_unavailable");
  }

  if (isPrivilegedKey(publishableKey)) {
    throw new Error("supabase_public_config_privileged_key");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("supabase_public_config_invalid");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("supabase_public_config_invalid");
  }

  return { url: parsed.toString().replace(/\/$/, ""), publishableKey };
}
