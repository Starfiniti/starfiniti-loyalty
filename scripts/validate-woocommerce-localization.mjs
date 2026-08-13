import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = "plugins/woocommerce";
const bootstrap = readFileSync(`${pluginRoot}/starfiniti-loyalty.php`, "utf8");
const plugin = readFileSync(`${pluginRoot}/src/class-plugin.php`, "utf8");
const pot = readFileSync(
  `${pluginRoot}/languages/starfiniti-loyalty.pot`,
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

console.log(
  `Validated ${sourceMessages.size} WooCommerce source messages and exact POT coverage for the English-only launch.`,
);
