import "server-only";

import {
  managedBillingPlanOptionV1,
  type ManagedBillingPlanOptionV1,
  type ManagedBillingSessionRequestV1,
} from "@starfiniti/contracts";
import { randomUUID } from "node:crypto";

import { getDatabase } from "./database";
import {
  readStripeBillingApiKey,
  StripeBillingSessionClient,
  StripeBillingSessionError,
  stripeBillingSessionConfig,
  type StripeBillingRedirect,
} from "./stripe-billing-sessions";

type ReserveRow = Readonly<{
  deployment_mode: "self_hosted" | "managed";
  operation_id: string;
  operation_state: string;
  provider_customer_id: string | null;
  provider_price_id: string | null;
  live_mode: boolean | null;
  customer_idempotency_key: string | null;
  session_idempotency_key: string | null;
}>;

type AuthorizationRow = Readonly<{
  action: "checkout" | "portal";
  provider_customer_id: string | null;
  provider_price_id: string | null;
  live_mode: boolean;
  provider_idempotency_key: string;
}>;

export type ManagedBillingSessionOutcome =
  | Readonly<{ kind: "self_hosted" }>
  | Readonly<{ kind: "redirect"; url: string }>;

export async function listManagedBillingPlans(
  actorUserId: string,
  organizationId: string,
): Promise<readonly ManagedBillingPlanOptionV1[]> {
  const sql = getDatabase();
  const rows = await sql<
    Array<{
      plan_public_id: string;
      plan_key: string;
      display_name: string;
      description: string;
      currency: string;
      unit_amount_minor: number | string;
      billing_interval: "month" | "year";
      interval_count: number;
      trial_days: number;
    }>
  >`
    select plan_public_id, plan_key, display_name, description, currency,
      unit_amount_minor, billing_interval, interval_count, trial_days
    from loyalty_private.list_managed_billing_plans_v1(
      ${actorUserId}::uuid, ${organizationId}::uuid
    )
  `;
  return rows.map((row) =>
    managedBillingPlanOptionV1.parse({
      schemaVersion: "1",
      planId: row.plan_public_id,
      key: row.plan_key,
      name: row.display_name,
      description: row.description,
      currency: row.currency,
      unitAmountMinor: Number(row.unit_amount_minor),
      interval: row.billing_interval,
      intervalCount: row.interval_count,
      trialDays: row.trial_days,
    }),
  );
}

export async function createManagedBillingSession(
  actorUserId: string,
  command: ManagedBillingSessionRequestV1,
): Promise<ManagedBillingSessionOutcome> {
  const reserved = await reserve(actorUserId, command);
  if (reserved.deployment_mode === "self_hosted") {
    return { kind: "self_hosted" };
  }
  if (
    reserved.operation_state === "held" ||
    reserved.operation_state === "rejected" ||
    reserved.operation_state === "completed"
  ) {
    throw new Error("billing_session_unavailable");
  }

  const customerRequired =
    reserved.operation_state === "customer_required" ||
    (reserved.operation_state === "ambiguous" &&
      !reserved.provider_customer_id);
  let config: ReturnType<typeof stripeBillingSessionConfig>;
  let client: StripeBillingSessionClient;
  let sessionAuthority: AuthorizationRow;

  if (customerRequired) {
    const authority = await authorize(
      actorUserId,
      command.operationId,
      "customer",
    );
    config = stripeBillingSessionConfig({
      apiKey: readStripeBillingApiKey(),
      liveMode: requiredBoolean(reserved.live_mode),
    });
    client = new StripeBillingSessionClient(config);
    const attemptId = randomUUID();
    let customerId: string;
    try {
      const created = await client.createCustomer({
        operationId: command.operationId,
        idempotencyKey: authority.provider_idempotency_key,
      });
      customerId = created.customerId;
    } catch (error) {
      await recordFailure(
        actorUserId,
        command.operationId,
        attemptId,
        "customer",
        error,
      );
      throw new Error("billing_session_unavailable");
    }
    await record(
      actorUserId,
      command.operationId,
      attemptId,
      "customer",
      "succeeded",
      customerId,
      "customer_created",
    );
    sessionAuthority = await authorize(
      actorUserId,
      command.operationId,
      "session",
    );
  } else {
    sessionAuthority = await authorize(
      actorUserId,
      command.operationId,
      "session",
    );
    config = stripeBillingSessionConfig({
      apiKey: readStripeBillingApiKey(),
      liveMode: requiredBoolean(reserved.live_mode),
    });
    client = new StripeBillingSessionClient(config);
  }
  const customerId = requiredText(sessionAuthority.provider_customer_id);
  const attemptId = randomUUID();
  let redirect: StripeBillingRedirect;
  try {
    redirect =
      sessionAuthority.action === "checkout"
        ? await client.createCheckout({
            customerId,
            priceId: requiredText(sessionAuthority.provider_price_id),
            operationId: command.operationId,
            idempotencyKey: sessionAuthority.provider_idempotency_key,
            successUrl: `${config.publicOrigin}/billing?checkout=returned`,
            cancelUrl: `${config.publicOrigin}/billing?checkout=cancelled`,
          })
        : await client.createPortal({
            customerId,
            idempotencyKey: sessionAuthority.provider_idempotency_key,
            returnUrl: `${config.publicOrigin}/billing`,
          });
  } catch (error) {
    await recordFailure(
      actorUserId,
      command.operationId,
      attemptId,
      "session",
      error,
    );
    throw new Error("billing_session_unavailable");
  }
  await record(
    actorUserId,
    command.operationId,
    attemptId,
    "session",
    "succeeded",
    redirect.resourceId,
    sessionAuthority.action === "checkout"
      ? "checkout_created"
      : "portal_created",
  );
  return { kind: "redirect", url: redirect.url };
}

