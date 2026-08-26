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
