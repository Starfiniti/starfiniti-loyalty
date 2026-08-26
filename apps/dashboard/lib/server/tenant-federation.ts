import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  CreateOrganizationFederationSourceCommandV1,
  OrganizationFederationSourceCommandV1,
  OrganizationFederationValidationEvidenceV1,
} from "@starfiniti/contracts";
import {
  AuthentikFederationAdmin,
  AuthentikFederationAdminError,
  type AuthentikFederationResources,
} from "./authentik-federation-admin";
import { readFederationManagementConfig } from "./federation-management-config";
import { validateOrganizationFederationProvisioning } from "./federation-validation";
import {
  SupabaseFederationAdmin,
  SupabaseFederationAdminError,
} from "./supabase-federation-admin";
import {
  beginFederationAction,
  completeFederationAction,
  getFederationOrchestrationProjection,
  prepareFederationSource,
  recoverFederationPendingAction,
  recordFederationValidation,
  type FederationMutation,
} from "./tenant-federation-database";

export type FederationProvisioningResult = Readonly<{
  mutation: FederationMutation;
  setup: Readonly<{
    oauthCallbackUrl: string | null;
    samlMetadataUrl: string | null;
    samlAcsUrl: string | null;
  }> | null;
}>;

export class TenantFederationError extends Error {
  constructor(
    readonly code:
      | "federation_external_failed"
      | "federation_external_review_required"
      | "federation_input_invalid"
      | "federation_orchestration_unavailable"
      | "federation_validation_required",
  ) {
    super(code);
  }
}

type Dependencies = Readonly<{
  prepare: typeof prepareFederationSource;
  recordValidation: typeof recordFederationValidation;
  getProjection: typeof getFederationOrchestrationProjection;
  begin: typeof beginFederationAction;
  recover: typeof recoverFederationPendingAction;
  complete: typeof completeFederationAction;
  validate: typeof validateOrganizationFederationProvisioning;
  authentik: Pick<
    AuthentikFederationAdmin,
    "reconcileDisabled" | "rotateOidcSecret" | "setEnabled"
  >;
  supabase: Pick<SupabaseFederationAdmin, "reconcileDisabled" | "setEnabled">;
  brokerSecret: () => string;
}>;

export async function provisionTenantFederation(
  actorUserId: string,
  command: CreateOrganizationFederationSourceCommandV1,
  upstreamClientSecret: string | null,
  dependencies: Dependencies = productionDependencies(),
): Promise<FederationProvisioningResult> {
  assertSecret(command.clientSecretSha256, upstreamClientSecret);
  const prepared = await dependencies.prepare(actorUserId, command);
  if (prepared.outcome === "duplicate" && prepared.status !== "draft") {
    if (prepared.status === "review_required") {
      throw new TenantFederationError("federation_external_review_required");
    }
    return { mutation: prepared, setup: null };
  }

  const validation = await dependencies.validate(
    command.configuration,
    prepared.configurationSha256,
  );
  const brokerSecret = dependencies.brokerSecret();
  const brokerSecretSha256 = sha256(brokerSecret);
  let authentikResources: AuthentikFederationResources | null = null;
  let externalError: unknown;
  try {
    authentikResources = await dependencies.authentik.reconcileDisabled({
      sourceSlug: prepared.authentikSourceSlug,
      configuration: command.configuration,
      evidence: validation.evidence,
      provisioning: validation.provisioning,
      upstreamClientSecret,
      brokerClientSecret: brokerSecret,
    });
    await dependencies.supabase.reconcileDisabled(
      prepared.supabaseProviderIdentifier,
      authentikResources.applicationSlug,
      brokerSecret,
    );
  } catch (error) {
    externalError = error;
  }

  const external = externalOutcome(externalError);
  const mutation = await dependencies.recordValidation(actorUserId, {
    sourceId: prepared.resourceId,
    expectedRevision: prepared.revision,
    evidence: validation.evidence,
    brokerSecretSha256,
    authentikSourcePublicId: authentikResources?.sourcePublicId ?? null,
    authentikProviderId: authentikResources?.providerId ?? null,
    externalOutcome: external.outcome,
    externalDetailCode: external.detailCode,
    idempotencyKey: phaseKey("validate", command.correlationId),
    correlationId: command.correlationId,
  });
  if (externalError) {
    throw new TenantFederationError(
      external.outcome === "ambiguous"
        ? "federation_external_review_required"
        : "federation_external_failed",
    );
  }
  return {
    mutation,
    setup: authentikResources
      ? {
          oauthCallbackUrl: authentikResources.oauthCallbackUrl,
          samlMetadataUrl: authentikResources.samlMetadataUrl,
          samlAcsUrl: authentikResources.samlAcsUrl,
        }
      : null,
  };
}

