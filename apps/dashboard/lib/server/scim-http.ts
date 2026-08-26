import {
  SCIM_CORE_GROUP_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  SCIM_ERROR_SCHEMA,
  SCIM_LIST_RESPONSE_SCHEMA,
  scimEndpointCredentialV1,
  scimFilterV1,
  scimGroupWriteV1,
  scimPatchRequestV1,
  scimUserWriteV1,
  type ScimFilterV1,
} from "@starfiniti/contracts";
import { createHash, randomUUID } from "node:crypto";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "@/lib/server/bounded-request-body";
import { getDatabase } from "@/lib/server/database";

const ENDPOINT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY_BYTES = 524_288;
const FILTER =
  /^\s*(id|externalId|userName|displayName)\s+eq\s+("(?:[^"\\]|\\.)*")\s*$/iu;

type ScimResourceType =
  "ServiceProviderConfig" | "ResourceTypes" | "Schemas" | "Users" | "Groups";

type ScimDatabaseRow = Readonly<{
  http_status: number;
  response_document: unknown | null;
  response_etag: string | null;
  quota_limit: number;
  quota_remaining: number;
  quota_reset_at: string;
}>;

type ScimTarget = Readonly<{
  resourceType: ScimResourceType;
  resourceId: string | null;
}>;

function scimError(
  status: number,
  detail: string,
  scimType?:
    | "invalidFilter"
    | "invalidSyntax"
    | "invalidValue"
    | "mutability"
    | "uniqueness"
    | "versionMismatch",
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/scim+json");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Vary", "Authorization");
  return Response.json(
    {
      schemas: [SCIM_ERROR_SCHEMA],
      status: String(status),
      ...(scimType ? { scimType } : {}),
      detail,
    },
    { status, headers: responseHeaders },
  );
}

function invalidCredential(): Response {
  return scimError(
    401,
    "The SCIM credential is invalid or revoked.",
    undefined,
    {
      "WWW-Authenticate": 'Bearer realm="starfiniti-scim"',
    },
  );
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return;
  return typeof error.code === "string" ? error.code : undefined;
}

function mapDatabaseError(error: unknown): Response {
  switch (databaseErrorCode(error)) {
    case "28000":
      return invalidCredential();
    case "P0001":
      return scimError(429, "The SCIM request quota was exceeded.", undefined, {
        "Retry-After": "60",
      });
    case "42501":
      return scimError(403, "The SCIM operation is not permitted.");
    case "23505":
    case "23514":
      return scimError(
        409,
        "The SCIM resource conflicts with an existing resource.",
        "uniqueness",
      );
    case "40001":
      return scimError(
        412,
        "The SCIM resource version no longer matches.",
        "versionMismatch",
      );
    case "22023":
      return scimError(400, "The SCIM operation is invalid.", "invalidValue");
    default:
      return scimError(503, "The SCIM service is temporarily unavailable.");
  }
}

function credentialSha256(request: Request): Buffer | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  const token = match?.[1];
  if (!token || !scimEndpointCredentialV1.safeParse(token).success) {
    return null;
  }
  return createHash("sha256").update(token).digest();
}

function parseTarget(resource: readonly string[]): ScimTarget | null {
  if (resource.length < 1 || resource.length > 2) return null;
  const [type, id] = resource;
  if (
    type !== "ServiceProviderConfig" &&
    type !== "ResourceTypes" &&
    type !== "Schemas" &&
    type !== "Users" &&
    type !== "Groups"
  ) {
    return null;
  }
  if (id && type !== "Users" && type !== "Groups") return null;
  if (id && !ENDPOINT_ID.test(id)) return null;
  return { resourceType: type, resourceId: id ?? null };
}

function positiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseFilter(
  value: string | null,
  resourceType: ScimResourceType,
): ScimFilterV1 | null | "invalid" {
  if (value === null) return null;
  const match = FILTER.exec(value);
  if (!match) return "invalid";
  let decoded: unknown;
  try {
    decoded = JSON.parse(match[2] ?? "");
  } catch {
    return "invalid";
  }
  const parsed = scimFilterV1.safeParse({
    attribute: match[1],
    operator: "eq",
    value: decoded,
  });
  if (!parsed.success) return "invalid";
  const allowed =
    resourceType === "Users"
      ? new Set(["id", "externalId", "userName"])
      : resourceType === "Groups"
        ? new Set(["id", "externalId", "displayName"])
        : new Set<string>();
  return allowed.has(parsed.data.attribute) ? parsed.data : "invalid";
}

async function readMutationBody(
  request: Request,
  target: ScimTarget,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("application/scim+json") &&
    !contentType.startsWith("application/json")
  ) {
    throw new ScimInputError(415, "invalidSyntax");
  }
  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      throw new ScimInputError(
        error.code === "body_too_large" ? 413 : 400,
        "invalidSyntax",
      );
    }
    throw new ScimInputError(400, "invalidSyntax");
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new ScimInputError(400, "invalidSyntax");
  }

  if (request.method === "PATCH") {
    const parsed = scimPatchRequestV1.safeParse(input);
    if (!parsed.success) throw new ScimInputError(400, "invalidValue");
    return parsed.data;
  }
  if (target.resourceType === "Users") {
    const parsed = scimUserWriteV1.safeParse(input);
    if (!parsed.success) throw new ScimInputError(400, "invalidValue");
    return {
      ...parsed.data,
      schemas: [SCIM_CORE_USER_SCHEMA],
      emails: [...(parsed.data.emails ?? [])].sort((left, right) =>
        left.value.localeCompare(right.value),
      ),
    };
  }
  if (target.resourceType === "Groups") {
    const parsed = scimGroupWriteV1.safeParse(input);
    if (!parsed.success) throw new ScimInputError(400, "invalidValue");
    return {
      ...parsed.data,
      schemas: [SCIM_CORE_GROUP_SCHEMA],
      members: parsed.data.members
        .map(({ value }) => ({ value }))
        .sort((left, right) => left.value.localeCompare(right.value)),
    };
  }
  throw new ScimInputError(400, "invalidValue");
}

class ScimInputError extends Error {
  constructor(
    readonly status: number,
    readonly scimType: "invalidFilter" | "invalidSyntax" | "invalidValue",
  ) {
    super(scimType);
  }
}

function baseUrl(request: Request, endpointId: string): string {
  let origin = new URL(request.url).origin;
  const configured = process.env.DASHBOARD_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      const candidate = new URL(configured);
      if (candidate.protocol === "https:" || candidate.protocol === "http:") {
        origin = candidate.origin;
      }
    } catch {
      // The route remains usable in local verification; production config
      // validation rejects an invalid public origin before deployment.
    }
  }
  return `${origin}/api/scim/${endpointId}/v2`;
}

function hydrateResource(
  value: unknown,
  resourceType: "Users" | "Groups",
  scimBaseUrl: string,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  if (Array.isArray(input.Resources)) {
    return {
      ...input,
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      Resources: input.Resources.map((resource) =>
        hydrateResource(resource, resourceType, scimBaseUrl),
      ),
    };
  }
  if (typeof input.id !== "string" || typeof input.revision !== "number") {
    return input;
  }
  const { createdAt, updatedAt, revision, ...attributes } = input;
  const kind = resourceType === "Users" ? "User" : "Group";
  const schema =
    resourceType === "Users" ? SCIM_CORE_USER_SCHEMA : SCIM_CORE_GROUP_SCHEMA;
  const members =
    resourceType === "Groups" && Array.isArray(attributes.members)
      ? attributes.members.map((member) => {
          if (!member || typeof member !== "object" || Array.isArray(member)) {
            return member;
          }
          const memberValue = (member as Record<string, unknown>).value;
          return typeof memberValue === "string"
            ? {
                value: memberValue,
                type: "User",
                $ref: `${scimBaseUrl}/Users/${memberValue}`,
              }
            : member;
        })
      : attributes.members;
  return {
    schemas: [schema],
    ...attributes,
    ...(resourceType === "Groups" ? { members } : {}),
    meta: {
      resourceType: kind,
      created: createdAt,
      lastModified: updatedAt,
      location: `${scimBaseUrl}/${resourceType}/${input.id}`,
      version: `W/"${revision}"`,
    },
  };
}

