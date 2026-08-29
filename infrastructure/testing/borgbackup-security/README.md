# BorgBackup security candidate

This canary proves the exact upstream-signed BorgBackup 1.4.5 candidate against
the Debian 13 BorgBackup 1.4.0 rollback boundary without contacting production.

Validate the closed plan, build/runtime controls, minimized evidence, and
adversarial fixtures:

```sh
npm run borgbackup-security:validate
```

Run the Docker-backed compatibility canary on Linux:

```sh
npm run borgbackup-security:run -- --out dist/borgbackup-security/manual.json
```

The build obtains the exact current Debian package through signed stable
metadata and the plan's exact HTTPS URL, requires byte equality and package
metadata, then verifies the Borg 1.4.5 archive through its exact SHA-256 and
OpenPGP signature from the full fingerprint published by Borg. The candidate is
extracted only into its versioned path. No unstable Debian package or production
credential is used.

At runtime a networkless, read-only container uses only bounded tmpfs storage.
It exercises current and candidate clients against current and candidate remote
servers, creates archives with both versions, runs the exact read and
maintenance command families used by Starfiniti, and proves that Debian's
retained 1.4.0 client can extract the candidate-created archive. The runner
removes its exact container and image and writes only a minimized JSON report.

A passing canary is candidate provenance and compatibility evidence, not
production approval. Operations must independently escrow the rollback package,
verify the exact installed paths and digests, test the provider's real remote
binary, pause the affected timers, run manual/timer/maintenance/restore checks,
and approve activation before changing production.
