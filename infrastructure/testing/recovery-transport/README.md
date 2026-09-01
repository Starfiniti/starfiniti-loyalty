# Recovery transport canary

This disposable canary proves the exact rsync 3.5 package and protocol boundary proposed for the Debian Proxmox receiver and Ubuntu database-guest sender. It never connects to production.

Validate the immutable plan and its adversarial fixtures:

```sh
npm run recovery-transport:validate
```

Run the Docker-backed canary on Linux:

```sh
npm run recovery-transport:run -- --out dist/recovery-transport/manual.json
```

The runner accepts only the repository plan and a bounded JSON output path under `dist/recovery-transport`. It creates a uniquely named internal Docker network, two disposable OS-matched images and containers, and two synthetic payload files. It publishes no port and removes those exact resources after the proof. A passing report contains package/executable/wrapper digests and aggregate transfer facts, never package bytes, credentials, host paths, or recovery contents.

A passing canary does not authorize package installation. ADR-0073 requires independently verified rollback packages, a maintenance approval, real forced-command and archive checks, and an isolated restore before production rollout.
