import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const userSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const groupSchema = "urn:ietf:params:scim:schemas:core:2.0:Group";
const listSchema = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const errorSchema = "urn:ietf:params:scim:api:messages:2.0:Error";
const patchSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const configSchema =
  "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const baseUrl = "http://scim-runtime-sink:8080/v2";
const maximumBodyBytes = 256 * 1024;
const scimBearer = requiredEnvironment("SCIM_RUNTIME_BEARER");
const inspectionBearer = requiredEnvironment("SCIM_RUNTIME_INSPECTION_BEARER");

const users = new Map();
const groups = new Map();
const operations = [];
let userSequence = 0;
let groupSequence = 0;
let authorizationRejects = 0;
let serviceProviderConfigReads = 0;
let memberRemovalPaths = 0;

function requiredEnvironment(key) {
  const value = process.env[key];
  if (!value || value.length < 32 || value.length > 255) {
    throw new Error(`${key} must be a bounded synthetic credential`);
  }
  return value;
}

function equalBearer(actual, expected) {
  const left = Buffer.from(actual ?? "", "utf8");
  const right = Buffer.from(`Bearer ${expected}`, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function send(response, status, body = null, headers = {}) {
  if (body === null) {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, {
    "content-type": "application/scim+json",
    "content-length": String(bytes.length),
    ...headers,
  });
  response.end(bytes);
}

function scimError(response, status, detail) {
  send(response, status, {
    schemas: [errorSchema],
    status: String(status),
    detail,
  });
}

async function readBody(request) {
  const declared = request.headers["content-length"];
  if (
    declared !== undefined &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declared) ||
      Number(declared) > maximumBodyBytes)
  ) {
    throw new Error("body_too_large");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximumBodyBytes) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  if (total === 0) return {};
  const contentType = request.headers["content-type"]?.split(";", 1)[0];
  if (!["application/scim+json", "application/json"].includes(contentType)) {
    throw new Error("content_type_invalid");
  }
  const parsed = JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("body_invalid");
  }
  return parsed;
}

function recordOperation(request, url) {
  operations.push({
    method: request.method,
    path: url.pathname,
    count: url.searchParams.has("count"),
    startIndex: url.searchParams.has("startIndex"),
    filter: url.searchParams.has("filter"),
  });
  if (operations.length > 500) operations.shift();
}

function resourceMeta(type, id) {
  return {
    resourceType: type,
    location: `${baseUrl}/${type === "User" ? "Users" : "Groups"}/${id}`,
  };
}

function normalizeUser(input, id = null) {
  if (
    typeof input.userName !== "string" ||
    input.userName.length < 1 ||
    typeof input.externalId !== "string" ||
    input.externalId.length < 1
  ) {
    throw new Error("user_invalid");
  }
  const resourceId = id ?? `user-${String(++userSequence).padStart(4, "0")}`;
  return {
    ...input,
    schemas: Array.isArray(input.schemas) ? input.schemas : [userSchema],
    id: resourceId,
    active: input.active !== false,
    meta: resourceMeta("User", resourceId),
  };
}

function normalizeGroup(input, id = null, existingMembers = []) {
  if (
    typeof input.displayName !== "string" ||
    input.displayName.length < 1 ||
    typeof input.externalId !== "string" ||
    input.externalId.length < 1
  ) {
    throw new Error("group_invalid");
  }
  const resourceId = id ?? `group-${String(++groupSequence).padStart(4, "0")}`;
  const suppliedMembers = Array.isArray(input.members)
    ? input.members
        .filter((member) => typeof member?.value === "string")
        .map((member) => ({ value: member.value }))
    : existingMembers;
  return {
    ...input,
    schemas: Array.isArray(input.schemas) ? input.schemas : [groupSchema],
    id: resourceId,
    members: suppliedMembers,
    meta: resourceMeta("Group", resourceId),
  };
}

