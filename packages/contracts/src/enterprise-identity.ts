import { z } from "zod";

export const enterpriseAccessRoleV1 = z.enum([
  "owner",
  "admin",
  "marketer",
  "operator",
  "support",
  "analyst",
  "auditor",
]);

export const organizationMembershipRoleV1 = z.enum([
  "owner",
  "admin",
  "marketer",
  "operator",
  "analyst",
  "auditor",
]);

const organizationSlugV1 = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const organizationNameV1 = z.string().trim().min(1).max(200);
const safeIdentityLabelV1 = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeIdentityReasonV1 = z
  .string()
  .trim()
  .min(8)
  .max(500)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeIdentityIdempotencyKeyV1 = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const sha256HexV1 = z.string().regex(/^[a-f0-9]{64}$/u);

export const enterprisePermissionV1 = z.enum([
  "organization.view",
  "organization.lifecycle.manage",
  "members.view",
  "members.manage",
  "identity.configure",
  "support.approve",
  "agency.manage",
  "audit.view",
]);

export const enterpriseAccessProfileV1 = z
  .object({
    role: enterpriseAccessRoleV1,
    label: z.string().trim().min(1).max(40),
    description: z.string().trim().min(1).max(240),
    assignmentKind: z.enum(["membership", "support_grant"]),
    permissions: z.array(enterprisePermissionV1).max(8),
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.permissions).size !== profile.permissions.length) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "profile permissions must be unique",
      });
    }
    if (
      (profile.role === "support") !==
      (profile.assignmentKind === "support_grant")
    ) {
      context.addIssue({
        code: "custom",
        path: ["assignmentKind"],
        message: "support must be grant-only and memberships cannot be grants",
      });
    }
  });

export const enterpriseAccessCatalogueV1 = z
  .object({
    schemaVersion: z.literal("1"),
    profiles: z.array(enterpriseAccessProfileV1).length(7),
  })
  .strict()
  .superRefine((catalogue, context) => {
    const roles = catalogue.profiles.map(({ role }) => role);
    if (new Set(roles).size !== enterpriseAccessRoleV1.options.length) {
      context.addIssue({
        code: "custom",
        path: ["profiles"],
        message: "catalogue must contain every enterprise role exactly once",
      });
      return;
    }
    for (const role of enterpriseAccessRoleV1.options) {
      if (!roles.includes(role)) {
        context.addIssue({
          code: "custom",
          path: ["profiles"],
          message: `catalogue is missing ${role}`,
        });
      }
    }
  });

const activeMembershipCountV1 = z
  .object({
    role: organizationMembershipRoleV1,
    count: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const organizationAccessWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organization: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
        slug: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        status: z.enum(["active", "suspended", "closed"]),
      })
      .strict(),
    currentAccess: z
      .object({
        role: organizationMembershipRoleV1,
        assignmentKind: z.literal("membership"),
        effective: z.boolean(),
        permissions: z.array(enterprisePermissionV1).max(8),
      })
      .strict(),
    catalogue: enterpriseAccessCatalogueV1,
    activeMembershipCounts: z.array(activeMembershipCountV1).length(6),
  })
  .strict()
  .superRefine((workspace, context) => {
    if (
      workspace.currentAccess.effective !==
      (workspace.organization.status === "active")
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentAccess", "effective"],
        message: "access is effective only while the organization is active",
      });
    }
    const counts = workspace.activeMembershipCounts.map(({ role }) => role);
    if (
      new Set(counts).size !== organizationMembershipRoleV1.options.length ||
      organizationMembershipRoleV1.options.some(
        (role) => !counts.includes(role),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeMembershipCounts"],
        message: "membership counts must contain every membership role once",
      });
    }
    const currentProfile = workspace.catalogue.profiles.find(
      ({ role }) => role === workspace.currentAccess.role,
    );
    if (
      !currentProfile ||
      currentProfile.assignmentKind !== "membership" ||
      currentProfile.permissions.join("|") !==
        workspace.currentAccess.permissions.join("|")
    ) {
      context.addIssue({
        code: "custom",
        path: ["currentAccess"],
        message: "current access must match its catalogue profile exactly",
      });
    }
  });

export const createOrganizationCommandV1 = z
  .object({
    version: z.literal("1"),
    slug: organizationSlugV1,
    name: organizationNameV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const organizationLifecycleActionV1 = z.enum([
  "rename",
  "suspend",
  "restore",
  "close",
  "offboard",
]);

export const organizationLifecycleCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    action: organizationLifecycleActionV1,
    name: organizationNameV1.nullable(),
    reason: safeIdentityReasonV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if ((command.action === "rename") !== (command.name !== null)) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "only rename commands carry an organization name",
      });
    }
  });

