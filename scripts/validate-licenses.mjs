import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const platformLicense = "AGPL-3.0-or-later";
const connectorLicense = "GPL-2.0-or-later";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const rootPackagePath = join(repositoryRoot, "package.json");
const rootPackage = readJson(rootPackagePath);
const packagePaths = [rootPackagePath];

for (const pattern of rootPackage.workspaces ?? []) {
  if (!pattern.endsWith("/*")) {
    throw new Error(
      `Unsupported workspace pattern in license check: ${pattern}`,
    );
  }
  const parent = join(repositoryRoot, pattern.slice(0, -2));
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    const packagePath = join(parent, entry.name, "package.json");
    if (entry.isDirectory() && existsSync(packagePath))
      packagePaths.push(packagePath);
  }
}

for (const packagePath of packagePaths) {
  const packageJson = readJson(packagePath);
  if (packageJson.license !== platformLicense) {
    throw new Error(
      `${packageJson.name ?? packagePath} must declare ${platformLicense}`,
    );
  }
}

const licenseText = readFileSync(join(repositoryRoot, "LICENSE"), "utf8");
if (
  !licenseText.includes("GNU AFFERO GENERAL PUBLIC LICENSE") ||
  !licenseText.includes("Version 3, 19 November 2007")
) {
  throw new Error("LICENSE is not the complete GNU Affero GPL version 3 text");
}

const wooComposer = readJson(
  join(repositoryRoot, "plugins", "woocommerce", "composer.json"),
);
if (!wooComposer.license?.includes(connectorLicense)) {
  throw new Error(`WooCommerce connector must declare ${connectorLicense}`);
}
const wooPluginHeader = readFileSync(
  join(repositoryRoot, "plugins", "woocommerce", "starfiniti-loyalty.php"),
  "utf8",
);
if (!wooPluginHeader.includes(`License: ${connectorLicense}`)) {
  throw new Error(`WooCommerce plugin header must declare ${connectorLicense}`);
}

console.log(
  `Validated ${packagePaths.length} npm package license declarations, the full AGPL text, and both WooCommerce GPL declarations.`,
);
