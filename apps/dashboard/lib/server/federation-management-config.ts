import "server-only";

import { isAbsolute } from "node:path";
import { readFileSync } from "node:fs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type FederationManagementConfig = Readonly<{
  authentikOrigin: string;
  supabaseUrl: string;
  supabaseCallbackUrl: string;
  sourceAuthenticationFlowId: string;
  sourceEnrollmentFlowId: string;
  providerAuthorizationFlowId: string;
  providerInvalidationFlowId: string;
  providerSigningKeyId: string;
  providerOpenidPropertyMappingId: string;
  sourceUserPropertyMappingIds: readonly string[];
  authentikToken: string;
  supabaseServiceRoleKey: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
type FileReader = (path: string) => string;

export function readFederationManagementConfig(
  environment: Environment = process.env,
  readFile: FileReader = (path) => readFileSync(path, "utf8"),
): FederationManagementConfig {
  const configPath = absolutePath(
    environment.LOYALTY_FEDERATION_CONFIG_FILE,
    "federation_management_config_unavailable",
  );
  const authentikTokenPath = absolutePath(
    environment.LOYALTY_AUTHENTIK_API_TOKEN_FILE,
    "federation_management_secret_unavailable",
  );
  const supabaseKeyPath = absolutePath(
    environment.LOYALTY_SUPABASE_SERVICE_ROLE_KEY_FILE,
    "federation_management_secret_unavailable",
  );
  let document: unknown;
  try {
    document = JSON.parse(readFile(configPath));
  } catch {
    throw new Error("federation_management_config_invalid");
  }
  if (!isRecord(document)) {
    throw new Error("federation_management_config_invalid");
  }
  const allowedKeys = new Set([
    "authentikOrigin",
    "supabaseUrl",
    "sourceAuthenticationFlowId",
    "sourceEnrollmentFlowId",
    "providerAuthorizationFlowId",
    "providerInvalidationFlowId",
    "providerSigningKeyId",
    "providerOpenidPropertyMappingId",
    "sourceUserPropertyMappingIds",
  ]);
  if (Object.keys(document).some((key) => !allowedKeys.has(key))) {
    throw new Error("federation_management_config_invalid");
  }

  const authentikOrigin = exactHttpsOrigin(document.authentikOrigin);
  const supabaseUrl = exactHttpsOrigin(document.supabaseUrl);
  const config: FederationManagementConfig = Object.freeze({
    authentikOrigin,
    supabaseUrl,
    supabaseCallbackUrl: `${supabaseUrl}/auth/v1/callback`,
    sourceAuthenticationFlowId: uuid(document.sourceAuthenticationFlowId),
    sourceEnrollmentFlowId: uuid(document.sourceEnrollmentFlowId),
    providerAuthorizationFlowId: uuid(document.providerAuthorizationFlowId),
    providerInvalidationFlowId: uuid(document.providerInvalidationFlowId),
    providerSigningKeyId: uuid(document.providerSigningKeyId),
    providerOpenidPropertyMappingId: uuid(
      document.providerOpenidPropertyMappingId,
    ),
    sourceUserPropertyMappingIds: uuidList(
      document.sourceUserPropertyMappingIds,
      1,
      20,
    ),
    authentikToken: secret(readFile, authentikTokenPath),
    supabaseServiceRoleKey: secret(readFile, supabaseKeyPath),
  });
  return config;
}

function absolutePath(value: string | undefined, code: string): string {
  const path = value?.trim();
  if (!path || !isAbsolute(path) || path.includes("\0")) {
    throw new Error(code);
  }
  return path;
}

function exactHttpsOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new Error("federation_management_config_invalid");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("federation_management_config_invalid");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/" ||
    (url.port !== "" && url.port !== "443") ||
    value !== url.origin
  ) {
    throw new Error("federation_management_config_invalid");
  }
  return url.origin;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error("federation_management_config_invalid");
  }
  return value.toLowerCase();
}

function uuidList(value: unknown, minimum: number, maximum: number): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error("federation_management_config_invalid");
  }
  const parsed = value.map(uuid);
  if (new Set(parsed).size !== parsed.length) {
    throw new Error("federation_management_config_invalid");
  }
  return parsed;
}

function secret(readFile: FileReader, path: string): string {
  let value: string;
  try {
    value = readFile(path).trim();
  } catch {
    throw new Error("federation_management_secret_unavailable");
  }
  if (
    value.length < 32 ||
    value.length > 8_192 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error("federation_management_secret_invalid");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
