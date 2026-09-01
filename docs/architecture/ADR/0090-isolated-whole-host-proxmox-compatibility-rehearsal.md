# ADR-0090: Isolated whole-host Proxmox compatibility rehearsal

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, and operations
- Scope: M15 host hardening and M16 dependency review

## Context

ADR-0086 through ADR-0089 bind the exact twelve-package Proxmox security
candidate, independently verified package bytes and signatures, the production
starting state, and a privacy-minimized inventory of every current consumer. The
inventory has fifteen distinct QEMU profiles, four LXC profiles, two storage
profiles, nine required management services, and the application/database
critical-workload aliases. It deliberately proves no compatibility.

Installing the candidate on the single production node to discover whether it
works would collapse testing, rollout, and recovery into one irreversible
event. A nested Proxmox VM is useful for package and user-space debugging, but
cannot establish physical boot, KVM, IOMMU, or physical-network compatibility.
Cloning every production guest would be more realistic than synthetic guests,
but would copy unrelated workloads and data into a broader evidence boundary.

The current Supabase self-hosting guidance makes host maintenance, security,
backups, recovery, monitoring, and uptime the operator's responsibility. Its
Docker update guidance also requires a separately backed-up database and treats
configuration/image changes as an explicit, conflict-aware operation. This
rehearsal changes the Proxmox host candidate only: the critical workload clones
must retain the exact locked Supabase and Starfiniti release so host behavior is
not confounded with an application upgrade.

## Alternatives

### Test the exact candidate directly on production

This provides the most direct hardware result but turns the first compatibility
attempt into the maintenance event. A failed boot, storage regression, or guest
controller regression would be discovered after the only production node had
already changed.

### Use only nested Proxmox in a VM

This is inexpensive and repeatable, but nested virtualization substitutes a
different boot chain, virtual NIC, virtual storage controller, IOMMU boundary,
and KVM host. It cannot close the whole-host compatibility row and is accepted
only as optional debugging evidence.

### Clone every production guest to an isolated host

This preserves guest fidelity, but needlessly copies unrelated guest data and
identities. It also risks making the rehearsal dependent on production routes,
storage IDs, and mutable snapshots.

### Use an equivalent physical host with synthetic profile guests and two restricted critical clones

This is selected. A physically equivalent isolated Proxmox target proves the
candidate boot and host facilities. Synthetic guests reproduce all anonymous
QEMU/LXC behavior profiles without unrelated data. Separately approved,
read-only recovery inputs restore only the application and database clones for
Supabase, Auth, dashboard, worker, checkout-independence, backup/WAL, and loyalty
reconciliation checks.

## Decision

1. Add `starfiniti.proxmox-compatibility-rehearsal-plan.v1`, bound to the exact
   ADR-0086 candidate, package evidence, ADR-0088 preflight, ADR-0089 inventory
   plan/report, released Starfiniti `v0.1.11`, the exact reviewed Supabase
   `self-hosted/v0.8.0` compatibility/Compose/`linux/amd64` image set, all
   nineteen profile hashes, both storage profiles, all nine service IDs, both
   critical aliases, and all six pending rehearsal rows.
2. Require an isolated equivalent physical target with the same architecture,
   BIOS boot mode, virtualization flag, CPU count, KVM device, IOMMU group
   shape, and physical-network count. A nested-only result fails.
3. Prestage the exact 165,341,024 candidate package bytes from a read-only
   source before sealing the target. The target has no public ingress, external
   egress, production route, production credential, or production identity.
4. Install exactly eleven upgrades and one new signed kernel, with zero removal,
   downgrade, unexpected package, or configuration conflict. Retain the prior
   kernel. Prove the candidate kernel is running after a controller-bounded
   reboot; installed-but-not-running does not pass.
5. Exercise every management service, both storage profiles, every QEMU and LXC
   profile, and the two critical clones. Profile results are exact, ordered, and
   duplicate-free; feature-specific checks prove the configured expectation,
   including an expected absence, instead of silently marking it inapplicable.
6. Require the critical recovery source and restored workloads to match the
   exact bound Starfiniti and Supabase release/commit/Compose/image identities.
   Then require Supabase Compose, PostgreSQL, migrations, RLS, Auth, REST,
   Realtime, Storage, Studio, dashboard, worker, Authentik login, WooCommerce checkout
   independence, WAL, backup, and ledger/balance/coupon/event reconciliation on
   the isolated clones with zero unexplained difference.
7. Keep the environment driver outside Git. A time-bounded owner-only control
   binds its exact bytes, the clean candidate commit, plan, minimized target
   inventory, opaque target, and a production-mutation-false approval. The
   repository controller accepts no shell command, endpoint, route, credential,
   VM ID, storage ID, or package selector.
