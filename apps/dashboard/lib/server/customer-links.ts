import "server-only";
import {
  crossWorkspaceCustomerLinksV1,
  type CrossWorkspaceCustomerLinksV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerLinksState =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "ready"; value: CrossWorkspaceCustomerLinksV1 }>;

export async function getCustomerLinksState(): Promise<CustomerLinksState> {
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    return { kind: "unauthenticated" };
  }

  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_my_cross_workspace_customer_links_v1");
  if (error || !Array.isArray(data) || data.length !== 1) {
    return { kind: "unavailable" };
  }
  const row = data[0];
  const parsed = crossWorkspaceCustomerLinksV1.safeParse(
    row && typeof row === "object" && "document" in row
      ? (row as { document?: unknown }).document
      : undefined,
  );
  return parsed.success
    ? { kind: "ready", value: parsed.data }
    : { kind: "unavailable" };
}
