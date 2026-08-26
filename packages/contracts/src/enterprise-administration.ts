import { z } from "zod";

const safeLabelV1 = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeReasonV1 = z
  .string()
  .trim()
  .min(8)
  .max(500)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const idempotencyKeyV1 = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const sha256HexV1 = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampV1 = z.iso.datetime({ offset: true });
const countV1 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const organizationSupportScopeV1 = z.enum([
  "organization.summary.read",
  "members.summary.read",
  "identity.health.read",
  "audit.summary.read",
]);

const exactSupportScopesV1 = z
  .array(organizationSupportScopeV1)
  .min(1)
  .max(4)
  .superRefine((scopes, context) => {
    if (new Set(scopes).size !== scopes.length) {
      context.addIssue({
        code: "custom",
        message: "support scopes must be unique",
      });
    }
    if ([...scopes].sort().join("|") !== scopes.join("|")) {
      context.addIssue({
        code: "custom",
        message: "support scopes must be in canonical order",
      });
    }
  });

export const createAgencyInvitationCommandV1 = z
  .object({
    version: z.literal("1"),
    clientOrganizationId: z.uuid(),
    agencyLabel: safeLabelV1,
    expiresAt: timestampV1,
    tokenSha256: sha256HexV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const acceptAgencyInvitationCommandV1 = z
  .object({
    version: z.literal("1"),
    agencyOrganizationId: z.uuid(),
    tokenSha256: sha256HexV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const revokeAgencyRelationshipCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    relationshipId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    reason: safeReasonV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const agencyRelationshipReadV1 = z
  .object({
    id: z.uuid(),
    perspective: z.enum(["client", "agency"]),
    counterpart: z
      .object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
      .strict(),
    status: z.enum(["active", "revoked"]),
    revision: z.number().int().min(1),
    acceptedAt: timestampV1,
    revokedAt: timestampV1.nullable(),
  })
  .strict();

export const agencyInvitationReadV1 = z
  .object({
    id: z.uuid(),
    agencyLabel: safeLabelV1,
    status: z.enum(["pending", "accepted", "revoked", "expired"]),
    expiresAt: timestampV1,
    createdAt: timestampV1,
  })
  .strict();

export const agencyPortfolioWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organization: z
      .object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
      .strict(),
    mayInviteAgency: z.boolean(),
    mayAcceptAgency: z.boolean(),
    mayRequestSupport: z.boolean(),
    invitations: z.array(agencyInvitationReadV1).max(100),
    relationships: z.array(agencyRelationshipReadV1).max(500),
  })
  .strict();

export const createSupportAccessRequestCommandV1 = z
  .object({
    version: z.literal("1"),
    agencyOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid(),
    scopes: exactSupportScopesV1,
    reason: safeReasonV1,
    requestedExpiresAt: timestampV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const resolveSupportAccessRequestCommandV1 = z
  .object({
    version: z.literal("1"),
    clientOrganizationId: z.uuid(),
    requestId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    action: z.enum(["approve", "reject"]),
    approvedScopes: exactSupportScopesV1.nullable(),
    expiresAt: timestampV1.nullable(),
    reason: safeReasonV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    const hasApproval =
      command.approvedScopes !== null && command.expiresAt !== null;
    if ((command.action === "approve") !== hasApproval) {
      context.addIssue({
        code: "custom",
        path: ["approvedScopes"],
        message: "only approval carries exact scopes and expiry",
      });
    }
  });

export const revokeSupportAccessGrantCommandV1 = z
  .object({
    version: z.literal("1"),
    clientOrganizationId: z.uuid(),
    grantId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    reason: safeReasonV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const supportRequestReadV1 = z
  .object({
    id: z.uuid(),
    perspective: z.enum(["client", "agency"]),
    counterpartName: z.string().trim().min(1).max(200),
    requesterLabel: safeLabelV1.nullable(),
    scopes: exactSupportScopesV1,
    reason: safeReasonV1,
    status: z.enum(["pending", "approved", "rejected", "revoked", "expired"]),
    revision: z.number().int().min(1),
    requestedExpiresAt: timestampV1,
    createdAt: timestampV1,
    resolvedAt: timestampV1.nullable(),
  })
  .strict();

export const supportGrantReadV1 = z
  .object({
    id: z.uuid(),
    supportLabel: safeLabelV1.nullable(),
    agencyName: z.string().trim().min(1).max(200),
    scopes: exactSupportScopesV1,
    reason: safeReasonV1,
    status: z.enum(["active", "scheduled", "expired", "revoked"]),
    revision: z.number().int().min(1),
    startsAt: timestampV1,
    expiresAt: timestampV1,
    revokedAt: timestampV1.nullable(),
    useCount: countV1,
    lastUsedAt: timestampV1.nullable(),
  })
  .strict();

export const supportUseReadV1 = z
  .object({
    id: z.uuid(),
    grantId: z.uuid(),
    scopes: exactSupportScopesV1,
    surface: z.enum(["support_workspace", "organization_export"]),
    createdAt: timestampV1,
  })
  .strict();

export const supportAdministrationWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organization: z
      .object({ id: z.uuid(), name: z.string().trim().min(1).max(200) })
      .strict(),
    mayApprove: z.boolean(),
    mayReview: z.boolean(),
    requests: z.array(supportRequestReadV1).max(200),
    grants: z.array(supportGrantReadV1).max(200),
    recentUses: z.array(supportUseReadV1).max(100),
  })
  .strict();

export const supportWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    grant: z
      .object({
        id: z.uuid(),
        scopes: exactSupportScopesV1,
        expiresAt: timestampV1,
      })
      .strict(),
    organization: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
        status: z.enum(["active", "suspended", "closed"]),
        workspaceCount: countV1.nullable(),
        programmeGroupCount: countV1.nullable(),
      })
      .strict(),
    members: z
      .object({ activeCount: countV1, ownerCount: countV1 })
      .strict()
      .nullable(),
    identityHealth: z
      .object({
        enabledFederationSources: countV1,
        activeScimEndpoints: countV1,
        activeMemberships: countV1,
      })
      .strict()
      .nullable(),
    recentAudit: z
      .array(
        z
          .object({
            action: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/u),
            resourceType: z.string().regex(/^[a-z][a-z0-9_.-]{1,79}$/u),
            createdAt: timestampV1,
          })
          .strict(),
      )
      .max(25)
      .nullable(),
    use: z.object({ id: z.uuid(), recordedAt: timestampV1 }).strict(),
  })
  .strict();

export const startOrganizationBreakGlassCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    reason: safeReasonV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const organizationAdministrationExportV1 = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: timestampV1,
    organization: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
        slug: z.string().min(2).max(80),
        status: z.enum(["active", "suspended", "closed"]),
        lifecycleRevision: z.number().int().min(1),
        offboardedAt: timestampV1.nullable(),
      })
      .strict(),
    resources: z
      .object({
        workspaces: countV1,
        programmeGroups: countV1,
        programmes: countV1,
        customers: countV1,
        wallets: countV1,
        memberships: countV1,
        auditEvents: countV1,
      })
      .strict(),
    credentials: z
      .object({
        activeCommerceConnections: countV1,
        activeServiceAccounts: countV1,
        enabledFederationSources: countV1,
        activeScimEndpoints: countV1,
        activeSupportGrants: countV1,
        activeNotificationEndpoints: countV1,
      })
      .strict(),
    ledger: z
      .object({
        transactions: countV1,
        entries: countV1,
        netAmount: z.string().regex(/^-?(0|[1-9][0-9]*)$/u),
        balanced: z.boolean(),
      })
      .strict(),
    immutableEvidenceRetained: z.literal(true),
  })
  .strict()
  .superRefine((document, context) => {
    if (document.ledger.balanced !== (document.ledger.netAmount === "0")) {
      context.addIssue({
        code: "custom",
        path: ["ledger", "balanced"],
        message: "balanced must match the exact ledger net amount",
      });
    }
  });

