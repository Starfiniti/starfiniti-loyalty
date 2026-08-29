import { beforeEach, describe, expect, it, vi } from "vitest";

const provisionTenantFederation = vi.hoisted(() => vi.fn());
const applyTenantFederationAction = vi.hoisted(() => vi.fn());
const fingerprintUpstreamClientSecret = vi.hoisted(() =>
  vi.fn(() => "f".repeat(64)),
);
const revalidatePath = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
}));
vi.mock("@/lib/server/enterprise-identity", () => ({
  getOrganizationFederationWorkspace: vi.fn(),
  resolveOrganizationFederationLogin: vi.fn(),
}));
vi.mock("@/lib/server/tenant-federation", () => {
  class TenantFederationError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    applyTenantFederationAction,
    fingerprintUpstreamClientSecret,
    provisionTenantFederation,
    TenantFederationError,
  };
});

import {
  createFederationSourceAction,
  updateFederationSourceAction,
} from "./federation-actions";

const actorId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const sourceId = "30000000-0000-4000-8000-000000000001";
const operationId = "40000000-0000-4000-8000-000000000001";
const secret = "write-only-upstream-secret";
const idle = { kind: "idle", message: "", setup: null } as const;

describe("federation server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaims.mockResolvedValue({
      data: { claims: { sub: actorId } },
      error: null,
    });
  });

  it("passes only a secret digest inside the versioned OIDC command", async () => {
    provisionTenantFederation.mockResolvedValue({
      mutation: {
        resourceId: sourceId,
        outcome: "updated",
        revision: 2,
        status: "validated",
      },
      setup: {
        oauthCallbackUrl:
          "https://auth.starfiniti.com/source/oauth/callback/loyalty-example/",
        samlMetadataUrl: null,
        samlAcsUrl: null,
      },
    });
    const form = oidcForm();

    const result = await createFederationSourceAction(idle, form);

    expect(result.kind).toBe("success");
    expect(provisionTenantFederation).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        organizationId,
        clientSecretSha256: "f".repeat(64),
        idempotencyKey: `federation:create:${operationId}`,
      }),
      secret,
    );
    expect(fingerprintUpstreamClientSecret).toHaveBeenCalledWith(secret);
    const command = provisionTenantFederation.mock.calls[0]?.[1];
    expect(JSON.stringify(command)).not.toContain(secret);
    expect(revalidatePath).toHaveBeenCalledWith("/organization/access");
  });

  it("rejects a missing confirmation before reading the session", async () => {
    const form = oidcForm();
    form.set("confirmation", "no");

    await expect(
      createFederationSourceAction(idle, form),
    ).resolves.toMatchObject({
      kind: "error",
    });
    expect(getClaims).not.toHaveBeenCalled();
    expect(provisionTenantFederation).not.toHaveBeenCalled();
  });

  it("does not read fingerprint authority for an unauthenticated caller", async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: {} }, error: null });

    await expect(
      createFederationSourceAction(idle, oidcForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("authenticated organization authority"),
    });
    expect(fingerprintUpstreamClientSecret).not.toHaveBeenCalled();
    expect(provisionTenantFederation).not.toHaveBeenCalled();
  });

  it("fails closed after authentication when fingerprint authority is unavailable", async () => {
    fingerprintUpstreamClientSecret.mockImplementationOnce(() => {
      throw new Error("fingerprint key unavailable");
    });

    await expect(
      createFederationSourceAction(idle, oidcForm()),
    ).resolves.toMatchObject({
      kind: "error",
      message: expect.stringContaining("No provider was enabled"),
    });
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(provisionTenantFederation).not.toHaveBeenCalled();
  });

  it("does not encourage retries after an ambiguous provider write", async () => {
    const { TenantFederationError } =
      await import("@/lib/server/tenant-federation");
    provisionTenantFederation.mockRejectedValue(
      new TenantFederationError("federation_external_review_required" as never),
    );

    const result = await createFederationSourceAction(idle, oidcForm());

    expect(result).toMatchObject({
      kind: "error",
      message: expect.stringContaining("do not retry blindly"),
    });
    expect(provisionTenantFederation).toHaveBeenCalledTimes(1);
  });

  it("derives the actor and sends no secret for enablement", async () => {
    applyTenantFederationAction.mockResolvedValue({
      resourceId: sourceId,
      outcome: "updated",
      revision: 4,
      status: "enabled",
    });
    const form = new FormData();
    form.set("organizationId", organizationId);
    form.set("sourceId", sourceId);
    form.set("expectedRevision", "2");
    form.set("operationId", operationId);
    form.set("federationAction", "enable");
    form.set("reason", "Enable after successful tenant acceptance test");
    form.set("confirmation", "federation-lifecycle");

    const result = await updateFederationSourceAction(idle, form);

    expect(result.kind).toBe("success");
    expect(applyTenantFederationAction).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        action: "enable",
        clientSecretSha256: null,
        expectedRevision: 2,
      }),
      null,
    );
  });

  it("accepts an owner-confirmed interrupted-operation recovery", async () => {
    applyTenantFederationAction.mockResolvedValue({
      resourceId: sourceId,
      outcome: "updated",
      revision: 4,
      status: "review_required",
    });
    const form = new FormData();
    form.set("organizationId", organizationId);
    form.set("sourceId", sourceId);
    form.set("expectedRevision", "3");
    form.set("operationId", operationId);
    form.set("federationAction", "recover");
    form.set("reason", "Recover an interrupted provider operation.");
    form.set("confirmation", "federation-lifecycle");

    const result = await updateFederationSourceAction(idle, form);

    expect(result.kind).toBe("success");
    expect(applyTenantFederationAction).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        action: "recover",
        clientSecretSha256: null,
        expectedRevision: 3,
      }),
      null,
    );
  });
});

function oidcForm(): FormData {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("operationId", operationId);
  form.set("protocol", "oidc");
  form.set("displayName", "Company SSO");
  form.set(
    "discoveryUrl",
    "https://idp.vendor.com/.well-known/openid-configuration",
  );
  form.set("clientId", "tenant-client");
  form.set("clientSecret", secret);
  form.set("confirmation", "create-federation");
  return form;
}
