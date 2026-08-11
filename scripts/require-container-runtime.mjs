import { spawnSync } from "node:child_process";

for (const runtime of ["docker", "podman"]) {
  const result = spawnSync(runtime, ["version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "pipe",
  });

  if (result.status === 0) {
    console.log(`Container runtime available: ${runtime}`);
    process.exit(0);
  }
}

console.error(
  [
    "Supabase database verification requires a running Docker or Podman engine.",
    "Install/start a supported runtime, then rerun: npm run db:verify",
    "The GitHub Actions database job runs this same command on an Ubuntu Docker runner.",
  ].join("\n"),
);
process.exit(1);
