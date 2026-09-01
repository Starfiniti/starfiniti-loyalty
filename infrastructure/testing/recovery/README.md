# Clean-room recovery driver contract

The repository controller owns ordering, bounds, approval binding, result validation, RPO/RTO measurement, minimization, and teardown enforcement. A separately reviewed owner-controlled Node driver owns environment-specific provisioning and restore mechanics. The driver is not a shell-command parameter: its exact bytes are approved, copied with the approved control and inventory into a private per-run directory, and called only from those copies with one canonical stage ID plus a read-only request file. The controller measures every stage itself; driver timestamps cannot shorten the reported duration.

## Invocation

```text
node <driver> --stage <canonical-stage> --request <request.json> --control <control.yaml> --inventory <inventory.yaml>
```

The driver writes one JSON document to stdout, no more than 32 KiB, and returns nonzero on any uncertainty. It must not print diagnostics, paths, origins, credentials, identities, backup content, request/response bodies, or privacy data. Restricted diagnostics belong in the operator evidence store.

## Result envelope

```json
{
  "schema": "starfiniti.recovery-stage-result.v1",
  "stage": "inspect_isolation",
  "status": "passed",
  "startedAt": "2026-08-27T09:00:00.000Z",
  "finishedAt": "2026-08-27T09:00:01.000Z",
  "observations": {
    "markerVerified": true,
    "internalNetwork": true,
    "publicIngress": false,
    "externalEgress": false,
    "productionRouteCount": 0
  }
}
```

Every stage has an exact observation shape enforced by `scripts/run-clean-room-recovery.mjs`. Extra keys fail. The driver must independently verify facts; it cannot copy expected values from the inventory into its result. Database facts, ledger transactions, queue facts, Supabase Auth identities, Authentik objects, provider configurations, signing references, and post-target privacy actions must equal the source-manifest aggregates bound into that run's inventory.

## Safety requirements

- Start from a newly provisioned Linux target bearing the exact disposable marker and prefixed Compose project.
- Publish no host port and install no production route. Recovery dependencies must be staged before the internal no-egress network is sealed.
- Mount source backups and escrow read-only. Restore into new clean-room storage only.
- Use exact image digests and configuration digests from inventory.
- Never expose a test user before privacy-journal replay passes.
- Treat PostgreSQL readiness as an intermediate stage, not the end of RTO.
- Destroy all clean-room services, volumes, networks, routes, credential copies, and test identities in the final stage even after an earlier failure.

The driver must be reviewed against the exact environment before approval. A sample or generic driver is intentionally not shipped because a fabricated backup path, secret store, or Compose topology would be unsafe operational guidance.

Each repeat exercise needs its own observed-at inventory and complete approval window. Completion evidence rejects a reused inventory, reused run, shared artifact path, or reconciliation document that does not bind both inventory and run digests.
