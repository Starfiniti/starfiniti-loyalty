type RuntimeEnvironment = Readonly<{ NODE_ENV?: string }>;

export const SUPABASE_AUTH_STORAGE_KEY = "sb-api-auth-token";

export const SUPABASE_SERVER_AUTH_OPTIONS = {
  storageKey: SUPABASE_AUTH_STORAGE_KEY,
  experimental: {
    appendPkceFlowIdToRedirects: true,
  },
} as const;

export function supabasePkceVerifierCookieName(flowId: string): string {
  return `${SUPABASE_AUTH_STORAGE_KEY}-flow-${flowId}-code-verifier`;
}

export function supabaseServerCookieOptions(
  environment: RuntimeEnvironment = process.env,
) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: environment.NODE_ENV === "production",
  };
}
