type RuntimeEnvironment = Readonly<{ NODE_ENV?: string }>;

export const SUPABASE_SERVER_AUTH_OPTIONS = {
  experimental: {
    appendPkceFlowIdToRedirects: true,
  },
} as const;

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
