import { hostname } from "node:os";
import postgres from "postgres";
import {
  createSmtpDeliveryRuntime,
  readSmtpDeliveryConfig,
  runSmtpNotificationLifecycle,
} from "./notification-delivery.ts";
import {
  advanceCampaignLifecycle,
  claimWooCommerceEffects,
  enqueueExpiredWooCommerceCouponCancellations,
  expireDueTierOverrides,
  processWooCommerceEffect,
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
} else {
  while (!stopping) {
    if (Date.now() >= nextCancellationSweepAt) {
      await enqueueExpiredWooCommerceCouponCancellations(sql);
      await expireDueTierOverrides(sql);
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

function readWorkerMode(value: string | undefined): "value" | "notification" {
  const mode = value ?? "value";
  if (mode !== "value" && mode !== "notification") {
    throw new Error("LOYALTY_WORKER_MODE must be value or notification");
  }
  return mode;
}