function matchingResources(collection, url, fields) {
  let resources = [...collection.values()];
  const filter = url.searchParams.get("filter");
  if (filter) {
    const match = /^([A-Za-z][A-Za-z0-9]*) eq "([^"\\]{1,512})"$/u.exec(filter);
    if (!match || !fields.includes(match[1])) throw new Error("filter_invalid");
    resources = resources.filter((resource) => resource[match[1]] === match[2]);
  }
  const totalResults = resources.length;
  const startIndex = parsePositive(url.searchParams.get("startIndex"), 1);
  const count = parsePositive(url.searchParams.get("count"), 100);
  resources = resources.slice(startIndex - 1, startIndex - 1 + count);
  return {
    schemas: [listSchema],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

function parsePositive(value, fallback) {
  if (value === null) return fallback;
  if (!/^[1-9][0-9]{0,5}$/u.test(value)) throw new Error("page_invalid");
  return Number(value);
}

function duplicate(collection, field, value, exceptId = null) {
  return [...collection.values()].some(
    (resource) => resource.id !== exceptId && resource[field] === value,
  );
}

function applyGroupPatch(group, body) {
  if (!Array.isArray(body.Operations) || !body.schemas?.includes(patchSchema)) {
    throw new Error("patch_invalid");
  }
  let updated = structuredClone(group);
  for (const operation of body.Operations) {
    const op = String(operation?.op ?? "").toLowerCase();
    if (
      op === "replace" &&
      (operation.path === undefined || operation.path === null)
    ) {
      updated = normalizeGroup(
        { ...updated, ...operation.value },
        updated.id,
        updated.members,
      );
      continue;
    }
    if (op === "replace" && operation.path === "displayName") {
      updated.displayName = operation.value;
      continue;
    }
    if (op === "replace" && operation.path === "externalId") {
      updated.externalId = operation.value;
      continue;
    }
    if (op === "add" && operation.path === "members") {
      const additions = Array.isArray(operation.value) ? operation.value : [];
      for (const member of additions) {
        if (
          typeof member?.value === "string" &&
          !updated.members.some((item) => item.value === member.value)
        ) {
          updated.members.push({ value: member.value });
        }
      }
      continue;
    }
    if (op === "remove") {
      const match = /^members\[value eq "([^"\\]{1,512})"\]$/u.exec(
        operation.path ?? "",
      );
      if (!match) throw new Error("patch_path_invalid");
      memberRemovalPaths += 1;
      updated.members = updated.members.filter(
        (member) => member.value !== match[1],
      );
      continue;
    }
    throw new Error("patch_operation_unsupported");
  }
  return updated;
}

function applyUserPatch(user, body) {
  if (!Array.isArray(body.Operations) || !body.schemas?.includes(patchSchema)) {
    throw new Error("patch_invalid");
  }
  const updated = structuredClone(user);
  for (const operation of body.Operations) {
    if (
      String(operation?.op ?? "").toLowerCase() !== "replace" ||
      operation.path !== "active" ||
      typeof operation.value !== "boolean"
    ) {
      throw new Error("patch_operation_unsupported");
    }
    updated.active = operation.value;
  }
  return updated;
}

