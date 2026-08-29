# ADR-0100: Refresh the immutable Node 24 LTS runtime after source review

- Status: Accepted
- Date: 2026-08-29
- Scope: M15 supply chain and M16 provider/dependency review

## Context

The dashboard and worker Dockerfiles used the immutable multi-platform index
`sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`.
The index was created on 2026-08-03 and its linux/amd64 image reports Node
24.19.0. This was reproducible, but the M16 official-source review found that
Node 24.20.0 LTS was released on 2026-08-26 and the official `24-alpine` image
was rebuilt on 2026-08-27.

Node's release policy recommends Active or Maintenance LTS for production. The
24.20.0 release remains on the Node 24 LTS line. It includes root-certificate
and bundled dependency updates plus additive runtime features; no
Starfiniti-facing breaking change was identified. The official Docker Registry
projection binds:

- index
  `sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`;
- linux/amd64 manifest
  `sha256:4caaaf42195bcd6f6f3559a413b20cb8f8ad089e231ee874cf7701643966689f`;
- image configuration
  `sha256:ee289c69ed1ac50a5a042112ea97f132800e2dd53e832da27784f00e45b3289c`;
- `NODE_VERSION=24.20.0` on `alpine:3.24`.

The exact thirteen-source snapshot, official release entry, registry identities,
impact, owner, disposition, rollback pin, and false production authority are
recorded in `infrastructure/governance/node-runtime-review.yaml`.

Official sources:

- <https://nodejs.org/en/about/previous-releases>
- <https://nodejs.org/en/blog/release/v24.20.0>
- <https://hub.docker.com/_/node>

## Alternatives

### Keep the August 3 immutable image

This avoids immediate image churn but leaves both application images on the
older LTS patch and bundled trust/dependency set after the monthly source review
has identified a newer official LTS image. Rejected.

### Follow the mutable `node:24-alpine` tag

This automatically follows upstream, but the same Git commit can then build
different runtime bytes and rollback cannot identify the prior image. Rejected.

### Refresh one reviewed immutable index and rescan both images

This keeps builds reproducible while advancing to the reviewed LTS runtime. The
same index is used by both build and runner stages in both application images;
CI rebuilds, tests, inventories, and scans the exact result. Selected.

## Decision

Pin every dashboard and worker Node stage to the reviewed 24.20.0 index. Add a
network-free validator to bind the exact official-source snapshot, release and
registry identities, Dockerfile stages, root Node engine, impact owner,
production false-authority fields, and rollback index. The validator runs in
the root gate and adversarially rejects mutable tags, partial stage updates,
source/digest drift, engine drift, and production or deployment overclaims.

This is an integration-candidate dependency update only. It does not authorize
image publication, deployment, restart, production mutation, a higher product
score, or M15/M16 closeout. Exact-head image builds and Trivy/SBOM/CodeQL gates
must pass before the candidate evidence can advance.

## Security and operational effects

- Both runtime images receive the reviewed LTS root-certificate and bundled
  dependency refresh.
- A mutable tag cannot silently replace runtime bytes.
- The previous immutable index remains the exact rollback input.
- Self-hosted and managed behavior, Supabase authority, ledger effects,
  WooCommerce checkout, credentials, and tenant data are unchanged.

## Rollback

If exact-head build, test, scan, canary, or runtime evidence fails, restore all
four Dockerfile stages to
`sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`
in one forward commit and retain the failed evidence. A production rollback
uses the previously approved Starfiniti image, not a rebuilt mutable Node tag.
