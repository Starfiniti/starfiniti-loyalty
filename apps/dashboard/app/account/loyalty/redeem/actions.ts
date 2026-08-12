"use server";

import {
  customerRewardRedemptionRequestV1,
  customerRewardRedemptionResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function redeemCustomerReward(formData: FormData): Promise<void> {
  const command = customerRewardRedemptionRequestV1.safeParse({
    version: "1",
    accountId: formData.get("accountId"),
    rewardCode: formData.get("rewardCode"),
    requestId: formData.get("requestId"),
  });
  if (!command.success) redirect("/account/loyalty?redemption=invalid");

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    redirect("/login?next=%2Faccount%2Floyalty");
  }

  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("redeem_my_reward", {
      target_account_public_id: command.data.accountId,
      target_reward_code: command.data.rewardCode,
      target_request_id: command.data.requestId,
    });
  if (error) {
    redirect(
      `/account/loyalty?redemption=${
        error.code === "23514" &&
        error.message === "insufficient available points"
          ? "insufficient"
          : "unavailable"
      }`,
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = customerRewardRedemptionResultV1.safeParse(
    row
      ? {
          reservationId: row.reservation_id,
          state: row.state,
          outcome: row.outcome,
        }
      : null,
  );
  if (!result.success) redirect("/account/loyalty?redemption=unavailable");

  revalidatePath("/account/loyalty");
  redirect("/account/loyalty?redeemed=1");
}
