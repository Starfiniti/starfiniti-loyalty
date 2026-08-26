import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const phpRoot = join(root, "packages", "sdk-php");
const composer = JSON.parse(
  readFileSync(join(phpRoot, "composer.json"), "utf8"),
);
if (
  composer.name !== "starfiniti/loyalty-sdk" ||
  composer.require?.php !== ">=8.1" ||
  composer.autoload?.["psr-4"]?.["Starfiniti\\LoyaltySdk\\"] !== "src/"
) {
  throw new Error("PHP SDK Composer contract is incomplete");
}
const phpSources = readdirSync(join(phpRoot, "src"))
  .filter((name) => name.endsWith(".php"))
  .sort();
if (phpSources.length < 9)
  throw new Error("PHP SDK source catalogue is incomplete");

let phpValidated = false;
try {
  execFileSync("php", ["--version"], { stdio: "ignore" });
  for (const source of phpSources) {
    execFileSync("php", ["-l", join(phpRoot, "src", source)], {
      stdio: "inherit",
    });
  }
  execFileSync("php", [join(phpRoot, "tests", "run.php")], {
    cwd: root,
    stdio: "inherit",
  });
  phpValidated = true;
} catch (error) {
  if (process.env.CI === "true") throw error;
}
if (!phpValidated && process.env.CI === "true") {
  throw new Error("PHP 8.1+ is required to validate the supported SDK in CI");
}

const typescriptRoot = join(root, "packages", "sdk-typescript");
const npmCommand = (args) => {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd: args[0] === "pack" ? typescriptRoot : root,
      stdio: args[0] === "pack" ? "ignore" : "inherit",
    });
    return;
  }
  execFileSync("npm", args, {
    cwd: args[0] === "pack" ? typescriptRoot : root,
    stdio: args[0] === "pack" ? "ignore" : "inherit",
  });
};
npmCommand(["run", "build", "--workspace=@starfiniti/loyalty-sdk"]);
const packageJson = JSON.parse(
  readFileSync(join(typescriptRoot, "package.json"), "utf8"),
);
for (const target of [
  packageJson.exports?.["."]?.types,
  packageJson.exports?.["."]?.import,
]) {
  if (typeof target !== "string" || !existsSync(join(typescriptRoot, target))) {
    throw new Error(`TypeScript SDK export is missing: ${String(target)}`);
  }
}
npmCommand(["pack", "--dry-run", "--json"]);

console.log(
  `Validated supported clients: ${phpSources.length} PHP sources${
    phpValidated
      ? " with executable PHP vectors"
      : " by manifest only (PHP unavailable)"
  } and TypeScript build/package exports.`,
);
