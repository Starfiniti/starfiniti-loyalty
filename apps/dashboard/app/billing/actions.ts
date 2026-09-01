"use server";

import { managedBillingSessionRequestV1 } from "@starfiniti/contracts";
import { redirect } from "next/navigation";

import { createManagedBillingSession } from "@/lib/server/managed-billing-sessions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const USER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function startManagedBillingSessionAction(
  formData: FormData,
): Promise<never> {
  const command = managedBillingSessionRequestV1.safeParse({
    schemaVersion: "1",
    organizationId: formData.get("organizationId"),
    action: formData.get("billingAction"),
    planId: formData.get("planId") || null,
    operationId: formData.get("operationId"),
  });
  if (!command.success) redirect("/billing?billing=request_invalid");

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const actorUserId = claims.data?.claims?.sub;
  if (
    claims.error ||
    typeof actorUserId !== "string" ||
    !USER_UUID.test(actorUserId)
  ) {
    redirect("/login?next=%2Fbilling");
  }

  let outcome: Awaited<ReturnType<typeof createManagedBillingSession>>;
  try {
    outcome = await createManagedBillingSession(actorUserId, command.data);
  } catch {
    redirect("/billing?billing=unavailable");
  }

  if (outcome.kind === "self_hosted")
    redirect("/billing?billing=not_applicable");
  redirect(outcome.url);
}
