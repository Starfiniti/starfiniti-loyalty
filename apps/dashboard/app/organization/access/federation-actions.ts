"use server";

import {
  createOrganizationFederationSourceCommandV1,
  organizationFederationSourceCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getOrganizationFederationWorkspace,
  resolveOrganizationFederationLogin,
} from "@/lib/server/enterprise-identity";
import { readSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyTenantFederationAction,
  fingerprintUpstreamClientSecret,
  provisionTenantFederation,
  TenantFederationError,
} from "@/lib/server/tenant-federation";
import {
  isExpectedTenantFederationAuthorizeUrl,
  tenantFederationLinkCallbackUrl,
} from "@/lib/tenant-federation-navigation";

export type FederationActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  setup: Readonly<{
    oauthCallbackUrl: string | null;
    samlMetadataUrl: string | null;
    samlAcsUrl: string | null;
  }> | null;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const USER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function linkFederationIdentityAction(
  formData: FormData,
): Promise<never> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (!USER_UUID.test(organizationId) || !publicOrigin) {
    redirect(federationLinkFailurePath("request_invalid"));
  }

  let authorizationUrl: string | null = null;
  let provider = "";
  let supabaseUrl = "";
  let failureReason: string | null = null;
  try {
    const workspace = await getOrganizationFederationWorkspace(organizationId);
    if (
      !workspace ||
      !workspace.sources.some(({ status }) => status === "enabled")
    ) {
      failureReason = "membership_unavailable";
    } else {
      const login = await resolveOrganizationFederationLogin(
        workspace.organization.slug,
      );
      if (!login) {
        failureReason = "provider_unavailable";
      } else {
        provider = login.provider;
        const config = readSupabasePublicConfig();
        supabaseUrl = config.url;
        const supabase = await createSupabaseServerClient();
        const claims = await supabase.auth.getClaims();
        if (
          claims.error ||
          typeof claims.data?.claims?.sub !== "string" ||
          !USER_UUID.test(claims.data.claims.sub)
        ) {
          failureReason = "session_unavailable";
        } else {
          const result = await supabase.auth.linkIdentity({
            provider: provider as `custom:${string}`,
            options: {
              redirectTo: tenantFederationLinkCallbackUrl(
                publicOrigin,
                organizationId,
              ),
              scopes: "openid",
              skipBrowserRedirect: true,
            },
          });
          if (!result.error) authorizationUrl = result.data.url;
        }
      }
    }
  } catch {
    failureReason = "provider_unavailable";
  }

  if (failureReason) redirect(federationLinkFailurePath(failureReason));
  if (
    !isExpectedTenantFederationAuthorizeUrl(
      authorizationUrl,
      supabaseUrl,
      provider,
      "link",
    )
  ) {
    redirect(federationLinkFailurePath("authorization_rejected"));
  }
  redirect(authorizationUrl);
}

