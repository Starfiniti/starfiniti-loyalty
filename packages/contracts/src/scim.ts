import { z } from "zod";

export const SCIM_CORE_USER_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:User" as const;
export const SCIM_CORE_GROUP_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:Group" as const;
export const SCIM_PATCH_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:PatchOp" as const;
export const SCIM_LIST_RESPONSE_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse" as const;
export const SCIM_ERROR_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:Error" as const;

const safeScimIdentifierV1 = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeScimUserNameV1 = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
const safeScimLabelV1 = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\u0000-\u001f\u007f]+$/u);

export const scimUserNameV1 = z
  .object({
    formatted: safeScimLabelV1.optional(),
    familyName: safeScimLabelV1.optional(),
    givenName: safeScimLabelV1.optional(),
    middleName: safeScimLabelV1.optional(),
    honorificPrefix: safeScimLabelV1.optional(),
    honorificSuffix: safeScimLabelV1.optional(),
  })
  .strict()
  .refine((name) => Object.keys(name).length > 0, {
    message: "name must contain at least one supported component",
  });

export const scimEmailV1 = z
  .object({
    value: safeScimUserNameV1,
    type: z.enum(["work", "home", "other"]).optional(),
    primary: z.boolean().optional(),
    display: safeScimLabelV1.optional(),
  })
  .strict();

export const scimUserWriteV1 = z
  .object({
    schemas: z.array(z.string()).min(1).max(10),
    externalId: safeScimIdentifierV1,
    userName: safeScimUserNameV1,
    displayName: safeScimLabelV1.optional(),
    name: scimUserNameV1.optional(),
    emails: z.array(scimEmailV1).max(20).optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((user, context) => {
    if (!user.schemas.includes(SCIM_CORE_USER_SCHEMA)) {
      context.addIssue({
        code: "custom",
        path: ["schemas"],
        message: "SCIM User core schema is required",
      });
    }
    if ((user.emails ?? []).filter((email) => email.primary).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["emails"],
        message: "at most one email may be primary",
      });
    }
  });

export const scimGroupMemberV1 = z
  .object({
    value: z.uuid(),
    display: safeScimLabelV1.optional(),
    $ref: z.url().max(2_048).optional(),
    type: z.literal("User").optional(),
  })
  .strict();

export const scimGroupWriteV1 = z
  .object({
    schemas: z.array(z.string()).min(1).max(10),
    externalId: safeScimIdentifierV1,
    displayName: safeScimLabelV1,
    members: z.array(scimGroupMemberV1).max(2_000).default([]),
  })
  .strict()
  .superRefine((group, context) => {
    if (!group.schemas.includes(SCIM_CORE_GROUP_SCHEMA)) {
      context.addIssue({
        code: "custom",
        path: ["schemas"],
        message: "SCIM Group core schema is required",
      });
    }
    const memberIds = group.members.map((member) => member.value);
    if (new Set(memberIds).size !== memberIds.length) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message: "group members must be unique",
      });
    }
  });

export const scimPatchOperationV1 = z
  .object({
    op: z
      .string()
      .transform((value) => value.toLowerCase())
      .pipe(z.enum(["add", "remove", "replace"])),
    path: z.string().trim().min(1).max(512).optional(),
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    if (operation.op !== "remove" && operation.value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "add and replace require a value",
      });
    }
    if (operation.path === undefined && operation.value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: "an operation requires a path or object value",
      });
    }
  });

export const scimPatchRequestV1 = z
  .object({
    schemas: z.array(z.string()).min(1).max(10),
    Operations: z.array(scimPatchOperationV1).min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    if (!request.schemas.includes(SCIM_PATCH_SCHEMA)) {
      context.addIssue({
        code: "custom",
        path: ["schemas"],
        message: "SCIM PatchOp schema is required",
      });
    }
  });

export const scimFilterV1 = z
  .object({
    attribute: z.enum(["id", "externalId", "userName", "displayName"]),
    operator: z.literal("eq"),
    value: safeScimUserNameV1,
  })
  .strict();

export const scimEndpointCredentialV1 = z
  .string()
  .regex(/^stf_scim_[A-Za-z0-9_-]{43}$/u);

export const createOrganizationScimEndpointCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    federationSourceId: z.uuid(),
    displayName: safeScimLabelV1,
    credentialSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const organizationScimEndpointCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    endpointId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    action: z.enum(["rotate", "revoke"]),
    credentialSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    reason: z.string().trim().min(8).max(500),
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if ((command.action === "rotate") !== (command.credentialSha256 !== null)) {
      context.addIssue({
        code: "custom",
        path: ["credentialSha256"],
        message: "only rotation carries a one-time credential digest",
      });
    }
  });

export const organizationScimRoleMappingCommandV1 = z
  .object({
    version: z.literal("1"),
    organizationId: z.uuid(),
    endpointId: z.uuid(),
    groupId: z.uuid(),
    expectedRevision: z.number().int().min(1),
    role: z
      .enum(["admin", "marketer", "operator", "analyst", "auditor"])
      .nullable(),
    reason: z.string().trim().min(8).max(500),
    idempotencyKey: z.string().min(1).max(255),
    correlationId: z.uuid(),
  })
  .strict();

export const organizationScimManagedRoleV1 = z.enum([
  "admin",
  "marketer",
  "operator",
  "analyst",
  "auditor",
]);

