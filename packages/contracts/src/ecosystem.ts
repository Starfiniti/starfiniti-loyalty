import { z } from "zod";

export const programmeGroupSharingModeV1 = z.enum([
  "isolated",
  "explicit-workspace-allowlist",
]);

const operationKey = z.string().trim().min(1).max(255);
const workspaceIds = z
  .array(z.uuid())
  .min(1)
  .max(25)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "Workspace selectors must be unique",
      });
    }
  });

export const programmeGroupSharingWorkspaceV1 = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    linked: z.boolean(),
    removalProtected: z.boolean(),
  })
  .strict();

export const programmeGroupSharingPolicyV1 = z
  .object({
    version: z.literal("1"),
    programmeGroupId: z.uuid(),
    programmeGroupName: z.string().trim().min(1).max(200),
    mode: programmeGroupSharingModeV1,
    revision: z.number().int().nonnegative(),
    configurationEnabled: z.boolean(),
    workspaces: z.array(programmeGroupSharingWorkspaceV1).min(1).max(100),
  })
  .strict()
  .superRefine((policy, context) => {
    const ids = policy.workspaces.map((workspace) => workspace.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["workspaces"],
        message: "Workspace projections must be unique",
      });
    }
    const linkedCount = policy.workspaces.filter(
      (workspace) => workspace.linked,
    ).length;
    if (linkedCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["workspaces"],
        message: "A programme group must retain at least one workspace",
      });
    }
    if (policy.mode === "isolated" && linkedCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Isolated policy requires exactly one linked workspace",
      });
    }
    if (policy.mode === "explicit-workspace-allowlist" && linkedCount < 2) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Shared policy requires at least two linked workspaces",
      });
    }
  });

export const configureProgrammeGroupSharingCommandV1 = z
  .object({
    version: z.literal("1"),
    programmeGroupId: z.uuid(),
    mode: programmeGroupSharingModeV1,
    workspaceIds,
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.mode === "isolated" && command.workspaceIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["workspaceIds"],
        message: "Isolated policy requires exactly one workspace",
      });
    }
    if (
      command.mode === "explicit-workspace-allowlist" &&
      command.workspaceIds.length < 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["workspaceIds"],
        message: "Shared policy requires at least two workspaces",
      });
    }
  });

export const configureProgrammeGroupSharingResultV1 = z
  .object({
    resourceId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    revision: z.number().int().positive(),
    mode: programmeGroupSharingModeV1,
    workspaceIds,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.mode === "isolated" && result.workspaceIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["workspaceIds"],
        message: "Isolated result requires exactly one workspace",
      });
    }
    if (
      result.mode === "explicit-workspace-allowlist" &&
      result.workspaceIds.length < 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["workspaceIds"],
        message: "Shared result requires at least two workspaces",
      });
    }
  });

export type ProgrammeGroupSharingModeV1 = z.infer<
  typeof programmeGroupSharingModeV1
>;
export type ProgrammeGroupSharingPolicyV1 = z.infer<
  typeof programmeGroupSharingPolicyV1
>;
export type ConfigureProgrammeGroupSharingCommandV1 = z.infer<
  typeof configureProgrammeGroupSharingCommandV1
>;
export type ConfigureProgrammeGroupSharingResultV1 = z.infer<
  typeof configureProgrammeGroupSharingResultV1
>;
