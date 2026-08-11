# ADR-0002: Pinned self-hosted Supabase on a Proxmox Linux VM

- Status: Accepted for development/staging; production approval still required
- Date: 2026-08-11
- Upstream review: Supabase breaking-change changelog, self-hosting Docker/Auth-key guides, and `self-hosted/v0.8.0` tag checked 2026-08-11

## Context

The product must be open-source and self-hosted on Proxmox. Supabase's current self-hosted release is `self-hosted/v0.8.0`; its default gateway changed from Kong to Envoy in August 2026. Copying an unpinned `master` deployment would make rollback unreliable.

## Decision

Run official, pinned Supabase Docker Compose assets inside a dedicated Linux VM on Proxmox. Use Envoy as the default API gateway, terminate public TLS explicitly, keep Postgres volumes on durable VM storage, and send encrypted backups off-host. Deploy application containers separately so application rollback does not roll back the database stack.

Configure the current self-hosted contract explicitly: PostgreSQL 17, `API_EXTERNAL_URL` ending in `/auth/v1`, separate public/site URLs, Supavisor for pooled application traffic, generated publishable/secret keys plus asymmetric signing keys, and opt-in Analytics/Vector only when their resource/operational cost is justified.

## Alternatives

- Kubernetes/LXC: greater orchestration density but more privilege/network/storage complexity for the initial capacity envelope.
- Raw PostgreSQL plus hand-selected services: smaller footprint but transfers auth/API/storage integration and patching responsibility to this project.

## Security and integrity effects

Pinned versions and separated secrets reduce supply-chain and rollback risk. The Supabase secret key remains server-only. Every exposed application table still requires RLS; self-hosting does not create tenant isolation automatically.

## Operations

Minimum upstream guidance is 4 GB RAM/2 cores/40 GB SSD; plan 8 GB+/4 cores/80 GB+ SSD before load evidence. Stage upgrades and validate Envoy/auth routing, API key/JWKS behavior, Studio ownership, PostgreSQL major-version compatibility, backups, and restores.

## Migration and rollback

Record `.supabase-version`, back up Postgres and configuration before upgrades, and retain the previous application image. Database migrations use forward-compatible versioned files and compensating rollback where destructive reversal is unsafe.
