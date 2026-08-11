import { access, cp, mkdir } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const standaloneApp = new URL(".next/standalone/apps/dashboard/", appRoot);

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
