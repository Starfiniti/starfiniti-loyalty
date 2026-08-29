# ADR-0105: Tag-derived WooCommerce release version

- Status: Accepted
- Date: 2026-08-29
- Module: M15-S03

## Context

The release workflow attached `starfiniti-loyalty.zip` to each semantic Git tag, but the package script copied the development tree byte-for-byte. The tree intentionally identifies itself as `0.1.0-dev` and uses `Stable tag: trunk`. Consequently the published `v0.1.11` archive and every future archive built by that workflow reported `0.1.0-dev` in the WordPress plugin header, runtime constant, and POT metadata. The release tag, image tags, checksums, and attestation could all be valid while WordPress displayed and compared the wrong connector version.

WordPress's official Plugin Handbook was reviewed on 2026-08-29. The main plugin header's `Version` is the current plugin version, WordPress uses PHP `version_compare()` for it, and the official common-issues guidance requires released plugin and stable-tag metadata to agree. Repository source may retain an explicit development identity, but a released archive cannot.

## Decision

- The tracked WooCommerce source remains `0.1.0-dev` with `Stable tag: trunk`; ordinary development does not pretend to be a released version.
- The release workflow derives one numeric `MAJOR.MINOR.PATCH` value only by removing the leading `v` from its already-validated `vMAJOR.MINOR.PATCH` tag. It passes that value to the package builder and verifier without changing tracked files.
- Packaging snapshots the closed non-test plugin file inventory into memory, replaces exactly one development marker in the plugin header, runtime constant, POT project metadata, and readme stable tag, and builds a deterministic ZIP below the single `starfiniti-loyalty/` root.
- Verification reopens the finished ZIP independently. It bounds archive and expanded sizes and entry count, rejects encrypted, unsafe, duplicate, missing, or extra file entries, compares the complete file inventory with the exact production plugin source, and requires exactly one matching version line in each of the four metadata locations. Any retained development marker fails.
- Pull-request CI builds and verifies an exact synthetic `0.0.0` package. The root gate also runs deterministic corruption tests for tag mismatch, retained development metadata, duplicate version metadata, incomplete inventory, non-numeric versions, source mutation, and non-reproducible output.
- The tagged release performs build and verification before image publication, checksums, attestations, or GitHub release creation. A green source-tree test without the finished archive verifier is insufficient release evidence.
- `adm-zip` 0.6.0 is declared directly as release verification tooling. It was already present through `@wordpress/env`; the exact current MIT release was published 2026-07-10, adds no production runtime dependency, and the complete dependency audit reports zero vulnerability.

## Alternatives

1. Commit the release number into PHP, POT, and readme before every tag. This makes the development branch look released between tags and permits four manual edits to drift.
2. Keep `0.1.0-dev` because the GitHub tag and checksum identify the archive. This was rejected because WordPress reads the plugin header for the installed version and the runtime constant also controls asset/cache identity.
3. Replace only the PHP header with shell text substitution in the workflow. This leaves runtime, translation, and stable-tag metadata inconsistent and does not inspect the finished ZIP.
4. Use one package-time overlay plus a closed independent ZIP verifier. This preserves honest development metadata while making the distributed artifact internally and externally consistent, so it is selected.

## Security and integrity effects

The tag is the only release-version authority, and only the fixed numeric form is accepted. The builder does not edit the checkout, execute plugin content, include tests, follow source symlinks, or accept arbitrary archive roots. The verifier treats the ZIP as untrusted bounded input and checks its closed inventory before reading bounded metadata entries. Reproducibility makes unintended source or timestamp drift visible. Checksums and provenance still bind the resulting bytes; this decision does not make an untagged artifact a release.

## Operations

Packaging requires an explicit numeric version: `npm run woocommerce:package -- --version <MAJOR.MINOR.PATCH>`. There is no publishable development artifact. Operators verify a candidate with `npm run woocommerce:package:verify -- --archive <zip> --version <MAJOR.MINOR.PATCH>` before installing it, then retain the existing checksum, attestation, WordPress/WooCommerce matrix, pilot, rollback, and reconciliation gates.

The prior `v0.1.11` archive remains immutable historical evidence of the defect. It is not rewritten. The correction takes effect only in a new approved tag.

## Migration and rollback

There is no database, tenant, connector-protocol, or installed-plugin mutation. Rollback is to stop the release before publication and retain the last reviewed artifact; do not publish a package that falls back to `0.1.0-dev`. Reverting the package overlay reopens R-062 and blocks release. An installed connector rollback uses the prior attested ZIP and its actual recorded version, never a rewritten archive.

## References

- [WordPress plugin header requirements](https://developer.wordpress.org/plugins/plugin-basics/header-requirements/)
- [WordPress plugin common issues](https://developer.wordpress.org/plugins/wordpress-org/common-issues/)
- [WordPress plugin readme version behavior](https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/)
- [Historical Starfiniti v0.1.11 release](https://github.com/Starfiniti/starfiniti-loyalty/releases/tag/v0.1.11)