8. Invoke thirteen canonical stages with per-stage and whole-run bounds, clear
   the inherited environment, validate exact bounded JSON, measure elapsed time
   independently, and invoke teardown after success or caught failure. An
   independently enforced auto-destroy lease must be armed to the exact approval
   expiry before work begins, so process death does not depend on controller
   cleanup. Teardown must remove the target, synthetic guests, critical clones,
   storage, networks, copied credentials, test identities, and routes with zero
   residual resource.
9. Keep the committed ADR-0088/ADR-0089 reports as immutable baselines. Require
   a fresh minimized ADR-0088 report and a separate same-projection ADR-0089
   production read no more than five minutes before execution. The approval
   binds the fresh preflight file digest; pipe inventory facts directly through
   the ADR-0089 validator. Retain only report/fact digests and timestamps in the
   result. A changed inventory projection requires a new plan; new timestamps
   alone do not rewrite either baseline.
10. A controller pass advances only `rehearsalExecuted`. Independent review must
    bind the restricted raw evidence and minimized report before
    `compatibilityProved` can advance. Rollback, recovery, repository policy,
    maintenance, installation, reboot, and production mutation remain separate.

## Security and integrity effects

The repository controller has no SSH or Proxmox endpoint implementation. It
copies exact approved inputs into a private temporary directory, invokes only a
reviewed Node driver with a canonical stage identifier and read-only request,
caps time and output, retains no raw driver output, and publishes a report only
through an exclusive no-follow owner-only file. Control, inventory, driver, and
output parents are caller-owned and private on Linux.

The committed contract rejects production routes or credentials, nested-only
targets, absent/late/unbound auto-destroy leases, wrong application or Supabase
release/image evidence, stale source inventory,
missing/duplicate/reordered profiles, false
feature passes, candidate drift, removals, downgrades, configuration conflicts,
wrong running kernel, checkout dependency, reconciliation differences,
incomplete teardown, and subjective promotion of compatibility. Hashes, counts,
booleans, bounded timestamps, and opaque IDs are the only permitted evidence;
raw configuration, commands, locations, identities, and customer/tenant data
are prohibited.

## Operations

Run `npm run proxmox-security:compatibility-rehearsal:validate` on every change.
Before a real execution, recapture the route-free ADR-0088 preflight from a
separate clean checkout, retain its minimized owner-only report outside the
rehearsal checkout, and repeat the ADR-0089 inventory projection. Bind the
preflight file digest in the approval and pipe fresh same-projection inventory
facts directly to the controller. Any changed projection, candidate, package set, profile,
storage, service, network, boot, tool, or platform fact requires a new versioned
plan; a stale or changed matrix cannot be approved into working.

Prepare the equivalent physical target and recovery inputs under restricted
operations evidence. Independently review the driver and verify that the target
has no production route or credential before creating the time-bounded control.
Execute the documented run command from the exact clean commit. Preserve raw
evidence outside Git, independently reconcile it to the minimized report, and
commit only the reviewed sanitized artifact. The current repository contains no
driver and no real execution report, so compatibility remains unproved.

## Migration and rollback

This decision adds a repository controller and evidence contract only. It does
not install a package, create a guest, control a service, write storage, change a
route, reboot a host, or mutate production. Caught failure always attempts
isolated teardown and advances no compatibility gate. Process death falls back
to the separately armed expiry controller. If teardown or automatic expiry is
incomplete, isolate the target and treat the residual as an incident until an
operator removes it.

A failed rehearsal is corrected on a new isolated target with a superseding
control and report. Never weaken a profile, omit a service, reuse a stale source,
or edit a failed artifact to obtain a pass. Production rollback remains governed
by the separate retained-kernel, exact-package/configuration escrow, and
clean-host recovery decisions in the Proxmox security-update runbook.

## Official sources

- Proxmox VE administration guide: https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf
- Proxmox `qm`: https://pve.proxmox.com/pve-docs/qm.1.html
- Proxmox `pct`: https://pve.proxmox.com/pve-docs/pct.1.html
- Proxmox `pvesm`: https://pve.proxmox.com/pve-docs/pvesm.1.html
- Supabase self-hosting: https://supabase.com/docs/guides/self-hosting
- Supabase self-hosted Docker deployment: https://supabase.com/docs/guides/self-hosting/docker
- Supabase self-hosted updates: https://supabase.com/docs/guides/self-hosting/updating

## Evidence result

The repository contract covers fifteen QEMU profiles, four LXC profiles, two
storage profiles, nine management services, two critical workloads, thirteen
bounded stages, controller teardown, out-of-process expiry, immutable output,
and adversarial false-pass cases. The driver, fresh target/source inventory,
approval, real equivalent
host, candidate installation/reboot, restricted evidence, independent review,
and accepted report do not yet exist. `rehearsalExecuted`,
`independentReviewApproved`, `compatibilityProved`, and every production gate
remain false.
