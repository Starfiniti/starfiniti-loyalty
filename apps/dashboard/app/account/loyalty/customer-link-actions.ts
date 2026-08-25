"use server";

import {
  unlinkCrossWorkspaceCustomerAccountCommandV1,
  unlinkCrossWorkspaceCustomerAccountResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerLinkActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

export async function unlinkCustomerStoreAccount(
  _previousState: CustomerLinkActionState,
  formData: FormData,
): Promise<CustomerLinkActionState> {
  if (formData.get("confirmation") !== "unlink") {
    return {
      kind: "error",
      message: "Confirm that you want to disconnect this store account.",
    };
  }
  const accountId = String(formData.get("accountId") ?? "");
  const command = unlinkCrossWorkspaceCustomerAccountCommandV1.safeParse({
    version: "1",
    accountId,
    idempotencyKey: `customer-link:unlink:${accountId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message: "The store account selector is invalid. Refresh and retry.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    return { kind: "error", message: "Sign in again before disconnecting." };
  }

  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("unlink_my_cross_workspace_customer_account_v1", {
      target_account_public_id: command.data.accountId,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "23514"
          ? "This account anchors shared value or has already changed. Refresh before retrying."
          : error.code === "42501"
            ? "This store account is not linked to your signed-in profile."
            : "The store account could not be disconnected safely.",
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = unlinkCrossWorkspaceCustomerAccountResultV1.safeParse(
    row
      ? {
          linkSetId: row.link_set_public_id,
          accountId: row.account_public_id,
          outcome: row.outcome,
          revision: row.revision,
          state: row.state,
        }
      : null,
  );
  if (!result.success || result.data.accountId !== command.data.accountId) {
    return {
      kind: "error",
      message: "The disconnect response could not be verified safely.",
    };
  }

  revalidatePath("/account/loyalty");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? "This store account is already disconnected."
        : "Store account disconnected. Existing points and history were not changed.",
  };
}
