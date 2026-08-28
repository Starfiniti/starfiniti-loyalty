# ADR-0083: Build corresponding source before publishing application images

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0064

## Context

The exact dashboard and worker image scans contain reviewed reciprocal licences. The current Medium register correctly treats these as release obligations rather than vulnerabilities or false positives. A package name, SBOM entry, source URL, or green vulnerability threshold does not prove that the source and notices distributed with one tagged image are complete, immutable, and tied to that image.

The dashboard image also carried `@img/sharp-libvips-linuxmusl-x64` only because Next.js output tracing copied the native optimizer used by `next/image`. The product has two 34–38 pixel statically imported logo instances and no remote or customer-controlled image optimization. Next.js documents `images.unoptimized` for small images and states that static imports retain intrinsic dimensions and content-hashed immutable assets. Keeping the native optimizer would add libvips and its transitive build inputs without providing customer value.

Alpine records the exact aports commit and origin package in installed APK metadata, which Syft preserves in CycloneDX properties. Alpine documents that an APKBUILD's `source` includes both remote and local build inputs, that `fetch()` downloads remote inputs, and that the source checksums are authoritative. GitHub documents that file and image attestations bind build provenance but must be verified and do not themselves prove security or licence completion.

References:

- [Next.js Image `unoptimized`](https://nextjs.org/docs/pages/api-reference/components/image#unoptimized)
- [Alpine APKBUILD reference](https://wiki.alpinelinux.org/wiki/APKBUILD_Reference)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [GitHub attestation generation and verification](https://docs.github.com/en/enterprise-cloud%40latest/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

## Alternatives

1. **Publish source links or a written offer.** This is small, but mutable links, disappearing upstream archives, and unbound build recipes make completeness and later reconstruction weak. It does not close R-056.
2. **Keep sharp and mirror its complete source graph.** This preserves unused on-demand resizing but requires the exact sharp-libvips packaging revision, every native dependency source, patches, notices, and language-package inputs. The complexity is disproportionate to two tiny static logos and creates a larger recurring audit surface.
3. **Commit all third-party source archives to this repository.** This is locally available but permanently inflates normal clones, duplicates upstream history, and can silently become stale when the base image changes.
4. **Remove the unused optimizer and build one exact source bundle for every tag.** Use the released image SBOMs as the closed inventory; include the exact Starfiniti tree, exact Alpine packaging trees, every checksum-bound APKBUILD source input, pinned licence texts, notices, and a machine-readable manifest. Verify all of it before any registry authentication or image push.

## Decision

Use option 4.

The dashboard globally disables on-demand image optimization. Its standalone packaging step removes only traced `sharp` and `@img/{colour,sharp-*}` packages and fails on an unexpected `@img` package. The optimizer route must remain absent. Reintroducing image optimization is a material runtime and source-distribution decision, not a silent dependency change.

For each tag, the release job must:

1. build both local images and generate exact CycloneDX SBOMs;
2. reject any unplanned reciprocal package, version, licence expression, image placement, Alpine distribution, origin package, or aports commit;
3. archive the exact Starfiniti commit and the exact aports packaging directory named by installed APK metadata;
4. fetch every remote input missing from each packaging directory and verify its APKBUILD SHA-512 before inclusion;
5. include pinned licence texts, bounded third-party notices, and a manifest of every file, digest, component, source URL, and packaging commit;
6. independently verify the archive, manifest, notices, SBOM digests, safe paths, and closed inventory;
7. write checksums and attest the source archive, manifest, notices, plugin, both SBOMs, and checksum file;
8. only then authenticate to GHCR, push the two images, attest their digests, and create the GitHub release.

The source plan is intentionally exact and release-blocking. A base-image, package, licence, source URL, checksum, origin, distro, architecture, or aports-commit change requires a reviewed plan update. The builder never executes an APKBUILD or downloaded source. It archives the exact packaging tree and verifies every checksum entry as data.

R-056 remains open until a real tagged release produces and verifies the new artifacts and the release-security owner reviews their completeness. Repository wiring, a synthetic fixture, or a green pull-request image scan is not release evidence.

## Security and operational consequences

- Source failure occurs before registry authentication and image publication, so an incomplete release cannot distribute only the binaries.
- The source archive is larger than the current release assets because it includes the full compiler and other upstream sources. The release has explicit byte and time bounds rather than truncating silently.
- SBOM metadata selects authority; browser input, package names alone, mutable branches, and latest-version lookups select nothing.
- All downloads require HTTPS, bounded bytes, an exact output name, and a fixed SHA-512. Redirects to another protocol fail.
- Product source and third-party source remain separate paths inside one archive, while one manifest and checksum set bind them to the tag.
- GitHub attestations provide provenance for the produced files and images. Consumers must still verify checksums, attestations, and the manifest; attestations are not a substitute for review.

## Rollback

If source construction or verification fails, do not log in to GHCR and do not push or publish the tag artifacts. Forward-fix the source plan or the image inputs and rerun from a new reviewed tag.

The image-optimizer removal may be reverted only together with a complete, checksum-bound corresponding-source plan for the newly distributed sharp/libvips graph and a production route test. Never restore sharp merely to make a release pass. Previously published images and source artifacts remain immutable and independently verifiable.
