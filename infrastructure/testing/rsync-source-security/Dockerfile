ARG BASE_IMAGE
FROM ${BASE_IMAGE} AS builder

ARG EXPECTED_OS_ID
ARG EXPECTED_OS_VERSION
ARG EXPECTED_ARCHITECTURE=amd64
ARG SOURCE_URL
ARG SOURCE_SHA256
ARG SOURCE_BYTES
ARG SIGNATURE_URL
ARG SIGNATURE_SHA256
ARG RELEASE_KEY_URL
ARG RELEASE_KEY_SHA256
ARG SIGNING_FINGERPRINT
ARG SOURCE_TREE_ROOT
ARG SOURCE_TREE_ENTRIES
ARG SOURCE_TREE_FILES
ARG SOURCE_TREE_LINKS
ARG SOURCE_TREE_BYTES
ARG SOURCE_TREE_MANIFEST_SHA256
ARG INSTALL_ROOT=/opt/starfiniti/rsync/3.5.0
ARG CANDIDATE_EXECUTABLE_SHA256
ARG CANDIDATE_WRAPPER_SHA256

SHELL ["/bin/sh", "-euxc"]

COPY --chmod=0555 verify-source.py /usr/local/bin/starfiniti-verify-rsync-source

RUN . /etc/os-release; \
    test "$ID" = "$EXPECTED_OS_ID"; \
    test "$VERSION_ID" = "$EXPECTED_OS_VERSION"; \
    test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      acl attr build-essential ca-certificates curl gnupg libacl1-dev libattr1-dev \
      liblz4-dev libssl-dev libxxhash-dev libzstd-dev python3; \
    starfiniti-verify-rsync-source --self-test; \
    mkdir -m 0700 /tmp/starfiniti-rsync-build /tmp/starfiniti-rsync-gnupg; \
    cd /tmp/starfiniti-rsync-build; \
    curl --fail --location --proto '=https' --tlsv1.2 --output source.tar.gz "$SOURCE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output source.tar.gz.asc "$SIGNATURE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output release-key.asc "$RELEASE_KEY_URL"; \
    printf '%s  %s\n' \
      "$SOURCE_SHA256" source.tar.gz \
      "$SIGNATURE_SHA256" source.tar.gz.asc \
      "$RELEASE_KEY_SHA256" release-key.asc | sha256sum --check --strict; \
    test "$(wc -c <source.tar.gz)" -eq "$SOURCE_BYTES"; \
    GNUPGHOME=/tmp/starfiniti-rsync-gnupg gpg --batch --import release-key.asc; \
    test "$(GNUPGHOME=/tmp/starfiniti-rsync-gnupg gpg --batch --with-colons --fingerprint "$SIGNING_FINGERPRINT" | awk -F: '$1 == "fpr" { print $10; exit }')" = "$SIGNING_FINGERPRINT"; \
    GNUPGHOME=/tmp/starfiniti-rsync-gnupg gpg --batch --status-fd=1 --verify source.tar.gz.asc source.tar.gz >signature.status 2>/dev/null; \
    awk -v fingerprint="$SIGNING_FINGERPRINT" '$2 == "VALIDSIG" && $3 == fingerprint { valid += 1 } END { exit valid == 1 ? 0 : 1 }' signature.status; \
    starfiniti-verify-rsync-source \
      --archive source.tar.gz \
      --root "$SOURCE_TREE_ROOT" \
      --entries "$SOURCE_TREE_ENTRIES" \
      --files "$SOURCE_TREE_FILES" \
      --links "$SOURCE_TREE_LINKS" \
      --bytes "$SOURCE_TREE_BYTES" \
      --manifest-sha256 "$SOURCE_TREE_MANIFEST_SHA256"; \
    tar -xzf source.tar.gz --no-same-owner -C /tmp/starfiniti-rsync-build; \
    starfiniti-verify-rsync-source \
      --tree "/tmp/starfiniti-rsync-build/$SOURCE_TREE_ROOT" \
      --root "$SOURCE_TREE_ROOT" \
      --entries "$SOURCE_TREE_ENTRIES" \
      --files "$SOURCE_TREE_FILES" \
      --links "$SOURCE_TREE_LINKS" \
      --bytes "$SOURCE_TREE_BYTES" \
      --manifest-sha256 "$SOURCE_TREE_MANIFEST_SHA256"; \
    cd "/tmp/starfiniti-rsync-build/$SOURCE_TREE_ROOT"; \
    export SOURCE_DATE_EPOCH=1786589340; \
    export DEB_BUILD_MAINT_OPTIONS=hardening=+all; \
    export CFLAGS="$(dpkg-buildflags --get CFLAGS)"; \
    export CPPFLAGS="$(dpkg-buildflags --get CPPFLAGS)"; \
    export LDFLAGS="$(dpkg-buildflags --get LDFLAGS)"; \
    test -n "$CFLAGS"; \
    test -n "$CPPFLAGS"; \
    test -n "$LDFLAGS"; \
    ./configure \
      --prefix="$INSTALL_ROOT" \
      --with-rrsync \
      --with-included-popt \
      --disable-debug; \
    make -j2 rsync; \
    strip --strip-unneeded rsync; \
    readelf -h rsync | grep -Eq 'Type:[[:space:]]+DYN'; \
    readelf -W -l rsync | grep -Fq 'GNU_RELRO'; \
    readelf -W -l rsync | awk '$1 == "GNU_STACK" { found += 1; if ($0 ~ /RWE/) executable += 1 } END { exit found == 1 && executable == 0 ? 0 : 1 }'; \
    readelf -d rsync | grep -Fq 'BIND_NOW'; \
    ! readelf -d rsync | grep -Eq '\((RPATH|RUNPATH)\)'; \
    install -D -o root -g root -m 0555 rsync "$INSTALL_ROOT/bin/rsync"; \
    install -D -o root -g root -m 0555 support/rrsync "$INSTALL_ROOT/bin/rrsync"; \
    test "$(readlink -f "$INSTALL_ROOT/bin/rsync")" = "$INSTALL_ROOT/bin/rsync"; \
    test "$(readlink -f "$INSTALL_ROOT/bin/rrsync")" = "$INSTALL_ROOT/bin/rrsync"; \
    test "$(stat -c '%u:%g:%a:%F' "$INSTALL_ROOT/bin/rsync")" = '0:0:555:regular file'; \
    test "$(stat -c '%u:%g:%a:%F' "$INSTALL_ROOT/bin/rrsync")" = '0:0:555:regular file'; \
    "$INSTALL_ROOT/bin/rsync" --version > /tmp/starfiniti-rsync-version; \
    grep -Eq '^rsync  version 3\.5\.0  protocol version 32$' /tmp/starfiniti-rsync-version; \
    for capability in ACLs xattrs iconv openssl-crypto xxhash zstd lz4; do grep -Fq "$capability" /tmp/starfiniti-rsync-version; done; \
    grep -Fq -- "rsync_opts.append('--confine-root=' + os.getcwd())" "$INSTALL_ROOT/bin/rrsync"; \
    if test -n "$CANDIDATE_EXECUTABLE_SHA256"; then printf '%s  %s\n' "$CANDIDATE_EXECUTABLE_SHA256" "$INSTALL_ROOT/bin/rsync" | sha256sum --check --strict; fi; \
    if test -n "$CANDIDATE_WRAPPER_SHA256"; then printf '%s  %s\n' "$CANDIDATE_WRAPPER_SHA256" "$INSTALL_ROOT/bin/rrsync" | sha256sum --check --strict; fi; \
    ldd "$INSTALL_ROOT/bin/rsync" | tee /tmp/starfiniti-rsync-runtime-libraries; \
    ! grep -Eq 'not found|/usr/local|/tmp' /tmp/starfiniti-rsync-runtime-libraries

