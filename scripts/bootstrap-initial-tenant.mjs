import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import postgres from "postgres";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(message) {
  throw new Error(`Initial tenant bootstrap failed: ${message}`);
}

function validateSlug(name, value) {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 80 ||
    value !== value.trim().toLowerCase() ||
    !slugPattern.test(value)
  ) {
    fail(`${name} must be a canonical lowercase slug of 2 to 80 characters`);
  }
}

function validateName(name, value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${name} must be a trimmed, control-free name of 1 to 200 characters`);
  }
}

export function validateBootstrapInput(input) {
  if (!uuidPattern.test(input.authUserId ?? "")) {
    fail("--auth-user-id must be a UUID for an existing Supabase Auth user");
  }
  validateSlug("--organization-slug", input.organizationSlug);
  validateName("--organization-name", input.organizationName);
  validateSlug("--workspace-slug", input.workspaceSlug);
  validateName("--workspace-name", input.workspaceName);
  validateSlug("--programme-group-slug", input.programmeGroupSlug);
  validateName("--programme-group-name", input.programmeGroupName);
  if (input.confirm !== input.organizationSlug) {
    fail("--confirm must exactly match --organization-slug");
  }
  if (!/^[A-Z][A-Z0-9_]*$/u.test(input.databaseUrlEnvironment ?? "")) {
    fail("--database-url-env must name an uppercase environment variable");
  }
  return {
    ...input,
    idempotencyKey: `tenant-bootstrap:${input.organizationSlug}`,
  };
}

function validateAdminDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("the administration database environment variable is not a URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length < 2
  ) {
    fail(
      "the administration database URL must include PostgreSQL host, database, user, and password",
    );
  }
  if (
    ["loyalty_runtime", "loyalty_worker", "anon", "authenticated"].includes(
      decodeURIComponent(parsed.username).toLowerCase(),
    )
  ) {
    fail("the administration database URL cannot use an application role");
  }
  return value;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function parseBootstrapArguments() {
  return validateBootstrapInput({
    authUserId: argument("--auth-user-id"),
    organizationSlug: argument("--organization-slug"),
    organizationName: argument("--organization-name"),
    workspaceSlug: argument("--workspace-slug"),
    workspaceName: argument("--workspace-name"),
    programmeGroupSlug: argument("--programme-group-slug"),
    programmeGroupName: argument("--programme-group-name"),
    confirm: argument("--confirm"),
    databaseUrlEnvironment: argument("--database-url-env"),
  });
}

function expectFailure(callback) {
  try {
    callback();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Initial tenant bootstrap self-test expected a failure.");
}

export function runSelfTest() {
  const valid = {
    authUserId: "8b000000-0000-4000-8000-000000000001",
    organizationSlug: "example-tenant",
    organizationName: "Example Tenant",
    workspaceSlug: "main-store",
    workspaceName: "Main Store",
    programmeGroupSlug: "shared-loyalty",
    programmeGroupName: "Shared Loyalty",
    confirm: "example-tenant",
    databaseUrlEnvironment: "STARFINITI_ADMIN_DATABASE_URL",
  };
  const normalized = validateBootstrapInput(valid);
  if (normalized.idempotencyKey !== "tenant-bootstrap:example-tenant") {
    throw new Error("Initial tenant bootstrap self-test derived a wrong key.");
  }
  const failures = [
    expectFailure(() =>
      validateBootstrapInput({ ...valid, authUserId: "not-a-uuid" }),
    ),
    expectFailure(() =>
      validateBootstrapInput({ ...valid, organizationSlug: "Bad Slug" }),
    ),
    expectFailure(() =>
      validateBootstrapInput({ ...valid, organizationName: " Tenant " }),
    ),
    expectFailure(() =>
      validateBootstrapInput({ ...valid, confirm: "another-tenant" }),
    ),
    expectFailure(() => validateAdminDatabaseUrl("secret-value")),
    expectFailure(() =>
      validateAdminDatabaseUrl(
        "postgresql://loyalty_runtime:do-not-print@database.invalid/postgres",
      ),
    ),
  ];
  for (const message of failures) {
    if (message.includes("do-not-print")) {
      throw new Error("Initial tenant bootstrap self-test exposed a secret.");
    }
  }
  console.log(
    "Validated first-tenant bootstrap inputs, confirmation, role separation, deterministic retries, and redacted failures.",
  );
}

export async function bootstrapInitialTenant(input, databaseUrl) {
  const configuration = validateBootstrapInput(input);
  const sql = postgres(validateAdminDatabaseUrl(databaseUrl), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    onnotice: () => {},
  });
  try {
    return await sql.begin(async (transaction) => {
      const [authority] = await transaction`
        select
          (
            select role.rolsuper
            from pg_catalog.pg_roles as role
            where role.rolname = current_user
          ) as is_superuser,
          pg_catalog.pg_has_role(
            current_user,
            'loyalty_owner',
            'MEMBER'
          ) as is_owner_member
      `;
      if (!authority?.is_superuser && !authority?.is_owner_member) {
        fail(
          "database login is neither a superuser nor a member of loyalty_owner",
        );
      }
      await transaction`set local role loyalty_owner`;
      const [result] = await transaction`
        select *
        from loyalty_private.bootstrap_initial_tenant(
          ${configuration.authUserId}::uuid,
          ${configuration.organizationSlug},
          ${configuration.organizationName},
          ${configuration.workspaceSlug},
          ${configuration.workspaceName},
          ${configuration.programmeGroupSlug},
          ${configuration.programmeGroupName},
          ${configuration.idempotencyKey},
          ${randomUUID()}::uuid
        )
      `;
      if (
        !result ||
        !["created", "retry"].includes(result.outcome) ||
        !result.organization_public_id ||
        !result.workspace_public_id ||
        !result.programme_group_public_id ||
        !result.membership_public_id
      ) {
        fail("database returned an invalid bootstrap result");
      }
      return result;
    });
  } finally {
    await sql.end({ timeout: 2 });
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const input = parseBootstrapArguments();
    const databaseUrl = process.env[input.databaseUrlEnvironment];
    if (!databaseUrl) {
      fail(
        `environment variable ${input.databaseUrlEnvironment} is not populated`,
      );
    }
    const result = await bootstrapInitialTenant(input, databaseUrl);
    console.log(
      JSON.stringify({
        outcome: result.outcome,
        organizationPublicId: result.organization_public_id,
        workspacePublicId: result.workspace_public_id,
        programmeGroupPublicId: result.programme_group_public_id,
        membershipPublicId: result.membership_public_id,
      }),
    );
  }
}
