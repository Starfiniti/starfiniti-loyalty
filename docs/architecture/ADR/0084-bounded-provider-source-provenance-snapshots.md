# ADR-0084: Bounded provider-source provenance snapshots

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Starfiniti engineering and security
- Scope: M16 official provider, platform, and recovery-dependency source collection

## Context

ADR-0068 requires one monthly review of thirteen canonical official sources. A reviewer previously had to open every page manually before they could even establish which bytes were reviewed. That is slow, difficult to reproduce, and vulnerable to unnoticed source drift. A generic updater is not an adequate replacement: it may follow an attacker-controlled redirect, resolve an internal address, retain copyrighted provider pages, or turn successful download automation into a false claim that compatibility and production impact were reviewed.

The collector runs from a developer or CI workstation, so every source is an untrusted network input even when its catalogue URL is official. DNS answers can mix public and private addresses, redirects can cross trust boundaries, a response can be compressed or unbounded, and a local output path can be replaced. The resulting artifact is useful only if it remains a narrow provenance input. It cannot prove installed endpoint versions, classify a breaking change, assign an owner, approve an upgrade, or close an elapsed monthly review.

The implementation follows the current official Node.js HTTPS, DNS, filesystem, and `net.BlockList` interfaces:

- <https://nodejs.org/api/https.html#httpsrequestoptions-callback>
- <https://nodejs.org/api/dns.html#dnspromiseslookuphostname-options>
- <https://nodejs.org/api/fs.html#fsopenpath-flags-mode-callback>
- <https://nodejs.org/api/net.html#class-netblocklist>

The Supabase entry uses the lightweight official index required for change review: <https://supabase.com/changelog.md>.

## Decision

Add a metadata-only `starfiniti.provider-source-snapshot.v1` collector governed by the same source-controlled plan as M16.

1. The plan contains a closed ordered catalogue of thirteen exact HTTPS sources and one explicit cross-host redirect exception: `www.openssh.com` may redirect only to `www.openssh.org`. Same-host redirects remain allowed. No other host expansion is implicit.
2. Resolve every initial and redirected hostname independently. Reject an empty answer, an IP literal hostname, or any DNS answer that is private, loopback, link-local, carrier-grade NAT, documentation, benchmarking, multicast, reserved, transition, unique-local, or otherwise non-public. Sort the complete public answer set and pin one address into the HTTPS request while retaining the original hostname for TLS SNI and certificate verification.
3. Permit at most five credential-free, query-free, fragment-free HTTPS redirects. Require TLS 1.2 or newer, no pooled agent, a 20-second whole-request deadline, 32 KiB maximum headers, `Accept-Encoding: identity`, and an exact final HTTP 200.
4. Accept only `text/html`, `text/plain`, or `text/markdown`. Reject any content encoding other than identity. Stream at most 4,000,000 bytes directly into SHA-256, require non-empty complete bytes and exact `Content-Length` agreement when declared, and never collect response bodies in an array, artifact, log, or repository file.
5. Record only the canonical source, final allowed URL, exact observation instant, HTTP status, normalized content type, byte count, SHA-256, normalized `Last-Modified` when valid, and a SHA-256 of the ETag when present. The artifact states explicitly that content was not retained and that review, impact classification, and installed evidence are incomplete.
6. Capture only from a clean exact Git `HEAD`. Bind the artifact to that commit and to the stable no-follow bytes of the governance plan, then recheck both immediately before output. Validate that the output parent is a pre-existing non-symlink directory before any network request. Create an absent absolute `.json` path through an exclusive no-follow descriptor, request mode `0600`, enforce it on POSIX, and fsync; never overwrite a prior snapshot. Windows ACL ownership remains a workstation responsibility, so the artifact intentionally contains no provider bodies, credentials, or raw ETags.
7. Keep deterministic self-tests network-free. They must reject catalogue and source drift, false review assertions, private or mixed DNS, unsafe or query-bearing redirects, invalid type or encoding, oversized, truncated, or incomplete bodies, invalid digests, relative output, a missing output parent, and output reuse.

## Alternatives

### Manual browser review only

This preserves human judgment but does not produce a reproducible byte boundary. Reviewers can unknowingly review different provider states during the same close period.

### Commit complete provider pages

This makes bytes locally reproducible but retains large, noisy, externally copyrighted content and can accidentally preserve provider payloads or unsafe markup. It also encourages a snapshot to outlive the official source.

### Use generic `fetch` or dependency-update automation

Automatic redirect and DNS behavior is too broad for this network boundary, and an updater cannot determine Starfiniti's tenant, ledger, checkout, connector, identity, recovery, or billing impact. Successful collection could be mistaken for upgrade approval.

### Bounded metadata-only collection followed by human classification

This is selected. It establishes exact source provenance without widening network authority or replacing the reviewer, installed-version evidence, impact analysis, ownership, tests, or production rollout gate.

## Security and integrity effects

The collector is an outbound SSRF boundary. Rejecting every non-public DNS answer, including IPv4-mapped private addresses, re-resolving and pinning each hop, retaining TLS hostname verification, and closing the redirect host set prevents a provider page or DNS rebinding from reaching the local network. Byte, header, encoding, redirect, and time bounds limit memory and connection amplification. Stable no-follow plan reads plus clean-commit revalidation prevent a snapshot from binding one source plan while recording another. Exclusive no-follow output prevents replacement or silent history rewriting. POSIX execution additionally enforces mode `0600`; Windows execution does not claim equivalent ACL enforcement, and the artifact contains only public-source metadata and digests.

SHA-256 proves only the bytes observed during that run. It does not authenticate a provider beyond normal Web PKI, prove semantic meaning, or establish production compatibility. ETag values are hashed because they are provider-controlled metadata; raw response content is never retained. Snapshot validation rejects additional keys so provider bodies, tokens, cookies, contacts, or other payloads cannot be smuggled into the evidence schema.

## Operations

Run `npm run continuous-improvement:sources:validate` before collection. From a clean exact commit, choose an absent absolute JSON path and run `npm run continuous-improvement:sources:capture -- --out <absolute-path>`. Independently verify it with `npm run continuous-improvement:sources:verify -- --in <absolute-path>`.

Collection failure leaves the provider review unknown. Do not weaken DNS, redirect, type, encoding, size, timeout, or output controls merely to obtain an artifact. Review the official sources, current dependency pins, installed host/guest evidence, and applicable breaking/security/support changes after collection; record impact, affected modules, owner, and disposition in the monthly review. The snapshot is a pre-review input and cannot advance `provider_review`, `dependency_pins`, or any approval check by itself.

## Migration and rollback

Change the Supabase canonical source from its rendered page to the official lightweight Markdown index and add the versioned collector policy, validator, commands, and self-tests. Existing M16 artifacts remain governed by the plan digest they already bind; no historical evidence is rewritten.

If the collector proves harmful or a provider no longer supports the bounded contract, stop automated capture, preserve prior immutable snapshots, and return to manual official-source review. Remove or supersede the collector only through a later ADR and plan version. Never treat the rollback as permission to mark a source fresh, approve an upgrade, or close a monthly review without replacement evidence.
