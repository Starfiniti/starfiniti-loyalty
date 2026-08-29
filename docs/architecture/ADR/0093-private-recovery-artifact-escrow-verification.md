# ADR-0093: Private recovery artifact escrow verification

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, recovery, and operations
- Scope: M16 recovery dependency evidence and R-004

## Context

ADR-0091 and ADR-0092 select exact side-by-side BorgBackup and OpenSSH client
candidates. Their signed inputs, rollback packages, candidate executable hashes,
build instructions, compatibility reports, and rollback guidance are known, but
the production gate still depends on operations copying those exact materials to
approved offline escrow. The repository previously described the contents only
in prose. It had no executable way to reject an incomplete directory, a wrong
package, a changed binary, a linked file, a time-of-check/time-of-use swap, or an
extra unreviewed file.

Escrow contains public software and recovery instructions, not production
credentials. Its location, filesystem paths, operator identities, media,
redundancy, and custody records are nevertheless private operational facts and
must not be put in Git or a public CI artifact.

## Alternatives

### Build a tar or ZIP bundle in the repository tool

This provides one transferable file, but it copies and transforms every input,
adds archive extraction as another security boundary, and can obscure links or
unexpected members. It also risks treating a CI artifact as the approved offline
copy. Rejected.

### Commit binaries to Git or Git LFS

This makes byte retrieval convenient but expands repository size and retention,
does not prove independent offline custody, and gives repository compromise the
same authority as recovery escrow. Rejected.

### Verify an operations-staged closed directory in place

Selected. Operations chooses and controls the private destination and stages the
bytes. The repository tool creates only a bounded private inventory and a
separate minimized report. It never downloads, copies, deletes, installs, or
executes an escrowed artifact and has no production route or credential.

## Decision

1. Add `starfiniti.recovery-artifact-escrow-plan.v1` with a closed BorgBackup and
   OpenSSH entry catalogue. Fixed public artifacts bind the exact candidate
   plans; repository instructions bind the clean Git commit used for inventory;
   the Borg signing-key export and candidate dependency inventories remain
   private-manifest-bound inputs requiring later fingerprint/dependency review.
2. Require the escrow root to be an absolute, non-root directory outside the
   repository. It contains exactly `escrow-policy.yaml`, `manifest.json`, and the
   closed entry paths. Absolute, parent-traversing, backslash-bearing,
   case-colliding, linked, special, missing, or extra members fail.
3. Open every file read-only with `O_NOFOLLOW` where the platform exposes it,
   require the lexical path to equal its resolved path so linked parents fail,
   bind descriptor and path identity before and after a bounded streaming read,
   reject multiple hard links, and require exact size and SHA-256. On POSIX,
   group/other-writable files or directories fail.
4. `--inventory` writes only `manifest.json` through an exclusive no-follow
   descriptor. It requires a clean exact Git commit and records false authority
   assertions. `--verify` reopens the complete set, checks the manifest and
   policy, and exclusively publishes a minimized report outside the escrow
   directory.
5. The public report may prove byte inventory, closed-set coverage, stable reads,
   fixed digest matches, repository-byte matches, and zero production mutation.
   It never contains private paths, endpoints, identities, raw file content, or
   arbitrary manifest text.
6. Inventory verification is not operations escrow completion. The report keeps
   signing-fingerprint review, dependency review, offline-copy/custody review,
   second-person review, production authority, and `operationsEscrowComplete`
   false. Those gates require independent private evidence and approval before
   either candidate can be selected.

## Security and integrity effects

The selected approach verifies the bytes that operations actually staged rather
than a second generated archive. Direct-parent resolution, repeated bounded
descriptor reads, final closed-set scans, and before/after inode, size, and
modification checks reduce link and replacement races. The closed set prevents
an apparently complete directory from hiding an unreviewed executable or
instruction. Exact candidate and rollback hashes prevent version labels from
substituting for bytes.

The tool cannot prove that storage is physically offline, encrypted, redundant,
recoverable without the production host, or reviewed by another person. It also
does not cryptographically interpret the variable Borg key export or execute
candidate dependency inspection. Those limitations remain explicit automatic
stops rather than boolean claims accepted from the private manifest.

The implementation uses Node's documented read-only file descriptors,
`O_NOFOLLOW`, `fstat`, bounded `read`, and SHA-256 primitives. The operations
environment must use the repository-supported Node 24-or-newer runtime.

## Operations

Run:

```sh
npm run recovery-artifact-escrow:validate
npm run recovery-artifact-escrow:inventory -- --bundle /absolute/private/escrow
npm run recovery-artifact-escrow:verify -- \
  --bundle /absolute/private/escrow \
  --out /absolute/new/minimized-report.json
```

The staged directory and `manifest.json` stay private. A different person must
re-run verification from the same exact commit, verify both signing fingerprints
and dependency inventories with approved tools, check offline copies and custody,
and record the separate approval evidence. A repository self-test or minimized
report is not that review.

## Migration and rollback

This decision adds repository policy, validation, and documentation only. It
does not change production packages, executables, SSH daemons, timers,
repositories, archives, retention, checkout, or loyalty value.

The verifier never deletes or rewrites an operations bundle. If inventory or
verification fails, preserve private diagnostics, correct or replace the staged
input, and create a new manifest/report. Do not edit an accepted manifest into a
pass. Removing this repository feature does not remove escrow; operations retains
the independently approved bytes and the earlier runbooks remain the rollback
authority.

## Official references

- Node.js file-system API and `O_NOFOLLOW`:
  https://nodejs.org/api/fs.html
- Node.js cryptographic hash API:
  https://nodejs.org/api/crypto.html
- BorgBackup 1.4.5 release:
  https://github.com/borgbackup/borg/releases/tag/1.4.5
- OpenSSH Portable release:
  https://www.openbsd.org/openssh/portable.html