function inspectionState() {
  return {
    operations: operations.length,
    authorizationRejects,
    serviceProviderConfigReads,
    paginationRequests: operations.filter(
      (operation) => operation.count && operation.startIndex,
    ).length,
    memberRemovalPaths,
    users: [...users.values()].map((user) => ({
      id: user.id,
      externalId: user.externalId,
      active: user.active,
    })),
    groups: [...groups.values()].map((group) => ({
      id: group.id,
      externalId: group.externalId,
      members: group.members.map((member) => member.value),
    })),
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", baseUrl);
    if (url.pathname === "/_state") {
      if (!equalBearer(request.headers.authorization, inspectionBearer)) {
        send(
          response,
          401,
          { error: "unauthorized" },
          {
            "content-type": "application/json",
          },
        );
        return;
      }
      send(response, 200, inspectionState(), {
        "content-type": "application/json",
      });
      return;
    }
    if (!url.pathname.startsWith("/v2/")) {
      scimError(response, 404, "Not found");
      return;
    }
    if (!equalBearer(request.headers.authorization, scimBearer)) {
      authorizationRejects += 1;
      scimError(response, 401, "Unauthorized");
      return;
    }
    recordOperation(request, url);

    if (
      request.method === "GET" &&
      url.pathname === "/v2/ServiceProviderConfig"
    ) {
      serviceProviderConfigReads += 1;
      send(response, 200, {
        schemas: [configSchema],
        patch: { supported: true },
        bulk: {
          supported: false,
          maxOperations: 10,
          maxPayloadSize: 1_048_576,
        },
        filter: { supported: true, maxResults: 100 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
          {
            type: "oauthbearertoken",
            name: "Bearer token",
            description: "Synthetic runtime bearer token",
            specUri: "https://www.rfc-editor.org/rfc/rfc6750",
            primary: true,
          },
        ],
        meta: {
          resourceType: "ServiceProviderConfig",
          location: `${baseUrl}/ServiceProviderConfig`,
        },
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v2/ResourceTypes") {
      send(response, 200, {
        schemas: [listSchema],
        totalResults: 2,
        startIndex: 1,
        itemsPerPage: 2,
        Resources: [
          { id: "User", name: "User", endpoint: "/Users", schema: userSchema },
          {
            id: "Group",
            name: "Group",
            endpoint: "/Groups",
            schema: groupSchema,
          },
        ],
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v2/Schemas") {
      send(response, 200, {
        schemas: [listSchema],
        totalResults: 2,
        startIndex: 1,
        itemsPerPage: 2,
        Resources: [
          { id: userSchema, name: "User", attributes: [] },
          { id: groupSchema, name: "Group", attributes: [] },
        ],
      });
      return;
    }

    const isUsers = url.pathname === "/v2/Users";
    const isGroups = url.pathname === "/v2/Groups";
    if (request.method === "GET" && isUsers) {
      send(
        response,
        200,
        matchingResources(users, url, ["externalId", "userName"]),
      );
      return;
    }
    if (request.method === "GET" && isGroups) {
      send(
        response,
        200,
        matchingResources(groups, url, ["externalId", "displayName"]),
      );
      return;
    }
    if (request.method === "POST" && isUsers) {
      const body = await readBody(request);
      const resource = normalizeUser(body);
      if (
        duplicate(users, "externalId", resource.externalId) ||
        duplicate(users, "userName", resource.userName)
      ) {
        scimError(response, 409, "User already exists");
        return;
      }
      users.set(resource.id, resource);
      send(response, 201, resource, { location: resource.meta.location });
      return;
    }
    if (request.method === "POST" && isGroups) {
      const body = await readBody(request);
      const resource = normalizeGroup(body);
      if (
        duplicate(groups, "externalId", resource.externalId) ||
        duplicate(groups, "displayName", resource.displayName)
      ) {
        scimError(response, 409, "Group already exists");
        return;
      }
      groups.set(resource.id, resource);
      send(response, 201, resource, { location: resource.meta.location });
      return;
    }

    const itemMatch = /^\/v2\/(Users|Groups)\/([A-Za-z0-9._~-]{1,128})$/u.exec(
      url.pathname,
    );
    if (!itemMatch) {
      scimError(response, 404, "Not found");
      return;
    }
    const collection = itemMatch[1] === "Users" ? users : groups;
    const current = collection.get(itemMatch[2]);
    if (!current) {
      scimError(response, 404, "Resource not found");
      return;
    }
    if (request.method === "GET") {
      send(response, 200, current);
      return;
    }
    if (request.method === "DELETE") {
      collection.delete(itemMatch[2]);
      send(response, 204);
      return;
    }
    if (request.method === "PUT") {
      const body = await readBody(request);
      const updated =
        itemMatch[1] === "Users"
          ? normalizeUser(body, current.id)
          : normalizeGroup(body, current.id, current.members);
      collection.set(current.id, updated);
      send(response, 200, updated);
      return;
    }
    if (request.method === "PATCH") {
      const body = await readBody(request);
      const updated =
        itemMatch[1] === "Users"
          ? applyUserPatch(current, body)
          : applyGroupPatch(current, body);
      collection.set(current.id, updated);
      send(response, 200, updated);
      return;
    }
    scimError(response, 405, "Method not allowed");
  } catch (error) {
    scimError(
      response,
      error instanceof SyntaxError ? 400 : 400,
      "Invalid SCIM request",
    );
  }
});

server.listen(8080, "0.0.0.0");
