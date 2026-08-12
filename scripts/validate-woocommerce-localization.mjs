import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = "plugins/woocommerce";
const bootstrap = readFileSync(`${pluginRoot}/starfiniti-loyalty.php`, "utf8");
const plugin = readFileSync(`${pluginRoot}/src/class-plugin.php`, "utf8");
const pot = readFileSync(
  `${pluginRoot}/languages/starfiniti-loyalty.pot`,
  "utf8",
);
const slovenian = readFileSync(
  `${pluginRoot}/languages/starfiniti-loyalty-sl_SI.l10n.php`,
  "utf8",
);

if (!bootstrap.includes(" * Text Domain: starfiniti-loyalty")) {
  throw new Error("WooCommerce plugin header is missing its text domain.");
}
if (!bootstrap.includes(" * Domain Path: /languages")) {
  throw new Error("WooCommerce plugin header is missing /languages.");
}
for (const required of [
  "add_action('init', [self::class, 'loadTextDomain'], 0)",
  "load_plugin_textdomain(",
  ". '/languages'",
]) {
  if (!plugin.includes(required)) {
    throw new Error(`WooCommerce translation bootstrap is missing ${required}`);
  }
}

function phpFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "tests" || entry.name === "languages"
        ? []
        : phpFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".php") ? [path] : [];
  });
}

function decodePhpSingleQuoted(value) {
  return value.replaceAll("\\'", "'").replaceAll("\\\\", "\\");
}

const gettextCall =
  /\b(?:__|esc_html__|esc_attr__)\(\s*'((?:\\.|[^'\\])*)'\s*,\s*'starfiniti-loyalty'\s*\)/gsu;
const anyGettextCall = /\b(?:__|esc_html__|esc_attr__)\s*\(/gu;
const sourceMessages = new Set();
let totalCalls = 0;
let validCalls = 0;
for (const file of phpFiles(pluginRoot)) {
  const source = readFileSync(file, "utf8");
  totalCalls += source.match(anyGettextCall)?.length ?? 0;
  for (const match of source.matchAll(gettextCall)) {
    validCalls += 1;
    sourceMessages.add(decodePhpSingleQuoted(match[1] ?? ""));
  }
}
if (validCalls !== totalCalls) {
  throw new Error(
    `Only ${validCalls} of ${totalCalls} WooCommerce gettext calls use a literal Starfiniti text domain.`,
  );
}

const potMessages = new Set(
  [...pot.matchAll(/^msgid "(.*)"$/gmu)]
    .map((match) => JSON.parse(`"${match[1] ?? ""}"`))
    .filter(Boolean),
);
for (const message of sourceMessages) {
  if (!potMessages.has(message)) {
    throw new Error(`POT template is missing: ${message}`);
  }
}
for (const message of potMessages) {
  if (!sourceMessages.has(message)) {
    throw new Error(`POT template contains stale source text: ${message}`);
  }
}

const messagesStart = slovenian.indexOf("    'messages' => [");
const messagesEnd = slovenian.lastIndexOf("    ],");
if (messagesStart < 0 || messagesEnd <= messagesStart) {
  throw new Error("Slovenian PHP translation file has no messages map.");
}
const slovenianMessages = new Map();
const translationEntry =
  /^\s*'((?:\\.|[^'\\])*)'\s*=>\s*'((?:\\.|[^'\\])*)',\s*$/gmu;
for (const match of slovenian
  .slice(messagesStart, messagesEnd)
  .matchAll(translationEntry)) {
  slovenianMessages.set(
    decodePhpSingleQuoted(match[1] ?? ""),
    decodePhpSingleQuoted(match[2] ?? ""),
  );
}
for (const [message, translation] of slovenianMessages) {
  if (!sourceMessages.has(message)) {
    throw new Error(`Slovenian catalog contains stale source text: ${message}`);
  }
  if (!translation) {
    throw new Error(`Slovenian catalog has an empty translation: ${message}`);
  }
  const sourcePlaceholders = message.match(/%(?:\d+\$)?[a-z]/giu) ?? [];
  const translatedPlaceholders = translation.match(/%(?:\d+\$)?[a-z]/giu) ?? [];
  if (sourcePlaceholders.join("|") !== translatedPlaceholders.join("|")) {
    throw new Error(`Slovenian placeholders differ for: ${message}`);
  }
}
for (const message of sourceMessages) {
  if (!slovenianMessages.has(message)) {
    throw new Error(`Slovenian catalog is missing source text: ${message}`);
  }
}

for (const customerMessage of [
  "Loyalty",
  "Loyalty rewards",
  "No active loyalty coupons are available yet.",
  "Free shipping",
  "Expires %s",
  "Enter a reward code in the native coupon field at cart or checkout.",
  'You have an active loyalty reward. <a href="%s">View your code</a>.',
]) {
  if (!slovenianMessages.has(customerMessage)) {
    throw new Error(
      `Slovenian catalog is missing customer text: ${customerMessage}`,
    );
  }
}

console.log(
  `Validated ${sourceMessages.size} WooCommerce source messages, exact POT coverage, and ${slovenianMessages.size} Slovenian translations.`,
);
