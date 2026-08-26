import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthentikFederationAdminError } from "./authentik-federation-admin";
import type { FederationValidationResult } from "./federation-validation";
import { SupabaseFederationAdminError } from "./supabase-federation-admin";
import {
  applyTenantFederationAction,
  provisionTenantFederation,
} from "./tenant-federation";

vi.mock("server-only", () => ({}));

const actorId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const sourceId = "30000000-0000-4000-8000-000000000001";
const correlationId = "40000000-0000-4000-8000-000000000001";
const sourceSlug = "loyalty-0123456789abcdefghij";
const providerIdentifier = `custom:${sourceSlug}`;
const upstreamSecret = "upstream-secret-value";

const createCommand = {
  version: "1",
  organizationId,
  displayName: "Company SSO",
  configuration: {
    protocol: "oidc",
    discoveryUrl: "https://idp.vendor.com/.well-known/openid-configuration",
    clientId: "tenant-client",
  },
  clientSecretSha256: sha256(upstreamSecret),
  idempotencyKey: "federation-create-1",
  correlationId,
} as const;

const validation = {
  evidence: {
    schemaVersion: "1",
    protocol: "oidc",
    configurationSha256: "a".repeat(64),
    documentSha256: "b".repeat(64),
    issuer: "https://idp.vendor.com",
    authorizationEndpoint: "https://idp.vendor.com/authorize",
    tokenEndpoint: "https://idp.vendor.com/token",
    jwksUri: "https://idp.vendor.com/jwks",
    ssoEndpoint: null,
    signingFingerprints: ["c".repeat(64)],
    validatedAt: "2026-08-26T13:00:00.000Z",
  },
  provisioning: {
    protocol: "oidc",
    userinfoEndpoint: "https://idp.vendor.com/userinfo",
    authorizationCodeAuthMethod: "basic_auth",
    pkce: "S256",
    jwks: { keys: [{ kty: "RSA", n: "abc", e: "AQAB", use: "sig" }] },
  },
} satisfies FederationValidationResult;

const resources = {
  sourcePublicId: "50000000-0000-4000-8000-000000000001",
  providerId: 701,
  applicationSlug: sourceSlug,
  flowPublicId: "50000000-0000-4000-8000-000000000002",
  oauthCallbackUrl: `https://auth.starfiniti.com/source/oauth/callback/${sourceSlug}/`,
  samlMetadataUrl: null,
  samlAcsUrl: null,
} as const;

