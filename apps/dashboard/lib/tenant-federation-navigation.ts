import { safeAppPath } from "./safe-navigation";
import { dashboardPublicUrl } from "./workforce-sso";

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER = /^custom:loyalty-[a-z0-9]{20}$/u;

export function tenantFederationLinkCallbackUrl(
  publicOrigin: string,
  organizationId: string,
): string {
  if (!ORGANIZATION_ID.test(organizationId)) {
    throw new Error("federation_organization_invalid");
  }
  const callback = dashboardPublicUrl(publicOrigin, "/auth/link/callback");
  callback.searchParams.set("organization", organizationId);
  return callback.toString();
}

export function tenantFederationLoginCallbackUrl(
  publicOrigin: string,
  nextPath: unknown,
): string {
  const callback = dashboardPublicUrl(publicOrigin, "/auth/callback");
  callback.searchParams.set("next", safeAppPath(nextPath));
  return callback.toString();
}

export function isExpectedTenantFederationAuthorizeUrl(
  value: unknown,
  supabaseUrl: string,
  provider: string,
  mode: "link" | "login",
): value is string {
  if (typeof value !== "string" || !PROVIDER.test(provider)) return false;
  try {
    const candidate = new URL(value);
    const configured = new URL(supabaseUrl);
    const basePath = configured.pathname.replace(/\/$/u, "");
    const expectedPath =
      mode === "link"
        ? `${basePath}/auth/v1/user/identities/authorize`
        : `${basePath}/auth/v1/authorize`;
    return (
      candidate.protocol === "https:" &&
      candidate.origin === configured.origin &&
      candidate.pathname === expectedPath &&
      candidate.searchParams.get("provider") === provider
    );
  } catch {
    return false;
  }
}
