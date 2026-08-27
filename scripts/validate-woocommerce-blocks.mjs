import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { Script, createContext } from "node:vm";

const javascriptPath = "plugins/woocommerce/assets/blocks.js";
const stylesheetPath = "plugins/woocommerce/assets/blocks.css";
const javascript = readFileSync(javascriptPath, "utf8");
const stylesheet = readFileSync(stylesheetPath, "utf8");
const budgets = Object.freeze({
  javascriptGzipBytes: 4 * 1024,
  stylesheetGzipBytes: 2 * 1024,
  hubRequestsPerRender: 0,
});

const javascriptGzipBytes = gzipSync(javascript).byteLength;
const stylesheetGzipBytes = gzipSync(stylesheet).byteLength;
for (const [label, actual, limit] of [
  ["Blocks JavaScript gzip", javascriptGzipBytes, budgets.javascriptGzipBytes],
  ["Blocks CSS gzip", stylesheetGzipBytes, budgets.stylesheetGzipBytes],
]) {
  if (actual > limit) {
    throw new Error(`${label} exceeds its ${limit}-byte budget (${actual}).`);
  }
}

for (const forbidden of [
  /\bfetch\s*\(/iu,
  /XMLHttpRequest/iu,
  /WebSocket/iu,
  /EventSource/iu,
  /innerHTML/iu,
  /dangerouslySetInnerHTML/iu,
  /\beval\s*\(/iu,
  /https?:\/\//iu,
  /javascript:/iu,
]) {
  if (forbidden.test(javascript)) {
    throw new Error(
      `Blocks panel contains forbidden runtime behavior ${forbidden}.`,
    );
  }
}

for (const required of [
  "ExperimentalOrderMeta",
  'extensions["starfiniti-loyalty"]',
  'scope: "woocommerce-checkout"',
  '"aria-labelledby"',
  '__("Loyalty rewards", "starfiniti-loyalty")',
]) {
  if (!javascript.includes(required)) {
    throw new Error(`Blocks panel is missing ${required}.`);
  }
}
for (const required of [
  ".starfiniti-loyalty-block-panel",
  ":focus-visible",
  "forced-colors",
]) {
  if (!stylesheet.includes(required)) {
    throw new Error(`Blocks stylesheet is missing ${required}.`);
  }
}

let registration;
const createElement = (type, properties, ...children) => ({
  type,
  props: { ...(properties ?? {}), children },
});
const sprintf = (format, ...values) =>
  format
    .replace(/%1\$s/gu, String(values[0] ?? ""))
    .replace(/%2\$s/gu, String(values[1] ?? ""))
    .replace(/%s/gu, () => String(values.shift() ?? ""));
const sandbox = {
  window: {
    URL,
    location: new URL("https://shop.example.test/cart"),
    wp: {
      element: { createElement },
      i18n: { __: (message) => message, sprintf },
      plugins: {
        registerPlugin: (name, configuration) => {
          registration = { name, configuration };
        },
      },
    },
    wc: { blocksCheckout: { ExperimentalOrderMeta: "order-meta-slot" } },
  },
};
new Script(javascript, { filename: javascriptPath }).runInContext(
  createContext(sandbox),
  { timeout: 1_000 },
);
if (
  registration?.name !== "starfiniti-loyalty" ||
  registration.configuration.scope !== "woocommerce-checkout"
) {
  throw new Error("Blocks panel did not register in the checkout scope.");
}
const slot = registration.configuration.render();
const panelComponent = slot?.props?.children?.[0];
if (typeof panelComponent?.type !== "function") {
  throw new Error("Blocks SlotFill does not contain the loyalty component.");
}
const base = {
  version: "1",
  state: "fresh",
  accountUrl: "/my-account/loyalty/",
  accountStatus: "ready",
  programmeName: "Starfiniti Loyalty",
  availablePoints: "150",
  currentTierName: "Bloom",
  rewards: [{ name: "Free shipping", costPoints: "100", affordable: true }],
};
const fresh = panelComponent.type({
  extensions: { "starfiniti-loyalty": base },
  context: "woocommerce/checkout",
});
const stale = panelComponent.type({
  extensions: {
    "starfiniti-loyalty": {
      ...base,
      state: "stale",
      availablePoints: "",
      currentTierName: "",
      rewards: [],
    },
  },
  context: "woocommerce/cart",
});
const unsafeLink = panelComponent.type({
  extensions: {
    "starfiniti-loyalty": { ...base, accountUrl: "javascript:alert(1)" },
  },
  context: "woocommerce/cart",
});
const text = (node) => {
  if (node === null || node === false || node === undefined) return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "string") return node;
  return (node.props?.children ?? []).map(text).join(" ");
};
if (
  fresh?.type !== "section" ||
  fresh.props["aria-labelledby"] !== "starfiniti-loyalty-checkout-title" ||
  !text(fresh).includes("150 points available") ||
  !text(fresh).includes("VIP tier: Bloom") ||
  !text(fresh).includes("Free shipping — 100 points")
) {
  throw new Error(
    "Fresh Blocks panel does not render the strict local projection.",
  );
}
if (
  stale?.props["aria-labelledby"] !== "starfiniti-loyalty-cart-title" ||
  text(stale).includes("150") ||
  !text(stale).includes("refreshing")
) {
  throw new Error(
    "Stale Blocks panel exposes value or omits refresh guidance.",
  );
}
if (unsafeLink !== null) {
  throw new Error("Blocks panel accepts a non-local account URL.");
}

console.log(
  `Validated WooCommerce Blocks panel: ${statSync(javascriptPath).size} B/${javascriptGzipBytes} B gzip JS, ${statSync(stylesheetPath).size} B/${stylesheetGzipBytes} B gzip CSS, official SlotFill scope, fresh/stale rendering, and ${budgets.hubRequestsPerRender} hub requests.`,
);
