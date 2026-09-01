# Isolated Proxmox compatibility rehearsal

This contract turns the anonymous production inventory into executable evidence
without connecting the repository tooling to production. It does not ship an
environment driver and it does not authorize a package install or reboot on the
production host.

The selected rehearsal target is an isolated equivalent physical Proxmox host.
Nested Proxmox can help debug user-space behavior, but it cannot close the
candidate-kernel, KVM, IOMMU, boot-mode, or physical-network gate. The target is
loaded with the exact preverified candidate package bytes before its network is
sealed. Synthetic guests cover all fifteen QEMU and four LXC behavior profiles;
only the application and database use separately approved, read-only recovery
inputs in the final critical-workload stage.

## Owner-controlled inputs

The real run needs four owner-only regular files outside Git:

1. A minimized target inventory matching
   `starfiniti.proxmox-rehearsal-inventory.v1`. It contains hashes, counts, the
   disposable marker, isolation facts, and recovery-source aggregates only.
2. A time-bounded approval matching
   `starfiniti.proxmox-rehearsal-control.v1`. It binds the exact clean candidate
   commit, plan, inventory, and reviewed driver bytes.
3. A reviewed Node.js driver. The controller copies its exact approved bytes
   into a private request directory and invokes only canonical stages. It never
   accepts a shell command from the control or inventory.
4. A fresh minimized ADR-0088 preflight report captured no more than five
   minutes before execution from a separate clean checkout. It repeats the exact
   installed-state and dependency simulation without retaining raw APT output.

The inventory has exactly these sections and fields:

- root: `schema`, `observedAt`, `target`, `candidate`, `source`;
- target: class, opaque `environmentId`, marker digest, architecture, boot mode,
  virtualization flag, CPU/KVM/IOMMU/physical-network facts, and explicit
  approval-bound `automaticDestroyAt`,
  nested/disposable/ingress/egress/production-route/production-credential state;
- candidate: candidate and package-evidence digests, package count/bytes, and
  read-only prestaging state;
- source: immutable inventory-report/projection/timestamp bindings, restricted
  mapping and critical-recovery-source digests, exact Starfiniti `v0.1.11` and
  reviewed Supabase `self-hosted/v0.8.0` compatibility/Compose/image-set
  bindings, read-only state, and exact QEMU/LXC/storage/service/critical-workload
  counts.

The control has exactly `schema`, `candidateCommit`, `planSha256`,
`inventorySha256`, `driverSha256`, `freshPreflightFileSha256`, `approval`, and
`target`. Approval contains
one opaque reference, issue/expiry instants, the plan-bounded maximum run time,
and `productionMutationApproved: false`; target repeats only the approved opaque
environment ID and marker digest. The validator rejects additional fields, so
do not add operator notes, locations, commands, identities, or credentials.

No production address, hostname, VM/container ID, storage ID, path, username,
credential, raw guest configuration, tenant data, customer data, or command
output belongs in any committed report. Restricted diagnostics stay in the
operator evidence store.

## Invocation

```text
<fresh exact route-free collector stdout> | \
npm run proxmox-security:compatibility-rehearsal:run -- \
  --control-file /restricted/rehearsal-control.yaml \
  --inventory-file /restricted/rehearsal-inventory.yaml \
  --fresh-facts - \
  --fresh-preflight-report /restricted/fresh-preflight.json \
  --driver /restricted/rehearsal-driver.mjs \
  --out /restricted/rehearsal-report.json
```

The controller validates the bounded fresh fact envelope with the ADR-0089
validator and the minimized report with the ADR-0088 validator. Both must be no
more than five minutes old; inventory must retain the same projection, and the
approval must bind the fresh preflight file digest. The result retains only
digests/timestamps and never writes the raw inventory envelope.

The controller calls the driver as:

```text
node <approved-driver-copy> --stage <canonical-stage> \
  --request <read-only-request.json> \
  --control <approved-control-copy.yaml> \
  --inventory <approved-inventory-copy.yaml>
```

Each invocation returns one bounded JSON document using
`starfiniti.proxmox-rehearsal-stage-result.v1`. The controller independently
measures stage duration, validates the exact observation shape, and calls
`destroy_rehearsal` after success or caught failure. The isolated environment's
separate auto-destroy controller is armed to the exact approval expiry so a
controller crash, hard kill, or host loss does not depend on JavaScript cleanup.
A pass requires every profile,
storage, service, critical-workload, isolation, candidate, and reconciliation
check. Missing, duplicate, reordered, unknown, stale, or self-asserted evidence
fails closed.

Run `npm run proxmox-security:compatibility-rehearsal:validate` before preparing
owner inputs. Its self-test exercises the exact schemas and stage results; a
handwritten example containing reusable fake authority would be less safe than
the executable fixtures.

The driver is environment-specific and intentionally absent. A generic driver
would have to invent physical hardware, storage, console, backup, and secret
locations and would be unsafe operational guidance. Before a real run, repeat
the route-free production inventory read and pipe it directly to the
controller. Version a new plan when the projection changes; the fresh timestamp
and fact-envelope digest do not rewrite the immutable baseline.
