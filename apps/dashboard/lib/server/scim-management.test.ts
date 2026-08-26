import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    schema: vi.fn(() => ({ rpc })),
  })),
}));

import {
  createOrganizationScimEndpoint,
  getOrganizationScimWorkspace,
  issueOrganizationScimCredential,
  mapOrganizationScimGroupRole,
  updateOrganizationScimEndpoint,
} from "./scim-management";

const organizationId = "bf2247d8-893e-49ae-8363-8423928e9cc1";
const sourceId = "bf2247d8-893e-49ae-8363-8423928e9cc2";
const endpointId = "bf2247d8-893e-49ae-8363-8423928e9cc3";
const groupId = "bf2247d8-893e-49ae-8363-8423928e9cc4";
const correlationId = "bf2247d8-893e-49ae-8363-8423928e9cc5";

describe("SCIM merchant database boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("issues a high-entropy credential and retains only its digest", () => {
    const issued = issueOrganizationScimCredential();
    expect(issued.credential).toMatch(/^stf_scim_[A-Za-z0-9_-]{43}$/u);
    expect(issued.credentialSha256).toBe(
      createHash("sha256").update(issued.credential, "utf8").digest("hex"),
    );
    expect(issued).not.toHaveProperty("rawCredentialSha256");
  });

  it("reads and independently parses the minimized workspace", async () => {
    rpc.mockResolvedValue({
      data: {
        schemaVersion: "1",
        organization: {
          id: organizationId,
          name: "Starfiniti",
          slug: "starfiniti",
          status: "active",
        },
        currentRole: "auditor",
        mayConfigure: false,
        entitlementEnabled: true,
        endpoints: [],
        groups: [],
        events: [],
      },
      error: null,
    });
    await expect(
      getOrganizationScimWorkspace(organizationId),
    ).resolves.toMatchObject({
      currentRole: "auditor",
      endpoints: [],
    });
  });

  it("sends only a bytea digest when creating an endpoint", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          endpoint_public_id: endpointId,
          outcome: "created",
          lifecycle_revision: 1,
          credential_revision: 1,
        },
      ],
      error: null,
    });
    const result = await createOrganizationScimEndpoint({
      version: "1",
      organizationId,
      federationSourceId: sourceId,
      displayName: "Corporate directory",
      credentialSha256: "a".repeat(64),
      idempotencyKey: "scim:create:one",
      correlationId,
    });
    expect(result).toMatchObject({
      endpointId,
      outcome: "created",
      status: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_organization_scim_endpoint_command_v1",
      expect.objectContaining({
        target_credential_sha256: `\\x${"a".repeat(64)}`,
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("stf_scim_");
  });

  it("maps roles and revokes endpoints through revision-checked commands", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            group_public_id: groupId,
            outcome: "updated",
            lifecycle_revision: 3,
            mapped_role: "operator",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            endpoint_public_id: endpointId,
            outcome: "revoke",
            lifecycle_revision: 2,
            credential_revision: 1,
            status: "revoked",
          },
        ],
        error: null,
      });
    await expect(
      mapOrganizationScimGroupRole({
        version: "1",
        organizationId,
        endpointId,
        groupId,
        expectedRevision: 2,
        role: "operator",
        reason: "Approve the operations group mapping.",
        idempotencyKey: "scim:map:one",
        correlationId,
      }),
    ).resolves.toMatchObject({ mappedRole: "operator", revision: 3 });
    await expect(
      updateOrganizationScimEndpoint({
        version: "1",
        organizationId,
        endpointId,
        expectedRevision: 1,
        action: "revoke",
        credentialSha256: null,
        reason: "Revoke the compromised directory credential.",
        idempotencyKey: "scim:revoke:one",
        correlationId,
      }),
    ).resolves.toMatchObject({ status: "revoked", revision: 2 });
  });
});