describe("tenant federation orchestration", () => {
  it("provisions both brokers disabled before recording validated selectors", async () => {
    const order: string[] = [];
    const dependencies = provisioningDependencies(order);

    const result = await provisionTenantFederation(
      actorId,
      createCommand,
      upstreamSecret,
      dependencies,
    );

    expect(order).toEqual([
      "prepare",
      "validate",
      "authentik-reconcile",
      "supabase-reconcile",
      "record-validation",
    ]);
    expect(dependencies.authentik.reconcileDisabled).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSlug,
        upstreamClientSecret: upstreamSecret,
        brokerClientSecret: "broker-secret-value",
      }),
    );
    expect(dependencies.supabase.reconcileDisabled).toHaveBeenCalledWith(
      providerIdentifier,
      sourceSlug,
      "broker-secret-value",
    );
    expect(dependencies.recordValidation).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        sourceId,
        authentikSourcePublicId: resources.sourcePublicId,
        authentikProviderId: 701,
        externalOutcome: "succeeded",
        externalDetailCode: "validated",
      }),
    );
    expect(result.mutation.status).toBe("validated");
    expect(result.setup?.oauthCallbackUrl).toContain(sourceSlug);
  });

  it("records review_required after an ambiguous Supabase mutation", async () => {
    const dependencies = provisioningDependencies([]);
    dependencies.supabase.reconcileDisabled.mockRejectedValueOnce(
      new SupabaseFederationAdminError("supabase_auth_ambiguous", "ambiguous"),
    );

    await expect(
      provisionTenantFederation(
        actorId,
        createCommand,
        upstreamSecret,
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "federation_external_review_required",
    });
    expect(dependencies.recordValidation).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        authentikSourcePublicId: resources.sourcePublicId,
        authentikProviderId: 701,
        externalOutcome: "ambiguous",
        externalDetailCode: "supabase_auth_ambiguous",
      }),
    );
  });

  it("rejects a mismatched write-only secret before database preparation", async () => {
    const dependencies = provisioningDependencies([]);

    await expect(
      provisionTenantFederation(
        actorId,
        createCommand,
        "different-secret",
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "federation_input_invalid",
    });
    expect(dependencies.prepare).not.toHaveBeenCalled();
    expect(dependencies.authentik.reconcileDisabled).not.toHaveBeenCalled();
  });

  it("enables Supabase before Authentik and records completion last", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);

    const result = await applyTenantFederationAction(
      actorId,
      lifecycleCommand("enable"),
      null,
      dependencies,
    );

    expect(order).toEqual([
      "projection",
      "revalidate",
      "begin",
      "supabase-true",
      "authentik-true",
      "complete",
    ]);
    expect(dependencies.complete).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        action: "enable",
        externalOutcome: "succeeded",
        externalDetailCode: "enable",
      }),
    );
    expect(result.status).toBe("enabled");
  });

  it("compensates Supabase when Authentik enablement fails", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);
    dependencies.authentik.setEnabled.mockImplementationOnce(async () => {
      order.push("authentik-true");
      throw new AuthentikFederationAdminError("authentik_rejected", "failed");
    });

    await expect(
      applyTenantFederationAction(
        actorId,
        lifecycleCommand("enable"),
        null,
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "federation_external_failed",
    });
    expect(order).toEqual([
      "projection",
      "revalidate",
      "begin",
      "supabase-true",
      "authentik-true",
      "supabase-false",
      "complete",
    ]);
    expect(dependencies.complete).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        externalOutcome: "failed",
        externalDetailCode: "authentik_rejected",
      }),
    );
  });

  it("rejects changed provider evidence before reserving enablement", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);
    dependencies.validate.mockImplementationOnce(async () => {
      order.push("revalidate");
      return {
        ...validation,
        evidence: {
          ...validation.evidence,
          documentSha256: "d".repeat(64),
        },
      };
    });

    await expect(
      applyTenantFederationAction(
        actorId,
        lifecycleCommand("enable"),
        null,
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "federation_validation_required" });
    expect(order).toEqual(["projection", "revalidate"]);
    expect(dependencies.begin).not.toHaveBeenCalled();
    expect(dependencies.supabase.setEnabled).not.toHaveBeenCalled();
  });

  it("keeps an exact completed retry independent from IdP availability", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);
    dependencies.getProjection.mockImplementationOnce(async () => {
      order.push("projection");
      return {
        resourceId: sourceId,
        protocol: "oidc",
        status: "enabled",
        revision: 4,
        authentikSourceSlug: sourceSlug,
        supabaseProviderIdentifier: providerIdentifier,
        pendingAction: null,
        configurationSha256: validation.evidence.configurationSha256,
        configuration: createCommand.configuration,
        validationEvidence: validation.evidence,
      };
    });
    dependencies.begin.mockImplementationOnce(async () => {
      order.push("begin");
      return {
        resourceId: sourceId,
        outcome: "duplicate",
        revision: 4,
        status: "enabled",
      };
    });

    const result = await applyTenantFederationAction(
      actorId,
      lifecycleCommand("enable"),
      null,
      dependencies,
    );

    expect(order).toEqual(["projection", "begin"]);
    expect(dependencies.validate).not.toHaveBeenCalled();
    expect(dependencies.authentik.setEnabled).not.toHaveBeenCalled();
    expect(result.status).toBe("enabled");
  });

  it("records an ambiguous outcome when enablement compensation is uncertain", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);
    dependencies.authentik.setEnabled.mockRejectedValueOnce(
      new AuthentikFederationAdminError("authentik_rejected", "failed"),
    );
    dependencies.supabase.setEnabled
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(
        new SupabaseFederationAdminError(
          "supabase_auth_ambiguous",
          "ambiguous",
        ),
      );

    await expect(
      applyTenantFederationAction(
        actorId,
        lifecycleCommand("enable"),
        null,
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "federation_external_review_required",
    });
    expect(dependencies.complete).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        externalOutcome: "ambiguous",
        externalDetailCode: "supabase_auth_ambiguous",
      }),
    );
  });

  it("hides the resolver in the database before disabling both brokers", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);

    await applyTenantFederationAction(
      actorId,
      lifecycleCommand("disable"),
      null,
      dependencies,
    );

    expect(order.slice(0, 2)).toEqual(["projection", "begin"]);
    expect(order.at(-1)).toBe("complete");
    expect(order).toContain("authentik-false");
    expect(order).toContain("supabase-false");
  });

  it("recovers an interrupted reservation without another external call", async () => {
    const order: string[] = [];
    const dependencies = lifecycleDependencies(order);
    const command = {
      ...lifecycleCommand("disable"),
      action: "recover" as const,
      reason: "Recover the interrupted federation operation.",
    };

    const result = await applyTenantFederationAction(
      actorId,
      command,
      null,
      dependencies,
    );

    expect(order).toEqual(["projection", "recover"]);
    expect(dependencies.begin).not.toHaveBeenCalled();
    expect(dependencies.authentik.setEnabled).not.toHaveBeenCalled();
    expect(dependencies.supabase.setEnabled).not.toHaveBeenCalled();
    expect(result.status).toBe("review_required");
  });
});