export const organizationDeletionActionV1 = z.enum([
  "request",
  "cancel",
  "complete",
]);

export const organizationDeletionCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    breakGlassSessionId: z.uuid(),
    caseId: z.uuid().nullable(),
    expectedRevision: z.number().int().min(1),
    action: organizationDeletionActionV1,
    reason: safeReasonV1,
    idempotencyKey: idempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if ((command.action === "request") !== (command.caseId === null)) {
      context.addIssue({
        code: "custom",
        path: ["caseId"],
        message: "request creates a case; later actions require its public ID",
      });
    }
  });

export const organizationDeletionCaseReadV1 = z
  .object({
    id: z.uuid(),
    status: z.enum(["cooling", "cancelled", "completed"]),
    revision: z.number().int().min(1),
    dueAt: timestampV1,
    createdAt: timestampV1,
    cancelledAt: timestampV1.nullable(),
    completedAt: timestampV1.nullable(),
  })
  .strict();

export const organizationBreakGlassSessionReadV1 = z
  .object({
    id: z.uuid(),
    reason: safeReasonV1,
    status: z.enum(["active", "expired", "revoked"]),
    createdAt: timestampV1,
    expiresAt: timestampV1,
    revokedAt: timestampV1.nullable(),
    useCount: countV1,
    lastUsedAt: timestampV1.nullable(),
  })
  .strict();

export const organizationRecoveryWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organization: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
        status: z.enum(["active", "suspended", "closed"]),
        offboardedAt: timestampV1.nullable(),
        deletionCompletedAt: timestampV1.nullable(),
      })
      .strict(),
    assuranceLevel: z.enum(["aal1", "aal2"]),
    hasLiveAuthSession: z.boolean(),
    mayStartBreakGlass: z.boolean(),
    sessions: z.array(organizationBreakGlassSessionReadV1).max(50),
    deletionCase: organizationDeletionCaseReadV1.nullable(),
  })
  .strict();

export type OrganizationSupportScopeV1 = z.infer<
  typeof organizationSupportScopeV1
>;
export type CreateAgencyInvitationCommandV1 = z.infer<
  typeof createAgencyInvitationCommandV1
>;
export type AcceptAgencyInvitationCommandV1 = z.infer<
  typeof acceptAgencyInvitationCommandV1
>;
export type RevokeAgencyRelationshipCommandV1 = z.infer<
  typeof revokeAgencyRelationshipCommandV1
>;
export type AgencyPortfolioWorkspaceV1 = z.infer<
  typeof agencyPortfolioWorkspaceV1
>;
export type CreateSupportAccessRequestCommandV1 = z.infer<
  typeof createSupportAccessRequestCommandV1
>;
export type ResolveSupportAccessRequestCommandV1 = z.infer<
  typeof resolveSupportAccessRequestCommandV1
>;
export type RevokeSupportAccessGrantCommandV1 = z.infer<
  typeof revokeSupportAccessGrantCommandV1
>;
export type SupportAdministrationWorkspaceV1 = z.infer<
  typeof supportAdministrationWorkspaceV1
>;
export type SupportWorkspaceV1 = z.infer<typeof supportWorkspaceV1>;
export type StartOrganizationBreakGlassCommandV1 = z.infer<
  typeof startOrganizationBreakGlassCommandV1
>;
export type OrganizationAdministrationExportV1 = z.infer<
  typeof organizationAdministrationExportV1
>;
export type OrganizationDeletionCommandV1 = z.infer<
  typeof organizationDeletionCommandV1
>;
export type OrganizationDeletionCaseReadV1 = z.infer<
  typeof organizationDeletionCaseReadV1
>;
export type OrganizationRecoveryWorkspaceV1 = z.infer<
  typeof organizationRecoveryWorkspaceV1
>;