export async function applyTenantFederationAction(
  actorUserId: string,
  command: OrganizationFederationSourceCommandV1,
  upstreamClientSecret: string | null,
  dependencies: Dependencies = productionDependencies(),
): Promise<FederationMutation> {
  assertSecret(command.clientSecretSha256, upstreamClientSecret);
  const projection = await dependencies.getProjection(
    actorUserId,
    command.organizationId,
    command.sourceId,
  );
  if (!projection) {
    throw new TenantFederationError("federation_orchestration_unavailable");
  }
  if (command.action === "recover") {
    return dependencies.recover(actorUserId, command);
  }
  if (
    command.action === "enable" &&
    projection.revision === command.expectedRevision
  ) {
    await assertCurrentValidation(projection, dependencies.validate);
  }
  const begun = await dependencies.begin(actorUserId, command);
  if (
    begun.outcome === "duplicate" &&
    projection.pendingAction === null &&
    begun.revision !== command.expectedRevision + 1
  ) {
    return begun;
  }

  let lifecycleError: unknown;
  try {
    if (command.action === "enable") {
      await dependencies.supabase.setEnabled(
        projection.supabaseProviderIdentifier,
        true,
      );
      try {
        await dependencies.authentik.setEnabled(
          projection.authentikSourceSlug,
          true,
        );
      } catch (error) {
        const compensationError = await disableSupabaseAfterFailedAuthentik(
          dependencies.supabase,
          projection.supabaseProviderIdentifier,
        );
        throw compensationError && isAmbiguousExternalError(compensationError)
          ? compensationError
          : error;
      }
    } else {
      const disableError = await disableExternalFederation(
        dependencies,
        projection.authentikSourceSlug,
        projection.supabaseProviderIdentifier,
      );
      if (disableError) throw disableError;
      if (command.action === "rotate_secret") {
        if (projection.protocol !== "oidc" || upstreamClientSecret === null) {
          throw new TenantFederationError("federation_input_invalid");
        }
        await dependencies.authentik.rotateOidcSecret(
          projection.authentikSourceSlug,
          upstreamClientSecret,
        );
      }
    }
  } catch (error) {
    lifecycleError = error;
  }

  const external = externalOutcome(lifecycleError, command.action);
  const completed = await dependencies.complete(actorUserId, {
    sourceId: command.sourceId,
    expectedRevision: begun.revision,
    action: command.action,
    externalOutcome: external.outcome,
    externalDetailCode: external.detailCode,
    idempotencyKey: phaseKey(
      `complete-${command.action}`,
      command.correlationId,
    ),
    correlationId: command.correlationId,
  });
  if (lifecycleError) {
    throw new TenantFederationError(
      external.outcome === "ambiguous"
        ? "federation_external_review_required"
        : "federation_external_failed",
    );
  }
  return completed;
}

async function assertCurrentValidation(
  projection: NonNullable<
    Awaited<ReturnType<typeof getFederationOrchestrationProjection>>
  >,
  validate: Dependencies["validate"],
): Promise<void> {
  if (!projection.validationEvidence) {
    throw new TenantFederationError("federation_validation_required");
  }
  try {
    const current = await validate(
      projection.configuration,
      projection.configurationSha256,
    );
    if (
      validationContinuity(current.evidence) !==
      validationContinuity(projection.validationEvidence)
    ) {
      throw new TenantFederationError("federation_validation_required");
    }
  } catch (error) {
    if (
      error instanceof TenantFederationError &&
      error.code === "federation_validation_required"
    ) {
      throw error;
    }
    throw new TenantFederationError("federation_validation_required");
  }
}