function provisioningDependencies(order: string[]) {
  return {
    prepare: vi.fn(async () => {
      order.push("prepare");
      return {
        resourceId: sourceId,
        outcome: "applied",
        revision: 1,
        status: "draft",
        authentikSourceSlug: sourceSlug,
        supabaseProviderIdentifier: providerIdentifier,
        configurationSha256: "a".repeat(64),
      };
    }),
    recordValidation: vi.fn(async () => {
      order.push("record-validation");
      return {
        resourceId: sourceId,
        outcome: "applied",
        revision: 2,
        status: "validated",
      };
    }),
    getProjection: vi.fn(),
    begin: vi.fn(),
    recover: vi.fn(),
    complete: vi.fn(),
    validate: vi.fn(async () => {
      order.push("validate");
      return validation;
    }),
    authentik: {
      reconcileDisabled: vi.fn(async () => {
        order.push("authentik-reconcile");
        return resources;
      }),
      rotateOidcSecret: vi.fn(),
      setEnabled: vi.fn(),
    },
    supabase: {
      reconcileDisabled: vi.fn(async () => {
        order.push("supabase-reconcile");
        return providerIdentifier;
      }),
      setEnabled: vi.fn(),
    },
    brokerSecret: () => "broker-secret-value",
  };
}

function lifecycleDependencies(order: string[]) {
  return {
    prepare: vi.fn(),
    recordValidation: vi.fn(),
    getProjection: vi.fn(async () => {
      order.push("projection");
      return {
        resourceId: sourceId,
        protocol: "oidc" as const,
        status: "validated",
        revision: 2,
        authentikSourceSlug: sourceSlug,
        supabaseProviderIdentifier: providerIdentifier,
        pendingAction: null,
        configurationSha256: validation.evidence.configurationSha256,
        configuration: createCommand.configuration,
        validationEvidence: validation.evidence,
      };
    }),
    begin: vi.fn(async () => {
      order.push("begin");
      return {
        resourceId: sourceId,
        outcome: "applied",
        revision: 3,
        status: "validated",
      };
    }),
    recover: vi.fn(async () => {
      order.push("recover");
      return {
        resourceId: sourceId,
        outcome: "updated",
        revision: 4,
        status: "review_required",
      };
    }),
    complete: vi.fn(async (_actor, input) => {
      order.push("complete");
      return {
        resourceId: sourceId,
        outcome: "applied",
        revision: 4,
        status: input.action === "enable" ? "enabled" : "disabled",
      };
    }),
    validate: vi.fn(async () => {
      order.push("revalidate");
      return validation;
    }),
    authentik: {
      reconcileDisabled: vi.fn(),
      rotateOidcSecret: vi.fn(),
      setEnabled: vi.fn(async (_slug: string, enabled: boolean) => {
        order.push(`authentik-${enabled}`);
      }),
    },
    supabase: {
      reconcileDisabled: vi.fn(),
      setEnabled: vi.fn(async (_identifier: string, enabled: boolean) => {
        order.push(`supabase-${enabled}`);
      }),
    },
    brokerSecret: () => "broker-secret-value",
  };
}

function lifecycleCommand(action: "enable" | "disable") {
  return {
    version: "1",
    organizationId,
    sourceId,
    expectedRevision: 2,
    action,
    clientSecretSha256: null,
    reason: `${action} company federation`,
    idempotencyKey: `federation-${action}-1`,
    correlationId,
  } as const;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
