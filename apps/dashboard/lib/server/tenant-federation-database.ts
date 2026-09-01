import "server-only";

import {
  organizationFederationSourceConfigurationV1,
  organizationFederationValidationEvidenceV1,
  type CreateOrganizationFederationSourceCommandV1,
  type OrganizationFederationSourceCommandV1,
  type OrganizationFederationSourceConfigurationV1,
  type OrganizationFederationValidationEvidenceV1,
} from "@starfiniti/contracts";
import { getDatabase } from "./database";

export type FederationMutation = Readonly<{
  resourceId: string;
  outcome: string;
  revision: number;
  status: string;
}>;

export type PreparedFederationSource = FederationMutation &
  Readonly<{
    authentikSourceSlug: string;
    supabaseProviderIdentifier: string;
    configurationSha256: string;
  }>;

export type FederationOrchestrationProjection = Readonly<{
  resourceId: string;
  protocol: "oidc" | "saml";
  status: string;
  revision: number;
  authentikSourceSlug: string;
  supabaseProviderIdentifier: string;
  pendingAction: string | null;
  configurationSha256: string;
  configuration: OrganizationFederationSourceConfigurationV1;
  validationEvidence: OrganizationFederationValidationEvidenceV1 | null;
}>;

type MutationRow = Readonly<{
  source_public_id: string;
  outcome: string;
  revision: number | string;
  status: string;
}>;