function validationContinuity(
  evidence: OrganizationFederationValidationEvidenceV1,
): string {
  return JSON.stringify({
    schemaVersion: evidence.schemaVersion,
    protocol: evidence.protocol,
    configurationSha256: evidence.configurationSha256,
    documentSha256: evidence.documentSha256,
    issuer: evidence.issuer,
    authorizationEndpoint: evidence.authorizationEndpoint,
    tokenEndpoint: evidence.tokenEndpoint,
    jwksUri: evidence.jwksUri,
    ssoEndpoint: evidence.ssoEndpoint,
    signingFingerprints: evidence.signingFingerprints,
  });
}

async function disableExternalFederation(
  dependencies: Dependencies,
  sourceSlug: string,
  providerIdentifier: string,
): Promise<unknown | null> {
  const outcomes = await Promise.allSettled([
    dependencies.authentik.setEnabled(sourceSlug, false),
    dependencies.supabase.setEnabled(providerIdentifier, false),
  ]);
  const failures = outcomes
    .filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    )
    .map(({ reason }) => reason);
  return failures.find(isAmbiguousExternalError) ?? failures[0] ?? null;
}

async function disableSupabaseAfterFailedAuthentik(
  admin: Dependencies["supabase"],
  identifier: string,
): Promise<unknown | null> {
  try {
    await admin.setEnabled(identifier, false);
    return null;
  } catch (error) {
    // Resolver activation remains pending. An ambiguous compensation must
    // supersede a definite Authentik rejection in the immutable evidence.
    return error;
  }
}

function externalOutcome(
  error: unknown,
  successDetail = "validated",
): Readonly<{
  outcome: "succeeded" | "failed" | "ambiguous";
  detailCode: string;
}> {
  if (!error) return { outcome: "succeeded", detailCode: successDetail };
  if (isAmbiguousExternalError(error)) {
    return {
      outcome: "ambiguous",
      detailCode: stableExternalCode(error, "federation_external_ambiguous"),
    };
  }
  return {
    outcome: "failed",
    detailCode: stableExternalCode(error, "federation_external_failed"),
  };
}

function isAmbiguousExternalError(error: unknown): boolean {
  return (
    (error instanceof AuthentikFederationAdminError ||
      error instanceof SupabaseFederationAdminError) &&
    error.outcome === "ambiguous"
  );
}

function stableExternalCode(error: unknown, fallback: string): string {
  const value =
    error instanceof AuthentikFederationAdminError ||
    error instanceof SupabaseFederationAdminError
      ? error.code
      : fallback;
  return /^[a-z][a-z0-9_.-]{2,79}$/u.test(value) ? value : fallback;
}

function assertSecret(
  expectedSha256: string | null,
  value: string | null,
): void {
  if ((expectedSha256 === null) !== (value === null)) {
    throw new TenantFederationError("federation_input_invalid");
  }
  if (value === null || expectedSha256 === null) return;
  if (
    value.length < 8 ||
    value.length > 8_192 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TenantFederationError("federation_input_invalid");
  }
  const actual = Buffer.from(sha256(value), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new TenantFederationError("federation_input_invalid");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function phaseKey(phase: string, correlationId: string): string {
  return `federation:${phase}:${correlationId}`;
}

function productionDependencies(): Dependencies {
  const config = readFederationManagementConfig();
  return {
    prepare: prepareFederationSource,
    recordValidation: recordFederationValidation,
    getProjection: getFederationOrchestrationProjection,
    begin: beginFederationAction,
    recover: recoverFederationPendingAction,
    complete: completeFederationAction,
    validate: validateOrganizationFederationProvisioning,
    authentik: new AuthentikFederationAdmin(config),
    supabase: new SupabaseFederationAdmin(config),
    brokerSecret: () => randomBytes(32).toString("base64url"),
  };
}
