# M16 Run Artifacts

This directory contains approved, minimized continuous-improvement run artifacts.

Provider-source snapshots use `starfiniti.provider-source-snapshot.v1`. They contain public source URLs, timestamps, bounded byte counts, SHA-256 digests, normalized `Last-Modified` values, and hashed ETags only. They must keep content retention, review completion, impact classification, and installed-evidence completion false.

Recovery-dependency snapshots use
`starfiniti.recovery-dependency-snapshot.v1`. They contain only the two opaque
endpoint IDs, public OS/package/platform versions, exact executable hashes,
derived installed provenance, the official-source snapshot binding, and the
reviewed rsync candidate-plan binding. They must keep candidate completeness,
review, impact classification, approval, and production mutation false. A complete
installed capture is not remote attestation or compatibility approval.

Proxmox package-provenance canaries use
`starfiniti.proxmox-security-package-canary.v1`. They bind fresh independently
verified repository signatures and signed package indexes to the exact candidate
URLs, package fields, sizes, SHA-256 values, and two equal acquisitions while
retaining no package bytes. They are package provenance only: dependency
simulation, installed-state compatibility, rollback escrow, recovery,
repository policy, maintenance, reboot, production mutation, and post-change
reconciliation remain separate gates.

Proxmox start-state preflights use
`starfiniti.proxmox-security-preflight.v1`. They bind the exact candidate and
passing package-provenance report to current minimized production facts. The
collector runs in isolated Python, executes exact-version APT simulation inside
an empty network namespace, and requires identical package, APT state/cache/list,
trust, repository configuration, and dpkg digests before and after. It contains
no route or credential capability and stores no raw APT output. A passing report
advances only dependency simulation and installed starting state; compatibility,
rollback, recovery, repository policy, maintenance, reboot, execution, and
post-change proof remain separate gates.

Proxmox compatibility inventories use
`starfiniti.proxmox-compatibility-inventory-report.v1`. They retain only
anonymous guest-profile hashes/counts/statuses, the two semantic critical-
workload aliases, minimized platform/storage/service/network/HA facts, and exact
contract digests. They must contain no VM ID, guest name, raw configuration,
storage ID, interface name, address, MAC, path, route, credential, or raw command
output. A passing report advances only consumer-inventory capture; all six
rehearsal rows and every compatibility, recovery, approval, reboot, mutation,
and post-change gate remain false.

Proxmox compatibility rehearsal reports use
`starfiniti.proxmox-compatibility-rehearsal-report.v1`. They bind an exact clean
candidate commit, the immutable candidate/package/preflight/inventory evidence,
released Starfiniti `v0.1.11`, the reviewed Supabase `self-hosted/v0.8.0`
compatibility/Compose/image identities, an owner-only isolated
target/control/driver set, and a same-projection
production inventory read no more than five minutes old. It also requires a
fresh minimized ADR-0088 preflight report whose exact file digest is bound by
the approval. Raw production facts,
driver output, infrastructure identifiers, and restricted recovery evidence do
not belong in the report. Only fresh observation/report/file digests and
timestamps survive. The target's out-of-process auto-destroy lease equals
the approval expiry so controller death does not own the final cleanup boundary.
A controller pass advances only `rehearsalExecuted`;
independent review must separately bind the restricted evidence before
compatibility can advance. No such rehearsal report has been accepted or
committed.

The first committed installed-state artifact is
`recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json` (8,813 bytes,
SHA-256
`9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`).
It can be reverified against the immutable implementation commit with
`npm run continuous-improvement:installed:verify -- --in <absolute-path>`.

The first passing package-provenance artifact is
`proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json` (9,606 bytes,
file SHA-256
`3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`,
internal report SHA-256
`0b703cc553f2304de75f28160e7482b09718794205efa7615fb39f2eab0f0382`).
It can be independently reverified with
`node scripts/validate-proxmox-security-package-canary.mjs --verify-report <absolute-path>`.

