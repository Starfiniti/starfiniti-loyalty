import "server-only";

import {
  merchantNotificationWorkspaceV1,
  type MerchantNotificationWorkspaceV1,
} from "@starfiniti/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

export async function getNotificationWorkspace(
  workspaceId: string,
): Promise<MerchantNotificationWorkspaceV1> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("get_notification_workspace_v1", {
      target_workspace_public_id: workspaceId,
      target_issue_limit: 50,
    });
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("notification_workspace_unavailable");
  }
  const row = data[0] as UnknownRow | undefined;
  const parsed = merchantNotificationWorkspaceV1.safeParse(
    row?.notification_workspace,
  );
  if (!parsed.success) throw new Error("notification_workspace_unavailable");
  return parsed.data;
}
