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
const commands = readFileSync(
  "plugins/woocommerce/src/class-commands.php",
  "utf8",
);
const snapshot = readFileSync(
  "plugins/woocommerce/src/class-experience-snapshot.php",
  "utf8",
);
const blocks = readFileSync("plugins/woocommerce/src/class-blocks.php", "utf8");
const blocksIntegration = readFileSync(
  "plugins/woocommerce/src/class-blocks-integration.php",
  "utf8",
);
const privacy = readFileSync(
  "plugins/woocommerce/src/class-privacy.php",
  "utf8",
);
const uninstall = readFileSync("plugins/woocommerce/uninstall.php", "utf8");
const outbox = readFileSync("plugins/woocommerce/src/class-outbox.php", "utf8");
const referrals = readFileSync(
  "plugins/woocommerce/src/class-referrals.php",
  "utf8",
);
const receiver = readFileSync(
  "apps/dashboard/app/api/v1/integrations/woocommerce/events/route.ts",
  "utf8",
);
const commandReceiver = readFileSync(
  "apps/dashboard/app/api/v1/integrations/woocommerce/commands/route.ts",
  "utf8",
);
const keyGenerator = readFileSync(
  "scripts/generate-woocommerce-signing-pool.mjs",
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
      "class-referrals.php",
      "class-experience-snapshot.php",
      "class-blocks.php",
      "cart_checkout_blocks",
    ],
  ],
  [
    "plugin",
    plugin,
    [
      "Outbox::boot()",
      "Referrals::boot()",
      "manage_woocommerce",
      "woocommerce_account_loyalty_endpoint",
      "woocommerce_before_cart",
      "wc_get_account_endpoint_url('loyalty')",
    ],
  ],
  [
    "settings",
    settings,
    [
      "check_admin_referer",
      "sodium_crypto_secretbox",
      "sodium_crypto_secretbox_open",
      "base64_decode",
      "update_option",
      "decodeConnectionPackage",
      "invalid_setup_code",
    ],
  ],
  [
    "cli",
    cli,
    [
      "WP_CLI::add_command",
      "retry-dead-letters",
      "reconcile-order",
      "Outbox::diagnostics",
    ],
  ],
  [
    "commands",
    commands,
    [
      "as_schedule_recurring_action",
      "capabilities",
      "coupon.issue.v2",
      "customer_experience.snapshot.v1",
      "snapshotCustomerIds",
      "woocommerce_coupon_is_valid",
      "set_usage_limit(1)",
      "set_minimum_amount",
      "set_product_ids",
      "set_product_categories",
      "set_limit_usage_to_x_items",
      "applyRestrictions",
      "_starfiniti_command_id",
      "_starfiniti_external_customer_id",
      "woocommerce.coupon.issue",
      "woocommerce.coupon.cancel",
    ],
  ],
  [
    "experience snapshot",
    snapshot,
    [
      "MAX_SNAPSHOT_BYTES",
      "pendingCustomerIds",
      "update_option",
      "snapshot_revision_conflict",
      "delete_user",
      "hash_equals",
    ],
  ],
  [
    "Blocks integration",
    `${blocks}\n${blocksIntegration}`,
    [
      "woocommerce_store_api_register_endpoint_data",
      "CartSchema::IDENTIFIER",
      "blocksDataEnabled",
      "progressivePanelEnabled",
      "render_block_woocommerce/cart",
      "IntegrationInterface",
      "get_script_handles",
      "wp_set_script_translations",
    ],
  ],
  [
    "privacy",
    privacy,
    [
      "wp_privacy_personal_data_exporters",
      "wp_privacy_personal_data_erasers",
      "Undelivered event evidence is retained",
    ],
  ],
  [
    "uninstall",
    uninstall,
    ["WP_UNINSTALL_PLUGIN", "STARFINITI_LOYALTY_REMOVE_DATA"],
  ],
  [
    "outbox",
    outbox,
    [
      "INSERT IGNORE INTO",
      "woocommerce_order_status_changed",
      "woocommerce_refund_created",
      "woocommerce_created_customer",
      "transition_comment_status",
      "commerce.customer.created",
      "commerce.review.verified",
      "commerce.coupon.captured",
      "captureCoupons",
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
    "referrals",
    referrals,
    [
      "template_redirect",
      "woocommerce_checkout_create_order",
      "stf_ref",
      "REMOTE_ADDR",
      "hash_hmac('sha256'",
      "sourceNetworkFingerprint",
      "paymentFingerprint",
      "shippingFingerprint",
    ],
  ],
  [
    "receiver",
    receiver,
    [
      "verifyWooCommerceDelivery",
      "readBoundedRequestBody(request, MAX_BODY_BYTES)",
      "wooCommerceDeliveryEnvelopeV1.safeParse",
      "accept_commerce_delivery",
      "status: 202",
    ],
  ],
  [
    "command receiver",
    commandReceiver,
    [
      "verifyWooCommerceDelivery",
      "readBoundedRequestBody(request, MAX_BODY_BYTES)",
      "wooCommerceCommandRequestV1.safeParse",
      "wooCommerceConnectorCommandEnvelope.safeParse",
      "parsed.data.capabilities",
      "queue_woocommerce_customer_snapshots_v1",
      "claim_woocommerce_commands",
      "platform = 'woocommerce'",
    ],
  ],
  [
    "key generator",
    keyGenerator,
    [
      "randomBytes(32)",
      "randomUUID()",
      'openSync(writePath, "wx", 0o600)',
      "renameSync(writePath, outputPath)",
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
      `${bootstrap}\n${plugin}\n${settings}\n${cli}\n${commands}\n${snapshot}\n${blocks}\n${blocksIntegration}\n${privacy}\n${uninstall}\n${outbox}\n${referrals}\n${receiver}`,
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