The first passing production preflight artifact is
`proxmox-security-preflight-5659404-2026-08-29T013145Z.json` (13,152 bytes,
file SHA-256
`b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85`,
internal report SHA-256
`898d10bde0e5dd1103dfd8838f19febff3e781ac95ecf305d4767eadf20a110a`).
It can be independently reverified with
`node scripts/validate-proxmox-security-preflight.mjs --verify-report <absolute-path>`.

The first passing whole-host consumer-inventory artifact is
`proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json` (9,236 bytes,
file SHA-256
`f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f`,
internal report SHA-256
`495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f`).
It can be independently reverified with
`node scripts/validate-proxmox-compatibility-inventory.mjs --verify-report <absolute-path>`.
Only `consumerInventoryCaptured` is true; compatibility and every rehearsal or
production authority remain false.

The first passing digest-locked OpenSSH client compatibility artifact is
`openssh-client-security-275c9e8-2026-08-29T073759Z.json` (741 bytes,
SHA-256
`91b68dd8180324042e7dbea18ba26dc0e976cb4d977527845dc08f4689e6e276`).
It binds exact candidate commit `275c9e8ebbd3d68d609976e04d31751c378b2967`,
plan SHA-256
`130df45c95938a41e88558b313b1a4707dfd7c0701f43fe4187ceba20a3bd625`,
Security run `33241151463`, recovery job `99070606112`, and artifact
`9711429356`; the separate artifact archive SHA-256 is
`ddfe3ea8a2450d39251be96c38c9de69505eb88a6da5ce058f3d8151fc75f1fc`.
It proves only the isolated current/candidate client compatibility contract and
zero production mutation. Escrow, real-provider behavior, rollout, restore,
rollback, monitoring, and review remain pending.

ADR-0093 adds no retained run here yet. Its private `manifest.json` must never be
committed. When operations later completes the closed 30-entry inventory and an
independent verification, only the minimized
`starfiniti.recovery-artifact-escrow-report.v1` output may be considered for this
directory after separate privacy review and exact SHA-256 binding. That report
still cannot claim signing-fingerprint, dependency, offline-custody,
second-person, recovery, rollout, production, or operations-escrow completion.

Next.js runtime CI evidence uses
`starfiniti.next-runtime-ci-evidence.v1`. The first accepted artifact is
`next-runtime-c3b2954-2026-08-29T155152Z.json` (5,199 bytes, SHA-256
`d90150e1ec818f1fa092df6cf6a91137c1333cf5b97b4eafb4bcfe3b4ec205ca`).
It binds exact implementation `c3b29542035772ddcbc48d92e2b159ac605dd80f`,
CI `33261152926`, Security `33261152934`, the external zero-result CodeQL
analysis, all twelve required checks, retained artifact archive hashes, both
image identities and SBOMs, the complete database/WooCommerce regression, and
false merge, release, deployment, reconciliation, and production-mutation
authority. It proves a repository candidate only; it does not prove production
repair.

WooCommerce runtime CI evidence uses
`starfiniti.woocommerce-runtime-ci-evidence.v1`. The first accepted artifact is
`woocommerce-runtime-c3b2954-2026-08-29T163051Z.json` (4,291 bytes, SHA-256
`950091da92c90a5834a1020bed83d275e1d3b0891ff6ca565ac79d2a0682188e`).
It binds exact implementation `c3b29542035772ddcbc48d92e2b159ac605dd80f`,
CI run `33261152926`, all four minimum/current × HPOS/legacy job identities and
chronology, reviewed current artifact checks, live runtime assertions, native
coupon order/reconciliation paths, cleanup, and false release/pilot/deployment/
observation/reconciliation authority. It proves a disposable compatibility
matrix only; it does not prove a merchant-store upgrade or released connector.

Never store provider bodies, credentials, raw ETags, hostnames, IP addresses,
usernames, SSH routes or keys, raw command output, personal data, tenant/customer
identifiers, mutable drafts, or unapproved operational telemetry here.