async function reserve(
  actorUserId: string,
  command: ManagedBillingSessionRequestV1,
): Promise<ReserveRow> {
  const sql = getDatabase();
  const rows = await sql<ReserveRow[]>`
    select deployment_mode, operation_id, operation_state,
      provider_customer_id, provider_price_id, live_mode,
      customer_idempotency_key, session_idempotency_key
    from loyalty_private.reserve_managed_billing_session_v1(
      ${actorUserId}::uuid, ${command.organizationId}::uuid, ${command.action},
      ${command.planId}::uuid, ${command.operationId}::uuid
    )
  `;
  return requiredRow(rows);
}

async function authorize(
  actorUserId: string,
  operationId: string,
  stage: "customer" | "session",
): Promise<AuthorizationRow> {
  const sql = getDatabase();
  const rows = await sql<AuthorizationRow[]>`
    select action, provider_customer_id, provider_price_id, live_mode,
      provider_idempotency_key
    from loyalty_private.authorize_managed_billing_session_attempt_v1(
      ${actorUserId}::uuid, ${operationId}::uuid, ${stage}
    )
  `;
  return requiredRow(rows);
}

async function record(
  actorUserId: string,
  operationId: string,
  attemptId: string,
  stage: "customer" | "session",
  outcome: "succeeded" | "rejected" | "ambiguous",
  providerResourceId: string | null,
  detailCode: string,
): Promise<void> {
  const sql = getDatabase();
  const rows = await sql<Array<{ operation_state: string }>>`
    select operation_state
    from loyalty_private.record_managed_billing_session_attempt_v1(
      ${actorUserId}::uuid, ${operationId}::uuid, ${attemptId}::uuid,
      ${stage}, ${outcome}, ${providerResourceId}, ${detailCode}
    )
  `;
  requiredRow(rows);
}

async function recordFailure(
  actorUserId: string,
  operationId: string,
  attemptId: string,
  stage: "customer" | "session",
  error: unknown,
): Promise<void> {
  const outcome =
    error instanceof StripeBillingSessionError &&
    error.code === "provider_rejected"
      ? "rejected"
      : "ambiguous";
  const detailCode =
    error instanceof StripeBillingSessionError
      ? error.code
      : "provider_ambiguous";
  try {
    await record(
      actorUserId,
      operationId,
      attemptId,
      stage,
      outcome,
      null,
      detailCode,
    );
  } catch {
    // The caller still fails closed; a database outage must not expose provider detail.
  }
}

function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row || rows.length !== 1) throw new Error("billing_session_unavailable");
  return row;
}

function requiredText(value: string | null): string {
  if (!value) throw new Error("billing_session_unavailable");
  return value;
}

function requiredBoolean(value: boolean | null): boolean {
  if (typeof value !== "boolean")
    throw new Error("billing_session_unavailable");
  return value;
}