export async function createFederationSourceAction(
  _previous: FederationActionState,
  formData: FormData,
): Promise<FederationActionState> {
  const operation = operationId(formData);
  const protocol = String(formData.get("protocol") ?? "");
  const rawSecret = protocol === "oidc" ? secret(formData) : null;
  if (
    formData.get("confirmation") !== "create-federation" ||
    !operation ||
    !["oidc", "saml"].includes(protocol) ||
    (protocol === "oidc" && rawSecret === null)
  ) {
    return failure(
      "Review the provider details and confirm the trust boundary.",
    );
  }

  const configuration =
    protocol === "oidc"
      ? {
          protocol,
          discoveryUrl: formData.get("discoveryUrl"),
          clientId: formData.get("clientId"),
        }
      : {
          protocol,
          metadataUrl: formData.get("metadataUrl"),
          expectedEntityId:
            String(formData.get("expectedEntityId") ?? "").trim() || null,
        };
  let actorUserId: string;
  let clientSecretSha256: string | null;
  try {
    actorUserId = await authenticatedActor();
    clientSecretSha256 =
      rawSecret === null ? null : fingerprintUpstreamClientSecret(rawSecret);
  } catch (error) {
    return failure(federationFailureMessage(error));
  }
  const command = createOrganizationFederationSourceCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    displayName: formData.get("displayName"),
    configuration,
    clientSecretSha256,
    idempotencyKey: `federation:create:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      protocol === "oidc"
        ? "Enter an HTTPS discovery URL, client ID, and write-only client secret."
        : "Enter an HTTPS metadata URL and optional exact entity ID.",
    );
  }

  try {
    const result = await provisionTenantFederation(
      actorUserId,
      command.data,
      rawSecret,
    );
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message:
        "Provider validated and staged disabled. Finish the upstream callback configuration, then enable it.",
      setup: result.setup,
    };
  } catch (error) {
    return failure(federationFailureMessage(error));
  }
}

export async function updateFederationSourceAction(
  _previous: FederationActionState,
  formData: FormData,
): Promise<FederationActionState> {
  const operation = operationId(formData);
  const action = String(formData.get("federationAction") ?? "");
  const revision = expectedRevision(formData);
  const rawSecret = action === "rotate_secret" ? secret(formData) : null;
  if (
    formData.get("confirmation") !== "federation-lifecycle" ||
    !operation ||
    !revision ||
    !["enable", "disable", "rotate_secret", "retire", "recover"].includes(
      action,
    ) ||
    (action === "rotate_secret" && rawSecret === null)
  ) {
    return failure("Review and confirm the federation lifecycle change.");
  }
  let actorUserId: string;
  let clientSecretSha256: string | null;
  try {
    actorUserId = await authenticatedActor();
    clientSecretSha256 =
      rawSecret === null ? null : fingerprintUpstreamClientSecret(rawSecret);
  } catch (error) {
    return failure(federationFailureMessage(error));
  }
  const command = organizationFederationSourceCommandV1.safeParse({
    version: "1",
    organizationId: formData.get("organizationId"),
    sourceId: formData.get("sourceId"),
    expectedRevision: revision,
    action,
    clientSecretSha256,
    reason: formData.get("reason"),
    idempotencyKey: `federation:${action}:${revision}:${operation}`,
    correlationId: operation,
  });
  if (!command.success) {
    return failure(
      "Enter an 8–500 character reason and the new secret when rotating.",
    );
  }

  try {
    const result = await applyTenantFederationAction(
      actorUserId,
      command.data,
      rawSecret,
    );
    revalidatePath("/organization/access");
    return {
      kind: "success",
      message: `Federation ${action.replaceAll("_", " ")} completed at revision ${result.revision}.`,
      setup: null,
    };
  } catch (error) {
    return failure(federationFailureMessage(error));
  }
}

async function authenticatedActor(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const subject = claims.data?.claims?.sub;
  if (claims.error || typeof subject !== "string" || !USER_UUID.test(subject)) {
    throw new TenantFederationError("federation_orchestration_unavailable");
  }
  return subject;
}

function secret(formData: FormData): string | null {
  const value = formData.get("clientSecret");
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 8_192 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }
  return value;
}

function operationId(formData: FormData): string | null {
  const value = String(formData.get("operationId") ?? "");
  return UUID_V4.test(value) ? value : null;
}

function expectedRevision(formData: FormData): number | null {
  const value = String(formData.get("expectedRevision") ?? "");
  if (!/^[1-9][0-9]{0,14}$/u.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

function failure(message: string): FederationActionState {
  return { kind: "error", message, setup: null };
}

function federationFailureMessage(error: unknown): string {
  if (error instanceof TenantFederationError) {
    if (error.code === "federation_external_review_required") {
      return "The provider returned an uncertain result. It is disabled and marked for review; do not retry blindly.";
    }
    if (error.code === "federation_input_invalid") {
      return "The write-only secret did not match this request.";
    }
    if (error.code === "federation_orchestration_unavailable") {
      return "Your authenticated organization authority could not be verified.";
    }
    if (error.code === "federation_validation_required") {
      return "The provider metadata or signing evidence changed or could not be revalidated. Keep it disabled and review the upstream configuration.";
    }
    return "The external identity configuration was rejected and remains disabled.";
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "42501") {
    return "Your live organization membership or enterprise identity rollout no longer permits this action.";
  }
  if (code === "40001") {
    return "This provider changed or an interrupted operation is still inside its recovery window. Refresh before trying again.";
  }
  if (code === "23514") {
    return "The provider state or local owner recovery requirement blocks this change.";
  }
  return "Federation management is unavailable. No provider was enabled.";
}

function federationLinkFailurePath(reason: string): string {
  const parameters = new URLSearchParams({ federationLink: "failed", reason });
  return `/organization/access?${parameters.toString()}`;
}
