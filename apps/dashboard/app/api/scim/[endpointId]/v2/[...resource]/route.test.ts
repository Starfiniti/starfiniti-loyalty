import {
  SCIM_CORE_GROUP_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  SCIM_ERROR_SCHEMA,
  SCIM_LIST_RESPONSE_SCHEMA,
  SCIM_PATCH_SCHEMA,
} from "@starfiniti/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ getDatabase: mocks.getDatabase }));

import { GET, PATCH, POST } from "./route";

const endpointId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const token = `stf_scim_${"A".repeat(43)}`;

function context(resource: string[]) {
  return { params: Promise.resolve({ endpointId, resource }) };
}

function request(
  method: string,
  resource: string,
  init: Omit<RequestInit, "method"> = {},
) {
  return new Request(
    `https://loyalty.example.test/api/scim/${endpointId}/v2/${resource}`,
    {
      method,
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/scim+json" } : {}),
        ...init.headers,
      },
    },
  );
}

function databaseReturning(row: Record<string, unknown>) {
  const query = vi.fn(async () => [row]) as ReturnType<typeof vi.fn> & {
    json: (value: unknown) => unknown;
  };
  query.json = (value) => value;
  mocks.getDatabase.mockReturnValue(query);
  return query;
}

describe("organization SCIM API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_PUBLIC_ORIGIN = "https://loyalty.example.test";
  });

  it("rejects malformed bearer credentials before database access", async () => {
    const response = await GET(
      request("GET", "ServiceProviderConfig", {
        headers: { authorization: "Bearer email@example.test" },
      }),
      context(["ServiceProviderConfig"]),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="starfiniti-scim"',
    );
    expect(response.headers.get("content-type")).toContain(
      "application/scim+json",
    );
    expect(await response.json()).toMatchObject({
      schemas: [SCIM_ERROR_SCHEMA],
      status: "401",
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("returns database-authorized discovery with bounded quota headers", async () => {
    databaseReturning({
      http_status: 200,
      response_document: {
        schemas: [
          "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
        ],
        patch: { supported: true },
        filter: { supported: true, maxResults: 200 },
      },
      response_etag: null,
      quota_limit: 300,
      quota_remaining: 299,
      quota_reset_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const response = await GET(
      request("GET", "ServiceProviderConfig"),
      context(["ServiceProviderConfig"]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("ratelimit-policy")).toBe('"scim";q=300;w=60');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      patch: { supported: true },
      filter: { supported: true, maxResults: 200 },
    });
  });

  it("normalizes a created User and publishes an exact resource location", async () => {
    const query = databaseReturning({
      http_status: 201,
      response_document: {
        id: userId,
        externalId: "opaque-hashed-subject",
        userName: "directory-user-1",
        displayName: "Directory user",
        emails: [],
        active: true,
        createdAt: "2026-08-26T16:00:00.000Z",
        updatedAt: "2026-08-26T16:00:00.000Z",
        revision: 1,
      },
      response_etag: 'W/"1"',
      quota_limit: 300,
      quota_remaining: 298,
      quota_reset_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const response = await POST(
      request("POST", "Users", {
        body: JSON.stringify({
          schemas: [SCIM_CORE_USER_SCHEMA],
          externalId: "opaque-hashed-subject",
          userName: "directory-user-1",
          displayName: "Directory user",
          active: true,
        }),
      }),
      context(["Users"]),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('W/"1"');
    expect(response.headers.get("location")).toBe(
      `https://loyalty.example.test/api/scim/${endpointId}/v2/Users/${userId}`,
    );
    expect(await response.json()).toEqual({
      schemas: [SCIM_CORE_USER_SCHEMA],
      id: userId,
      externalId: "opaque-hashed-subject",
      userName: "directory-user-1",
      displayName: "Directory user",
      emails: [],
      active: true,
      meta: {
        resourceType: "User",
        created: "2026-08-26T16:00:00.000Z",
        lastModified: "2026-08-26T16:00:00.000Z",
        location: `https://loyalty.example.test/api/scim/${endpointId}/v2/Users/${userId}`,
        version: 'W/"1"',
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails unsupported filters and invalid representations before SQL", async () => {
    const filtered = await GET(
      request("GET", "Users?filter=displayName%20eq%20%22Admin%22"),
      context(["Users"]),
    );
    expect(filtered.status).toBe(400);
    expect(await filtered.json()).toMatchObject({
      schemas: [SCIM_ERROR_SCHEMA],
      scimType: "invalidFilter",
    });

    const invalid = await POST(
      request("POST", "Users", {
        body: JSON.stringify({
          schemas: [SCIM_CORE_USER_SCHEMA],
          userName: "email-is-not-authority@example.test",
          active: true,
        }),
      }),
      context(["Users"]),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ scimType: "invalidValue" });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("maps stale versions, uniqueness, rate limits, and provider failures safely", async () => {
    for (const [error, status, scimType] of [
      [{ code: "40001" }, 412, "versionMismatch"],
      [{ code: "23505" }, 409, "uniqueness"],
      [{ code: "P0001" }, 429, undefined],
      [{ code: "XX000" }, 503, undefined],
    ] as const) {
      const query = vi.fn(async () => {
        throw error;
      }) as ReturnType<typeof vi.fn> & { json: (value: unknown) => unknown };
      query.json = (value) => value;
      mocks.getDatabase.mockReturnValue(query);
      const response = await GET(request("GET", "Users"), context(["Users"]));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        schemas: [SCIM_ERROR_SCHEMA],
        status: String(status),
        ...(scimType ? { scimType } : {}),
      });
    }
  });

  it("hydrates list resources without accepting response-side authority", async () => {
    databaseReturning({
      http_status: 200,
      response_document: {
        schemas: [SCIM_LIST_RESPONSE_SCHEMA],
        totalResults: 0,
        startIndex: 1,
        itemsPerPage: 0,
        Resources: [],
      },
      response_etag: null,
      quota_limit: 300,
      quota_remaining: 299,
      quota_reset_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const response = await GET(request("GET", "Users"), context(["Users"]));
    expect(await response.json()).toEqual({
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: 0,
      startIndex: 1,
      itemsPerPage: 0,
      Resources: [],
    });
  });

  it("accepts bounded Group PATCH operations and hydrates member references", async () => {
    const groupId = "30000000-0000-4000-8000-000000000001";
    const query = databaseReturning({
      http_status: 200,
      response_document: {
        id: groupId,
        externalId: "opaque-group-1",
        displayName: "Loyalty operators",
        members: [{ value: userId }],
        createdAt: "2026-08-26T16:00:00.000Z",
        updatedAt: "2026-08-26T16:03:00.000Z",
        revision: 2,
      },
      response_etag: 'W/"2"',
      quota_limit: 300,
      quota_remaining: 297,
      quota_reset_at: new Date(Date.now() + 30_000).toISOString(),
    });
    const response = await PATCH(
      request("PATCH", `Groups/${groupId}`, {
        headers: { "if-match": 'W/"1"' },
        body: JSON.stringify({
          schemas: [SCIM_PATCH_SCHEMA],
          Operations: [
            { op: "Add", path: "members", value: [{ value: userId }] },
          ],
        }),
      }),
      context(["Groups", groupId]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"2"');
    expect(await response.json()).toMatchObject({
      schemas: [SCIM_CORE_GROUP_SCHEMA],
      id: groupId,
      members: [
        {
          value: userId,
          type: "User",
          $ref: `https://loyalty.example.test/api/scim/${endpointId}/v2/Users/${userId}`,
        },
      ],
    });
    expect(JSON.stringify(query.mock.calls)).toContain('"op":"add"');
    expect(JSON.stringify(query.mock.calls)).toContain('W/\\"1\\"');
  });

  it("rejects an oversized representation before database access", async () => {
    const response = await POST(
      request("POST", "Users", {
        body: JSON.stringify({
          schemas: [SCIM_CORE_USER_SCHEMA],
          externalId: "opaque-hashed-subject",
          userName: "x".repeat(524_288),
        }),
      }),
      context(["Users"]),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      schemas: [SCIM_ERROR_SCHEMA],
      status: "413",
      scimType: "invalidSyntax",
    });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
});
