import { hostname } from "node:os";
import postgres from "postgres";
import { runAnalyticsExportLifecycle } from "./analytics-export.ts";
import { runBillingWebhookLifecycle } from "./billing-webhook.ts";
import { runBillingUsageLifecycle } from "./billing-usage.ts";
import {
  createKlaviyoDeliveryRuntime,
  readKlaviyoDeliveryConfig,
  runKlaviyoNotificationLifecycle,
} from "./klaviyo-delivery.ts";
import {
  createSmtpDeliveryRuntime,
  readSmtpDeliveryConfig,
  runSmtpNotificationLifecycle,
} from "./notification-delivery.ts";
import {
  createWebhookDeliveryRuntime,
  readWebhookDeliveryConfig,
  runWebhookDeliveryLifecycle,
} from "./webhook-delivery.ts";
import {
  advanceCampaignLifecycle,
  claimWooCommerceEffects,
  enqueueExpiredWooCommerceCouponCancellations,
  expireDueTierOverrides,
  processWooCommerceEffect,
  releaseDueMigrationPendingLots,
  runCampaignTriggerLifecycle,
  runPointExpiryLifecycle,
  runReferralRewardLifecycle,
} from "./processor.ts";

const connectionString = process.env.LOYALTY_WORKER_DATABASE_URL;
if (!connectionString)
  throw new Error("LOYALTY_WORKER_DATABASE_URL is required");

const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 5,
  prepare: true,
  onnotice: () => undefined,
});
const workerId = `${hostname()}:${process.pid}`;
const workerMode = readWorkerMode(process.env.LOYALTY_WORKER_MODE);
let stopping = false;
let nextCancellationSweepAt = 0;
let nextBillingUsageCaptureAt = 0;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

if (workerMode === "notification") {
  const smtpConfig = readSmtpDeliveryConfig(process.env);
  if (smtpConfig === null) {
    throw new Error("LOYALTY_SMTP_ENABLED must be true in notification mode");
  }
  const smtpRuntime = createSmtpDeliveryRuntime(smtpConfig);
  try {
    while (!stopping) {
      const result = await runSmtpNotificationLifecycle(
        sql,
        workerId,
        smtpRuntime,
      );
      if (result.claimed === 0) await delay(1_000);
    }
  } finally {
    smtpRuntime.transporter.close();
  }
} else if (workerMode === "klaviyo") {
  const klaviyoConfig = readKlaviyoDeliveryConfig(process.env);
  if (klaviyoConfig === null) {
    throw new Error("LOYALTY_KLAVIYO_ENABLED must be true in klaviyo mode");
  }
  const klaviyoRuntime = createKlaviyoDeliveryRuntime(klaviyoConfig);
  while (!stopping) {
    const result = await runKlaviyoNotificationLifecycle(
      sql,
      workerId,
      klaviyoRuntime,
    );
    if (result.claimed === 0) await delay(1_000);
  }
} else if (workerMode === "webhook") {
  const webhookConfig = readWebhookDeliveryConfig(process.env);
  if (webhookConfig === null) {
    throw new Error("LOYALTY_WEBHOOK_ENABLED must be true in webhook mode");
  }
  const webhookRuntime = createWebhookDeliveryRuntime(webhookConfig);
  while (!stopping) {
    const result = await runWebhookDeliveryLifecycle(
      sql,
      workerId,
      webhookRuntime,
    );
    if (result.claimed === 0) await delay(1_000);
  }
} else if (workerMode === "reporting") {
  while (!stopping) {
    const result = await runAnalyticsExportLifecycle(sql, workerId);
    if (result.claimed === 0) await delay(1_000);
  }
} else if (workerMode === "billing") {
  while (!stopping) {
    const webhookResult = await runBillingWebhookLifecycle(sql, workerId);
    const captureFacts = Date.now() >= nextBillingUsageCaptureAt;
    const usageResult = await runBillingUsageLifecycle(sql, workerId, {
      captureFacts,
    });
    if (captureFacts) nextBillingUsageCaptureAt = Date.now() + 60_000;
    if (webhookResult.claimed === 0 && usageResult.claimed === 0) {
      await delay(1_000);
    }
  }
} else {
  while (!stopping) {
    if (Date.now() >= nextCancellationSweepAt) {
      await enqueueExpiredWooCommerceCouponCancellations(sql);
      await expireDueTierOverrides(sql);
      await releaseDueMigrationPendingLots(sql);
      await runPointExpiryLifecycle(sql);
      await runReferralRewardLifecycle(sql, workerId);
      await advanceCampaignLifecycle(sql);
      await runCampaignTriggerLifecycle(sql, workerId);
      nextCancellationSweepAt = Date.now() + 60_000;
    }
    const events = await claimWooCommerceEffects(sql, workerId);
    for (const event of events) {
      if (stopping) break;
      await processWooCommerceEffect(sql, workerId, event);
    }
    if (events.length === 0) await delay(1_000);
  }
}
await sql.end({ timeout: 5 });

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readWorkerMode(
  value: string | undefined,
): "value" | "notification" | "klaviyo" | "webhook" | "reporting" | "billing" {
  const mode = value ?? "value";
  if (
    mode !== "value" &&
    mode !== "notification" &&
    mode !== "klaviyo" &&
    mode !== "webhook" &&
    mode !== "reporting" &&
    mode !== "billing"
  ) {
    throw new Error(
      "LOYALTY_WORKER_MODE must be value, notification, klaviyo, webhook, reporting, or billing",
    );
  }
  return mode;
}