function rateHeaders(row: ScimDatabaseRow): Headers {
  const resetSeconds = Math.max(
    0,
    Math.ceil((Date.parse(row.quota_reset_at) - Date.now()) / 1000),
  );
  return new Headers({
    "Content-Type": "application/scim+json",
    "Cache-Control": "no-store",
    Vary: "Authorization",
    "RateLimit-Policy": `"scim";q=${row.quota_limit};w=60`,
    RateLimit: `"scim";r=${row.quota_remaining};t=${resetSeconds}`,
  });
}

export async function handleScimRequest(
  request: Request,
  context: Readonly<{
    params: Promise<{ endpointId: string; resource: string[] }>;
  }>,
): Promise<Response> {
  const { endpointId, resource } = await context.params;
  if (!ENDPOINT_ID.test(endpointId)) return invalidCredential();
  const credential = credentialSha256(request);
  if (!credential) return invalidCredential();
  const target = parseTarget(resource);
  if (!target) return scimError(404, "The SCIM resource was not found.");

  const requestUrl = new URL(request.url);
  const startIndex = positiveInteger(
    requestUrl.searchParams.get("startIndex"),
    1,
  );
  const count = positiveInteger(requestUrl.searchParams.get("count"), 100);
  if (startIndex === null || startIndex < 1 || count === null || count > 200) {
    return scimError(
      400,
      "The pagination parameters are invalid.",
      "invalidValue",
    );
  }
  const filter = parseFilter(
    requestUrl.searchParams.get("filter"),
    target.resourceType,
  );
  if (filter === "invalid") {
    return scimError(400, "The SCIM filter is not supported.", "invalidFilter");
  }

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      body = await readMutationBody(request, target);
    } catch (error) {
      if (error instanceof ScimInputError) {
        return scimError(
          error.status,
          error.status === 413
            ? "The SCIM request body is too large."
            : error.status === 415
              ? "The SCIM media type is not supported."
              : "The SCIM request body is invalid.",
          error.scimType,
        );
      }
      return scimError(
        400,
        "The SCIM request body is invalid.",
        "invalidSyntax",
      );
    }
  }

  try {
    const sql = getDatabase();
    const rows = await sql<ScimDatabaseRow[]>`
      select http_status, response_document, response_etag,
        quota_limit, quota_remaining, quota_reset_at
      from loyalty_private.organization_scim_request_v1(
        ${endpointId}::uuid,
        ${credential},
        ${request.method},
        ${target.resourceType},
        ${target.resourceId}::uuid,
        ${filter?.attribute ?? null},
        ${filter?.value ?? null},
        ${startIndex},
        ${count},
        ${body === null ? null : sql.json(body as never)},
        ${request.headers.get("if-match")},
        ${randomUUID()}::uuid
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("scim_result_unavailable");
    const headers = rateHeaders(row);
    if (row.response_etag) headers.set("ETag", row.response_etag);
    const scimBaseUrl = baseUrl(request, endpointId);
    if (row.http_status === 404) {
      return scimError(
        404,
        "The SCIM resource was not found.",
        undefined,
        headers,
      );
    }
    if (row.http_status === 204)
      return new Response(null, { status: 204, headers });
    const document =
      target.resourceType === "Users" || target.resourceType === "Groups"
        ? hydrateResource(
            row.response_document,
            target.resourceType,
            scimBaseUrl,
          )
        : row.response_document;
    if (
      row.http_status === 201 &&
      document &&
      typeof document === "object" &&
      !Array.isArray(document)
    ) {
      const location = (document as { meta?: { location?: unknown } }).meta
        ?.location;
      if (typeof location === "string") headers.set("Location", location);
    }
    return Response.json(document, { status: row.http_status, headers });
  } catch (error) {
    return mapDatabaseError(error);
  }
}
