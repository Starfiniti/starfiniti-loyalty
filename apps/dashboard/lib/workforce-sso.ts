import { safeAppPath } from "./safe-navigation";

export const STARFINITI_WORKFORCE_PROVIDER = "custom:starfiniti-sso" as const;

export const WORKFORCE_SSO_COPY = {
  en: {
    button: "Continue with Starfiniti SSO",
    divider: "Starfiniti team",
    failed: "Starfiniti SSO could not be started. Please try again.",
  },
} as const;

function parseCanonicalOrigin(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("dashboard_public_origin_invalid");
  }

  const localDevelopmentOrigin =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (
    (parsed.protocol !== "https:" && !localDevelopmentOrigin) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== value
  ) {
    throw new Error("dashboard_public_origin_invalid");
  }

  return parsed;
}

export function workforceSsoCallbackUrl(
  publicOrigin: string,
  nextPath: unknown,
): string {
  const callback = new URL(
    "/auth/callback",
    parseCanonicalOrigin(publicOrigin),
  );
  callback.searchParams.set("next", safeAppPath(nextPath));
  return callback.toString();
}

export function isExpectedWorkforceAuthorizeUrl(
  value: unknown,
  supabaseUrl: string,
): value is string {
  if (typeof value !== "string") return false;

  try {
    const candidate = new URL(value);
    const configured = new URL(supabaseUrl);
    const configuredPath = configured.pathname.replace(/\/$/, "");
    return (
      candidate.origin === configured.origin &&
      candidate.pathname === `${configuredPath}/auth/v1/authorize` &&
      candidate.searchParams.get("provider") === STARFINITI_WORKFORCE_PROVIDER
    );
  } catch {
    return false;
  }
}