export const createOrganizationInvitationCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    displayLabel: safeIdentityLabelV1,
    role: organizationMembershipRoleV1,
    expiresAt: z.iso.datetime({ offset: true }),
    tokenSha256: sha256HexV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const acceptOrganizationInvitationCommandV1 = z
  .object({
    version: z.literal("1"),
    tokenSha256: sha256HexV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const revokeOrganizationInvitationCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    invitationId: z.uuid(),
    reason: safeIdentityReasonV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict();

export const organizationMemberActionV1 = z.enum(["change_role", "revoke"]);

export const organizationMemberCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    membershipId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    action: organizationMemberActionV1,
    role: organizationMembershipRoleV1.nullable(),
    reason: safeIdentityReasonV1,
    idempotencyKey: safeIdentityIdempotencyKeyV1,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if ((command.action === "change_role") !== (command.role !== null)) {
      context.addIssue({
        code: "custom",
        path: ["role"],
        message: "only role-change commands carry a role",
      });
    }
  });

export const enterpriseIdentityMutationResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "updated", "revoked", "duplicate"]),
    revision: z.number().int().min(1),
    status: z.string().trim().min(1).max(40),
  })
  .strict();

export const organizationMemberReadV1 = z
  .object({
    id: z.uuid(),
    displayLabel: safeIdentityLabelV1.nullable(),
    role: organizationMembershipRoleV1,
    status: z.enum(["active", "revoked"]),
    isCurrent: z.boolean(),
    revision: z.number().int().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const organizationInvitationReadV1 = z
  .object({
    id: z.uuid(),
    displayLabel: safeIdentityLabelV1,
    role: organizationMembershipRoleV1,
    status: z.enum(["pending", "accepted", "revoked", "expired"]),
    expiresAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    acceptedAt: z.iso.datetime({ offset: true }).nullable(),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const organizationLifecycleEventReadV1 = z
  .object({
    id: z.uuid(),
    action: z.enum([
      "organization.create",
      "organization.rename",
      "organization.suspend",
      "organization.restore",
      "organization.close",
      "organization.offboard",
      "invitation.create",
      "invitation.accept",
      "invitation.revoke",
      "membership.change_role",
      "membership.revoke",
    ]),
    resourceId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const organizationTeamWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    organization: z
      .object({
        id: z.uuid(),
        name: organizationNameV1,
        slug: organizationSlugV1,
        status: z.enum(["active", "suspended", "closed"]),
        lifecycleRevision: z.number().int().min(1),
        createdAt: z.iso.datetime({ offset: true }),
        updatedAt: z.iso.datetime({ offset: true }),
        closedAt: z.iso.datetime({ offset: true }).nullable(),
        offboardedAt: z.iso.datetime({ offset: true }).nullable(),
      })
      .strict(),
    currentRole: organizationMembershipRoleV1,
    mayManageLifecycle: z.boolean(),
    mayManageMembers: z.boolean(),
    mayExport: z.boolean(),
    members: z.array(organizationMemberReadV1).max(500),
    invitations: z.array(organizationInvitationReadV1).max(200),
    recentEvents: z.array(organizationLifecycleEventReadV1).max(50),
  })
  .strict()
  .superRefine((workspace, context) => {
    const activeOwners = workspace.members.filter(
      ({ role, status }) => role === "owner" && status === "active",
    );
    if (activeOwners.length < 1) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message: "an organization must retain one active owner",
      });
    }
    if (
      workspace.organization.offboardedAt &&
      workspace.organization.status !== "closed"
    ) {
      context.addIssue({
        code: "custom",
        path: ["organization", "offboardedAt"],
        message: "only a closed organization can be offboarded",
      });
    }
  });

export type EnterpriseAccessRoleV1 = z.infer<typeof enterpriseAccessRoleV1>;
export type OrganizationMembershipRoleV1 = z.infer<
  typeof organizationMembershipRoleV1
>;
export type EnterprisePermissionV1 = z.infer<typeof enterprisePermissionV1>;
export type EnterpriseAccessProfileV1 = z.infer<
  typeof enterpriseAccessProfileV1
>;
export type EnterpriseAccessCatalogueV1 = z.infer<
  typeof enterpriseAccessCatalogueV1
>;
export type OrganizationAccessWorkspaceV1 = z.infer<
  typeof organizationAccessWorkspaceV1
>;
export type CreateOrganizationCommandV1 = z.infer<
  typeof createOrganizationCommandV1
>;
export type OrganizationLifecycleActionV1 = z.infer<
  typeof organizationLifecycleActionV1
>;
export type OrganizationLifecycleCommandV1 = z.infer<
  typeof organizationLifecycleCommandV1
>;
export type CreateOrganizationInvitationCommandV1 = z.infer<
  typeof createOrganizationInvitationCommandV1
>;
export type AcceptOrganizationInvitationCommandV1 = z.infer<
  typeof acceptOrganizationInvitationCommandV1
>;
export type RevokeOrganizationInvitationCommandV1 = z.infer<
  typeof revokeOrganizationInvitationCommandV1
>;
export type OrganizationMemberCommandV1 = z.infer<
  typeof organizationMemberCommandV1
>;
export type EnterpriseIdentityMutationResultV1 = z.infer<
  typeof enterpriseIdentityMutationResultV1
>;
export type OrganizationTeamWorkspaceV1 = z.infer<
  typeof organizationTeamWorkspaceV1
>;
