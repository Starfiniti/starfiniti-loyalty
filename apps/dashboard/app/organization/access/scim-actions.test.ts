import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createOrganizationScimEndpoint = vi.hoisted(() => vi.fn());
const updateOrganizationScimEndpoint = vi.hoisted(() => vi.fn());
const mapOrganizationScimGroupRole = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/server/scim-management", async () => {
  const { createHash: hash } = await import("node:crypto");
  return {
    createOrganizationScimEndpoint,
    updateOrganizationScimEndpoint,
    mapOrganizationScimGroupRole,
    hashOrganizationScimCredential: (value: string) =>
      hash("sha256").update(value, "utf8").digest("hex"),
  };
});

import {
  createScimEndpointAction,
  mapScimGroupRoleAction,
  updateScimEndpointAction,
} from "./scim-actions";

const organizationId = "20000000-0000-4000-8000-000000000001";
const sourceId = "30000000-0000-4000-8000-000000000001";
const endpointId = "40000000-0000-4000-8000-000000000001";
const groupId = "50000000-0000-4000-8000-000000000001";
const operationId = "60000000-0000-4000-8000-000000000001";
const credential = `stf_scim_${"A".repeat(43)}`;
const idle = {
  kind: "idle",
  message: "",
  credential: null,
  endpointUrl: null,
} as const;

describe("SCIM merchant server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_PUBLIC_ORIGIN = "https://loyalty.starfiniti.com";
  });

  it("returns a one-time create credential while sending only its digest to PostgreSQL", async () => {
    createOrganizationScimEndpoint.mockResolvedValue({
      endpointId,
      outcome: "created",
      revision: 1,
      credentialRevision: 1,
      status: null,
    });
    const result = await createScimEndpointAction(idle, createForm());

    expect(result).toMatchObject({
      kind: "success",
      credential,
      endpointUrl: `https://loyalty.starfiniti.com/api/scim/${endpointId}/v2`,
    });
    expect(createOrganizationScimEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        federationSourceId: sourceId,
        credentialSha256: createHash("sha256").update(credential).digest("hex"),
        idempotencyKey: `scim:endpoint:create:${operationId}`,
      }),
    );
    expect(
      JSON.stringify(createOrganizationScimEndpoint.mock.calls),
    ).not.toContain(credential);
    expect(revalidatePath).toHaveBeenCalledWith("/organization/access");
  });

  it("rejects creation before database access when the public origin is unsafe", async () => {
    process.env.DASHBOARD_PUBLIC_ORIGIN = "http://loyalty.starfiniti.com";
    await expect(
      createScimEndpointAction(idle, createForm()),
    ).resolves.toMatchObject({ kind: "error", credential: null });
    expect(createOrganizationScimEndpoint).not.toHaveBeenCalled();
  });

  it("rotates with the stable client-issued credential and revision", async () => {
    updateOrganizationScimEndpoint.mockResolvedValue({
      endpointId,
      outcome: "rotate",
      revision: 3,
      credentialRevision: 2,
      status: "active",
    });
    const form = endpointForm("rotate");
    const result = await updateScimEndpointAction(idle, form);
    expect(result).toMatchObject({ kind: "success", credential });
    expect(updateOrganizationScimEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rotate",
        expectedRevision: 2,
        credentialSha256: createHash("sha256").update(credential).digest("hex"),
      }),
    );
  });

  it("revokes without returning or persisting a plaintext credential", async () => {
    updateOrganizationScimEndpoint.mockResolvedValue({
      endpointId,
      outcome: "revoke",
      revision: 3,
      credentialRevision: 1,
      status: "revoked",
    });
    const result = await updateScimEndpointAction(idle, endpointForm("revoke"));
    expect(result).toMatchObject({
      kind: "success",
      credential: null,
      endpointUrl: null,
    });
    expect(updateOrganizationScimEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ action: "revoke", credentialSha256: null }),
    );
  });

  it("rejects an owner role mapping before database access", async () => {
    const form = groupForm();
    form.set("role", "owner");
    await expect(mapScimGroupRoleAction(idle, form)).resolves.toMatchObject({
      kind: "error",
    });
    expect(mapOrganizationScimGroupRole).not.toHaveBeenCalled();
  });
});

function createForm(): FormData {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("federationSourceId", sourceId);
  form.set("displayName", "Authentik directory");
  form.set("operationId", operationId);
  form.set("credential", credential);
  form.set("confirmation", "create-scim-endpoint");
  return form;
}

function endpointForm(action: "rotate" | "revoke"): FormData {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("endpointId", endpointId);
  form.set("expectedRevision", "2");
  form.set("operationId", operationId);
  form.set("credential", credential);
  form.set("scimAction", action);
  form.set("reason", `${action} the directory credential after review.`);
  form.set("confirmation", "scim-endpoint-lifecycle");
  return form;
}

function groupForm(): FormData {
  const form = new FormData();
  form.set("organizationId", organizationId);
  form.set("endpointId", endpointId);
  form.set("groupId", groupId);
  form.set("expectedRevision", "2");
  form.set("operationId", operationId);
  form.set("role", "operator");
  form.set("reason", "Approve this opaque group after access review.");
  form.set("confirmation", "map-scim-group");
  return form;
}