export const organizationScimEndpointReadV1 = z
  .object({
    id: z.uuid(),
    federationSourceId: z.uuid(),
    displayName: safeScimLabelV1,
    status: z.enum(["active", "revoked"]),
    revision: z.number().int().min(1),
    credentialRevision: z.number().int().min(1),
    userCount: z.number().int().min(0).max(1_000_000),
    activeUserCount: z.number().int().min(0).max(1_000_000),
    boundUserCount: z.number().int().min(0).max(1_000_000),
    groupCount: z.number().int().min(0).max(100_000),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((endpoint, context) => {
    if (
      endpoint.activeUserCount > endpoint.userCount ||
      endpoint.boundUserCount > endpoint.userCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["userCount"],
        message: "SCIM user counts must be internally consistent",
      });
    }
    if ((endpoint.status === "revoked") !== (endpoint.revokedAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "only revoked endpoints carry a revocation timestamp",
      });
    }
  });

export const organizationScimGroupReadV1 = z
  .object({
    id: z.uuid(),
    endpointId: z.uuid(),
    displayName: safeScimLabelV1,
    mappedRole: organizationScimManagedRoleV1.nullable(),
    revision: z.number().int().min(1),
    memberCount: z.number().int().min(0).max(1_000_000),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const organizationScimAuditEventReadV1 = z
  .object({
    id: z.uuid(),
    endpointId: z.uuid(),
    action: z.string().trim().min(1).max(80),
    resourceType: z.enum(["endpoint", "user", "group", "membership"]),
    resourceId: z.uuid(),
    resourceRevision: z.number().int().min(1),
    outcome: z.string().trim().min(1).max(40),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const organizationScimWorkspaceV1 = z
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
    currentRole: z.enum(["owner", "admin", "auditor"]),
    mayConfigure: z.boolean(),
    entitlementEnabled: z.boolean(),
    endpoints: z.array(organizationScimEndpointReadV1).max(5),
    groups: z.array(organizationScimGroupReadV1).max(5_000),
    events: z.array(organizationScimAuditEventReadV1).max(50),
  })
  .strict()
  .superRefine((workspace, context) => {
    const endpointIds = new Set(workspace.endpoints.map(({ id }) => id));
    if (
      workspace.groups.some(({ endpointId }) => !endpointIds.has(endpointId))
    ) {
      context.addIssue({
        code: "custom",
        path: ["groups"],
        message: "every SCIM group must belong to a visible endpoint",
      });
    }
    if (
      workspace.organization.status === "active" &&
      !workspace.mayConfigure &&
      workspace.currentRole !== "auditor"
    ) {
      context.addIssue({
        code: "custom",
        path: ["mayConfigure"],
        message: "active owners and admins must be able to configure SCIM",
      });
    }
  });

export const organizationScimEndpointMutationResultV1 = z
  .object({
    endpointId: z.uuid(),
    outcome: z.enum(["created", "duplicate", "rotate", "revoke"]),
    revision: z.number().int().min(1),
    credentialRevision: z.number().int().min(1),
    status: z.enum(["active", "revoked"]).nullable(),
  })
  .strict();

export const organizationScimRoleMappingResultV1 = z
  .object({
    groupId: z.uuid(),
    outcome: z.enum(["updated", "duplicate"]),
    revision: z.number().int().min(1),
    mappedRole: organizationScimManagedRoleV1.nullable(),
  })
  .strict();

export const organizationScimMembershipClaimV1 = z
  .object({
    outcome: z.enum([
      "created",
      "updated",
      "unchanged",
      "manual_membership",
      "unavailable",
      "unbound",
      "revoked",
      "role_conflict",
    ]),
    role: z
      .enum(["owner", "admin", "marketer", "operator", "analyst", "auditor"])
      .nullable(),
    revision: z.number().int().min(1).nullable(),
  })
  .strict()
  .superRefine((claim, context) => {
    const accepted = [
      "created",
      "updated",
      "unchanged",
      "manual_membership",
    ].includes(claim.outcome);
    if (
      (accepted && (claim.role === null || claim.revision === null)) ||
      (!accepted && claim.role !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message:
          "only an accepted claim carries live role and revision authority",
      });
    }
  });

export type ScimUserWriteV1 = z.infer<typeof scimUserWriteV1>;
export type ScimGroupWriteV1 = z.infer<typeof scimGroupWriteV1>;
export type ScimPatchRequestV1 = z.infer<typeof scimPatchRequestV1>;
export type ScimFilterV1 = z.infer<typeof scimFilterV1>;
export type CreateOrganizationScimEndpointCommandV1 = z.infer<
  typeof createOrganizationScimEndpointCommandV1
>;
export type OrganizationScimEndpointCommandV1 = z.infer<
  typeof organizationScimEndpointCommandV1
>;
export type OrganizationScimRoleMappingCommandV1 = z.infer<
  typeof organizationScimRoleMappingCommandV1
>;
export type OrganizationScimManagedRoleV1 = z.infer<
  typeof organizationScimManagedRoleV1
>;
export type OrganizationScimEndpointReadV1 = z.infer<
  typeof organizationScimEndpointReadV1
>;
export type OrganizationScimGroupReadV1 = z.infer<
  typeof organizationScimGroupReadV1
>;
export type OrganizationScimWorkspaceV1 = z.infer<
  typeof organizationScimWorkspaceV1
>;
export type OrganizationScimEndpointMutationResultV1 = z.infer<
  typeof organizationScimEndpointMutationResultV1
>;
export type OrganizationScimRoleMappingResultV1 = z.infer<
  typeof organizationScimRoleMappingResultV1
>;
export type OrganizationScimMembershipClaimV1 = z.infer<
  typeof organizationScimMembershipClaimV1
>;
