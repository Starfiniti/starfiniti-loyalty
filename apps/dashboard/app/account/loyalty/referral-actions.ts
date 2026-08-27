"use server";

import {
  createMyReferralLinkCommandV1,
  createMyReferralLinkResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerReferralLinkState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
  shareUrl: string | null;
}>;

function error(message: string): CustomerReferralLinkState {
  return { kind: "error", message, shareUrl: null };
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

export async function createCustomerReferralLink(
  _previousState: CustomerReferralLinkState,
  formData: FormData,
): Promise<CustomerReferralLinkState> {
  const command = createMyReferralLinkCommandV1.safeParse({
    version: "1",
    accountId: formData.get("accountId"),
    requestId: formData.get("operationId"),
  });
  if (!command.success) {
    return error("The referral request is invalid. Refresh and try again.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: databaseError } = await supabase
    .schema("loyalty")
    .rpc("create_my_referral_link", {
      target_account_public_id: command.data.accountId,
      target_request_id: command.data.requestId,
    });
  if (databaseError?.code === "42501") {
    return error(
      "Referral sharing is not available for this linked store account.",
    );
  }
  if (databaseError) {
    return error(
      "The referral link could not be created safely. No loyalty value changed.",
    );
  }
  const row = firstRow(data);
  const parsed = createMyReferralLinkResultV1.safeParse(
    row
      ? {
          advocateCode: row.advocate_code,
          shareUrl: row.share_url,
          outcome: row.outcome,
        }
      : null,
  );
  if (!parsed.success) {
    return error(
      "The referral link response was invalid. No loyalty value changed.",
    );
  }
  revalidatePath("/account/loyalty");
  return {
    kind: "success",
    message:
      parsed.data.outcome === "created"
        ? "Your private referral link is ready to share."
        : "Your existing private referral link is ready.",
    shareUrl: parsed.data.shareUrl,
  };
}