FROM ${BASE_IMAGE}

ARG EXPECTED_OS_ID
ARG EXPECTED_OS_VERSION
ARG EXPECTED_ARCHITECTURE=amd64
ARG CURRENT_PACKAGE_VERSION
ARG CURRENT_PACKAGE_URL
ARG CURRENT_PACKAGE_SHA256
ARG EXPECTED_NATIVE_ACL_VERSION
ARG INSTALL_ROOT=/opt/starfiniti/rsync/3.5.0
ARG CANDIDATE_EXECUTABLE_SHA256
ARG CANDIDATE_WRAPPER_SHA256

SHELL ["/bin/sh", "-euxc"]

RUN . /etc/os-release; \
    test "$ID" = "$EXPECTED_OS_ID"; \
    test "$VERSION_ID" = "$EXPECTED_OS_VERSION"; \
    test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates curl python3; \
    curl --fail --location --proto '=https' --tlsv1.2 --output /tmp/current-rsync.deb "$CURRENT_PACKAGE_URL"; \
    printf '%s  %s\n' "$CURRENT_PACKAGE_SHA256" /tmp/current-rsync.deb | sha256sum --check --strict; \
    test "$(dpkg-deb --field /tmp/current-rsync.deb Package)" = rsync; \
    test "$(dpkg-deb --field /tmp/current-rsync.deb Version)" = "$CURRENT_PACKAGE_VERSION"; \
    test "$(dpkg-deb --field /tmp/current-rsync.deb Architecture)" = "$EXPECTED_ARCHITECTURE"; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends /tmp/current-rsync.deb; \
    test "$(dpkg-query --show --showformat='${Version}' rsync)" = "$CURRENT_PACKAGE_VERSION"; \
    test "$(dpkg-query --show --showformat='${Version}' libacl1)" = "$EXPECTED_NATIVE_ACL_VERSION"; \
    test "$(readlink -f /usr/bin/rsync)" = /usr/bin/rsync; \
    test "$(readlink -f /usr/bin/rrsync)" = /usr/bin/rrsync; \
    test "$(stat -c '%u:%g:%a:%F' /usr/bin/rsync)" = '0:0:755:regular file'; \
    test "$(stat -c '%u:%g:%a:%F' /usr/bin/rrsync)" = '0:0:755:regular file'; \
    printf 'currentVersion=%s\ncurrentExecutableSha256=%s\ncurrentWrapperSha256=%s\nnativeAclVersion=%s\n' \
      "$CURRENT_PACKAGE_VERSION" \
      "$(sha256sum /usr/bin/rsync | cut -d' ' -f1)" \
      "$(sha256sum /usr/bin/rrsync | cut -d' ' -f1)" \
      "$EXPECTED_NATIVE_ACL_VERSION" > /usr/local/share/starfiniti-rsync-current-facts; \
    chmod 0444 /usr/local/share/starfiniti-rsync-current-facts; \
    rm -f /tmp/current-rsync.deb; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

