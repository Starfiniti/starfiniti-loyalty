import { access, cp, mkdir, readdir, rm } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const standaloneApp = new URL(".next/standalone/apps/dashboard/", appRoot);
const standaloneRoot = new URL(".next/standalone/", appRoot);

await mkdir(new URL(".next/", standaloneApp), { recursive: true });
await cp(
  new URL(".next/static/", appRoot),
  new URL(".next/static/", standaloneApp),
  {
    recursive: true,
  },
);

try {
  await access(new URL("public/", appRoot));
  await cp(new URL("public/", appRoot), new URL("public/", standaloneApp), {
    recursive: true,
  });
} catch {
  // The dashboard does not require public assets yet.
}

// All dashboard images are small, statically imported assets and the Next.js
// image optimizer is disabled in next.config.ts. Output tracing still copies
// sharp's optional native packages even though /_next/image is not routed.
// Refuse an unexpected @img package before removing this unused runtime family.
const imagePackageRoot = new URL("node_modules/@img/", standaloneRoot);
try {
  const imagePackages = await readdir(imagePackageRoot);
  const unexpectedPackage = imagePackages.find(
    (packageName) =>
      packageName !== "colour" && !packageName.startsWith("sharp-"),
  );
  if (unexpectedPackage) {
    throw new Error(
      `Refusing to remove unexpected traced @img package: ${unexpectedPackage}`,
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await rm(new URL("node_modules/sharp/", standaloneRoot), {
  force: true,
  recursive: true,
});
await rm(imagePackageRoot, { force: true, recursive: true });
