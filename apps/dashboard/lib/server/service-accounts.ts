import "server-only";
import { randomUUID } from "node:crypto";
import {
  issueServiceCredentialToken,
  serviceAccountMutationResultV1,
  serviceAccountsDocumentV1,
  serviceCredentialMutationResultV1,
  type CreateServiceAccountCommandV1,
  type IssueServiceCredentialCommandV1,
  type RevokeServiceCredentialCommandV1,
  type ServiceAccountsDocumentV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDatabase } from "./database";

type ServiceAccountRow = Readonly<{
  service_account_public_id: string;
  outcome: string;
}>;

type ServiceCredentialRow = Readonly<{
  credential_public_id: string;
  secret_hint: string;
  outcome: string;
  prior_valid_until: string | null;
}>;

export async function getServiceAccounts(
  organizationPublicId: string,
): Promise<ServiceAccountsDocumentV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_service_accounts_v1", {
      target_organization_public_id: organizationPublicId,
    });
  if (error) throw new Error("service_accounts_unavailable");
  const row = (Array.isArray(data) ? data[0] : data) as
    { document?: unknown } | undefined;
  return serviceAccountsDocumentV1.parse(row?.document);
}

export async function createServiceAccount(
  actorUserId: string,
  command: CreateServiceAccountCommandV1,
) {
  const sql = getDatabase();
  const rows = await sql<ServiceAccountRow[]>`
    select service_account_public_id, outcome
    from loyalty_private.create_service_account_v1(
      ${actorUserId}::uuid,
      ${command.workspaceId}::uuid,
      ${command.programmeId}::uuid,
      ${command.displayName},
      ${command.scopes}::text[],
      ${command.requestsPerMinute},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const row = rows[0];
  return serviceAccountMutationResultV1.parse(
    row
      ? { resourceId: row.service_account_public_id, outcome: row.outcome }
      : null,
  );
}

export async function issueServiceAccountCredential(
  actorUserId: string,
  command: IssueServiceCredentialCommandV1,
): Promise<
  Readonly<{
    result: ReturnType<typeof serviceCredentialMutationResultV1.parse>;
    token: string | null;
  }>
> {
  const credentialId = randomUUID();
  const issued = issueServiceCredentialToken(credentialId);
  const sql = getDatabase();
  const rows = await sql<ServiceCredentialRow[]>`
    select credential_public_id, secret_hint, outcome, prior_valid_until
    from loyalty_private.issue_service_account_credential_v1(
      ${actorUserId}::uuid,
      ${command.serviceAccountId}::uuid,
      ${credentialId}::uuid,
      ${Buffer.from(issued.tokenSha256, "hex")},
      ${issued.hint},
      ${command.overlapSeconds},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const row = rows[0];
  const result = serviceCredentialMutationResultV1.parse(
    row
      ? {
          resourceId: row.credential_public_id,
          secretHint: row.secret_hint,
          outcome: row.outcome,
          priorValidUntil: row.prior_valid_until,
        }
      : null,
  );
  return { result, token: result.outcome === "created" ? issued.token : null };
}

export async function revokeServiceAccountCredential(
  actorUserId: string,
  command: RevokeServiceCredentialCommandV1,
): Promise<Readonly<{ resourceId: string; outcome: string; status: string }>> {
  const sql = getDatabase();
  const rows = await sql<
    ReadonlyArray<{
      credential_public_id: string;
      outcome: string;
      status: string;
    }>
  >`
    select credential_public_id, outcome, status
    from loyalty_private.revoke_service_account_credential_v1(
      ${actorUserId}::uuid,
      ${command.serviceAccountId}::uuid,
      ${command.credentialId}::uuid,
      ${command.reason},
      ${command.idempotencyKey},
      ${command.correlationId}::uuid
    )
  `;
  const row = rows[0];
  if (
    !row ||
    !["revoked", "already_revoked", "duplicate"].includes(row.outcome) ||
    row.status !== "revoked"
  ) {
    throw new Error("service_credential_revocation_unavailable");
  }
  return {
    resourceId: row.credential_public_id,
    outcome: row.outcome,
    status: row.status,
  };
}