COPY --from=builder /opt/starfiniti/rsync/3.5.0 /opt/starfiniti/rsync/3.5.0
COPY --chmod=0555 guest-entrypoint.sh /usr/local/bin/starfiniti-rsync-source-guest
COPY --chmod=0555 host-canary.sh /usr/local/bin/starfiniti-rsync-source-host

RUN test "$(stat -c '%u:%g:%a:%F' "$INSTALL_ROOT/bin/rsync")" = '0:0:555:regular file'; \
    test "$(stat -c '%u:%g:%a:%F' "$INSTALL_ROOT/bin/rrsync")" = '0:0:555:regular file'; \
    "$INSTALL_ROOT/bin/rsync" --version > /tmp/starfiniti-rsync-version; \
    grep -Eq '^rsync  version 3\.5\.0  protocol version 32$' /tmp/starfiniti-rsync-version; \
    for capability in ACLs xattrs iconv openssl-crypto xxhash zstd lz4; do grep -Fq "$capability" /tmp/starfiniti-rsync-version; done; \
    grep -Fq -- "rsync_opts.append('--confine-root=' + os.getcwd())" "$INSTALL_ROOT/bin/rrsync"; \
    if test -n "$CANDIDATE_EXECUTABLE_SHA256"; then printf '%s  %s\n' "$CANDIDATE_EXECUTABLE_SHA256" "$INSTALL_ROOT/bin/rsync" | sha256sum --check --strict; fi; \
    if test -n "$CANDIDATE_WRAPPER_SHA256"; then printf '%s  %s\n' "$CANDIDATE_WRAPPER_SHA256" "$INSTALL_ROOT/bin/rrsync" | sha256sum --check --strict; fi; \
    ldd "$INSTALL_ROOT/bin/rsync" | tee /tmp/starfiniti-rsync-runtime-libraries; \
    ! grep -Eq 'not found|/usr/local|/tmp' /tmp/starfiniti-rsync-runtime-libraries; \
    test "$(dpkg-query --show --showformat='${Version}' rsync)" = "$CURRENT_PACKAGE_VERSION"; \
    test "$(dpkg-query --show --showformat='${Version}' libacl1)" = "$EXPECTED_NATIVE_ACL_VERSION"; \
    printf '%s\n' 'starfiniti:x:65532:' >>/etc/group; \
    printf '%s\n' 'starfiniti:x:65532:65532:Starfiniti rsync canary:/nonexistent:/usr/sbin/nologin' >>/etc/passwd; \
    rm -f /tmp/starfiniti-rsync-version /tmp/starfiniti-rsync-runtime-libraries; \
    test -z "$(find /tmp /var/cache/apt/archives -type f \( -name '*.deb' -o -name 'source.tar.gz*' -o -name 'release-key.asc' \) -print -quit)"

LABEL com.starfiniti.disposable="true" \
      com.starfiniti.purpose="rsync-source-security-canary"

USER 65532:65532

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-ec", "test -x /opt/starfiniti/rsync/3.5.0/bin/rsync && /opt/starfiniti/rsync/3.5.0/bin/rsync --version | grep -Eq '^rsync  version 3\\.5\\.0  protocol version 32$'"]

ENTRYPOINT ["/usr/bin/false"]