export async function prepareFederationSource(
  actorUserId: string,
  command: CreateOrganizationFederationSourceCommandV1,
): Promise<PreparedFederationSource> {
  const configuration = command.configuration;
  const sql = getDatabase();
  const rows = await sql<
    Array<
      MutationRow & {
        authentik_source_slug: string;
        supabase_provider_identifier: string;
        configuration_sha256: string;
      }
    >
  >`
    select source_public_id, outcome, revision, status,
      authentik_source_slug, supabase_provider_identifier,
      configuration_sha256
    from loyalty_private.prepare_organization_federation_source_v1(
      ${actorUserId}::uuid,
      ${command.organizationId}::uuid,
      ${command.displayName},
      ${configuration.protocol},
      ${configuration.protocol === "oidc" ? configuration.discoveryUrl : null},
      ${configuration.protocol === "oidc" ? configuration.clientId : null},
      ${configuration.protocol === "saml" ? configuration.metadataUrl : null},
      ${configuration.protocol === "saml" ? configuration.expectedEntityId : null},
      ${command.clientSecretSha256},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const row = requiredRow(rows);
  return {
    ...mutation(row),
    authentikSourceSlug: row.authentik_source_slug,
    supabaseProviderIdentifier: row.supabase_provider_identifier,
    configurationSha256: row.configuration_sha256,
  };
}

export async function recordFederationValidation(
  actorUserId: string,
  input: Readonly<{
    sourceId: string;
    expectedRevision: number;
    evidence: OrganizationFederationValidationEvidenceV1;
    brokerSecretSha256: string;
    authentikSourcePublicId: string | null;
    authentikProviderId: number | null;
    externalOutcome: "succeeded" | "failed" | "ambiguous";
    externalDetailCode: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<FederationMutation> {
  const evidence = input.evidence;
  const sql = getDatabase();
  const rows = await sql<MutationRow[]>`
    select source_public_id, outcome, revision, status
    from loyalty_private.record_organization_federation_validation_v1(
      ${actorUserId}::uuid,
      ${input.sourceId}::uuid,
      ${input.expectedRevision},
      ${evidence.configurationSha256},
      ${evidence.documentSha256},
      ${evidence.issuer},
      ${evidence.authorizationEndpoint},
      ${evidence.tokenEndpoint},
      ${evidence.jwksUri},
      ${evidence.ssoEndpoint},
      ${evidence.signingFingerprints}::text[],
      ${input.brokerSecretSha256},
      ${input.authentikSourcePublicId}::uuid,
      ${input.authentikProviderId}::bigint,
      ${input.externalOutcome},
      ${input.externalDetailCode},
      ${input.idempotencyKey},
      ${input.correlationId}::uuid
    )
  `;
  return mutation(requiredRow(rows));
}

export async function getFederationOrchestrationProjection(
  actorUserId: string,
  organizationId: string,
  sourceId: string,
): Promise<FederationOrchestrationProjection | null> {
  const sql = getDatabase();
  const rows = await sql<
    Array<{
      source_public_id: string;
      protocol: "oidc" | "saml";
      status: string;
      lifecycle_revision: number | string;
      authentik_source_slug: string;
      supabase_provider_identifier: string;
      pending_action: string | null;
      configuration_sha256: string;
      configuration: unknown;
      validation_evidence: unknown;
    }>
  >`
    select source_public_id, protocol, status, lifecycle_revision,
      authentik_source_slug, supabase_provider_identifier, pending_action,
      configuration_sha256, configuration, validation_evidence
    from loyalty_private.organization_federation_orchestration_v1(
      ${actorUserId}::uuid,
      ${organizationId}::uuid,
      ${sourceId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    resourceId: row.source_public_id,
    protocol: row.protocol,
    status: row.status,
    revision: safeRevision(row.lifecycle_revision),
    authentikSourceSlug: row.authentik_source_slug,
    supabaseProviderIdentifier: row.supabase_provider_identifier,
    pendingAction: row.pending_action,
    configurationSha256: sha256(row.configuration_sha256),
    configuration: organizationFederationSourceConfigurationV1.parse(
      row.configuration,
    ),
    validationEvidence:
      row.validation_evidence === null
        ? null
        : organizationFederationValidationEvidenceV1.parse(
            row.validation_evidence,
          ),
  };
}

export async function beginFederationAction(
  actorUserId: string,
  command: OrganizationFederationSourceCommandV1,
): Promise<FederationMutation> {
  const sql = getDatabase();
  const rows = await sql<MutationRow[]>`
    select source_public_id, outcome, revision, status
    from loyalty_private.begin_organization_federation_action_v1(
      ${actorUserId}::uuid,
      ${command.organizationId}::uuid,
      ${command.sourceId}::uuid,
      ${command.expectedRevision},
      ${command.action},
      ${command.clientSecretSha256},
      ${command.reason},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  return mutation(requiredRow(rows));
}

export async function recoverFederationPendingAction(
  actorUserId: string,
  command: OrganizationFederationSourceCommandV1,
): Promise<FederationMutation> {
  if (command.action !== "recover") {
    throw new Error("federation_recovery_action_invalid");
  }
  const sql = getDatabase();
  const rows = await sql<MutationRow[]>`
    select source_public_id, outcome, revision, status
    from loyalty_private.recover_organization_federation_pending_v1(
      ${actorUserId}::uuid,
      ${command.organizationId}::uuid,
      ${command.sourceId}::uuid,
      ${command.expectedRevision},
      ${command.reason},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  return mutation(requiredRow(rows));
}

export async function completeFederationAction(
  actorUserId: string,
  input: Readonly<{
    sourceId: string;
    expectedRevision: number;
    action: Exclude<OrganizationFederationSourceCommandV1["action"], "recover">;
    externalOutcome: "succeeded" | "failed" | "ambiguous";
    externalDetailCode: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<FederationMutation> {
  const sql = getDatabase();
  const rows = await sql<MutationRow[]>`
    select source_public_id, outcome, revision, status
    from loyalty_private.complete_organization_federation_action_v1(
      ${actorUserId}::uuid,
      ${input.sourceId}::uuid,
      ${input.expectedRevision},
      ${input.action},
      ${input.externalOutcome},
      ${input.externalDetailCode},
      ${null}::text,
      ${input.idempotencyKey},
      ${input.correlationId}::uuid
    )
  `;
  return mutation(requiredRow(rows));
}

function requiredRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("federation_database_unavailable");
  return row;
}

function mutation(row: MutationRow): FederationMutation {
  return {
    resourceId: row.source_public_id,
    outcome: row.outcome,
    revision: safeRevision(row.revision),
    status: row.status,
  };
}

function safeRevision(value: number | string): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("federation_database_invalid");
  }
  return revision;
}

function sha256(value: string): string {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("federation_database_invalid");
  }
  return value;
}
