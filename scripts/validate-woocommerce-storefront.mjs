import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = "plugins/woocommerce";
const storefrontPath = join(pluginRoot, "src/class-plugin.php");
const storefront = readFileSync(storefrontPath, "utf8");

const budgets = Object.freeze({
  javascriptBytes: 0,
  stylesheetBytes: 0,
  storefrontPhpBytes: 12 * 1024,
  activeCoupons: 20,
  hubRequestsPerRender: 0,
});

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const pluginFiles = filesBelow(pluginRoot);
const javascriptBytes = pluginFiles
  .filter((path) => /\.(?:js|mjs)$/iu.test(path))
  .reduce((total, path) => total + statSync(path).size, 0);
const stylesheetBytes = pluginFiles
  .filter((path) => /\.css$/iu.test(path))
  .reduce((total, path) => total + statSync(path).size, 0);

for (const [label, actual, limit] of [
  ["storefront JavaScript", javascriptBytes, budgets.javascriptBytes],
  ["storefront CSS", stylesheetBytes, budgets.stylesheetBytes],
  [
    "storefront PHP source",
    statSync(storefrontPath).size,
    budgets.storefrontPhpBytes,
  ],
]) {
  if (actual > limit) {
    throw new Error(`${label} exceeds its ${limit}-byte budget (${actual}).`);
  }
}

for (const forbidden of [
  /wp_(?:enqueue|register)_(?:script|style)\s*\(/iu,
  /<script\b/iu,
  /<style\b/iu,
  /wp_remote_(?:get|post|request)\s*\(/iu,
  /\bfetch\s*\(/iu,
  /XMLHttpRequest/iu,
]) {
  if (forbidden.test(storefront)) {
    throw new Error(
      `Storefront boundary exceeds its zero-asset/request budget: ${forbidden}`,
    );
  }
}

for (const required of [
  `'posts_per_page' => ${budgets.activeCoupons}`,
  `'no_found_rows' => true`,
  "woocommerce_account_loyalty_endpoint",
  "woocommerce_before_cart",
  "is_user_logged_in()",
  "esc_html__",
  "wp_kses",
]) {
  if (!storefront.includes(required)) {
    throw new Error(
      `Storefront budget/accessibility guard is missing ${required}.`,
    );
  }
}

console.log(
  `Validated WooCommerce storefront budgets: ${javascriptBytes} B JS, ${stylesheetBytes} B CSS, ${statSync(storefrontPath).size}/${budgets.storefrontPhpBytes} B PHP, ${budgets.hubRequestsPerRender} hub requests per render, and at most ${budgets.activeCoupons} active rewards.`,
);
