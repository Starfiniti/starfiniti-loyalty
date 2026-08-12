import { readFileSync } from "node:fs";

const bootstrap = readFileSync(
  "plugins/woocommerce/starfiniti-loyalty.php",
  "utf8",
);
const plugin = readFileSync("plugins/woocommerce/src/class-plugin.php", "utf8");
const settings = readFileSync(
  "plugins/woocommerce/src/class-settings.php",
  "utf8",
);
const cli = readFileSync("plugins/woocommerce/src/class-cli.php", "utf8");
const outbox = readFileSync("plugins/woocommerce/src/class-outbox.php", "utf8");
const receiver = readFileSync(
  "apps/dashboard/app/api/v1/integrations/woocommerce/events/route.ts",
  "utf8",
);

for (const [label, content, requirements] of [
  [
    "bootstrap",
    bootstrap,
    [
      "register_activation_hook",
      "FeaturesUtil::declare_compatibility",
      "class-outbox.php",
    ],
  ],
  ["plugin", plugin, ["Outbox::boot()", "manage_woocommerce"]],
  [
    "settings",
    settings,
    [
      "check_admin_referer",
      "sodium_crypto_secretbox",
      "sodium_crypto_secretbox_open",
      "base64_decode",
      "update_option",
    ],
  ],
  [
    "cli",
    cli,
    ["WP_CLI::add_command", "retry-dead-letters", "Outbox::diagnostics"],
  ],
  [
    "outbox",
    outbox,
    [
      "INSERT IGNORE INTO",
      "woocommerce_order_status_changed",
      "woocommerce_refund_created",
      "as_schedule_single_action",
      "wp_remote_post",
      "hash_hmac('sha256'",
      "X-Starfiniti-Delivery-ID",
      "X-Starfiniti-Body-SHA256",
      "MAX_ATTEMPTS",
      "dead_letter",
    ],
  ],
  [
    "receiver",
    receiver,
    [
      "verifyWooCommerceDelivery",
      "request.arrayBuffer()",
      "wooCommerceDeliveryEnvelopeV1.safeParse",
      "accept_commerce_delivery",
      "status: 202",
    ],
  ],
]) {
  for (const requirement of requirements) {
    if (!content.includes(requirement)) {
      throw new Error(`WooCommerce ${label} is missing ${requirement}`);
    }
  }
}

for (const forbidden of [
  /service[_-]?role/iu,
  /supabase[_-]?(?:url|key)/iu,
  /get_billing_(?:email|phone|address)/iu,
  /error_log\s*\(/iu,
]) {
  if (
    forbidden.test(
      `${bootstrap}\n${plugin}\n${settings}\n${cli}\n${outbox}\n${receiver}`,
    )
  ) {
    throw new Error(
      `WooCommerce connector contains forbidden pattern ${forbidden}`,
    );
  }
}

console.log(
  "Validated WooCommerce HPOS bootstrap, local outbox, signature, retry, and privacy boundaries.",
);
