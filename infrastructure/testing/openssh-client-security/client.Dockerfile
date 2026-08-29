ARG BASE_IMAGE=debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132
FROM ${BASE_IMAGE} AS builder

ARG EXPECTED_ARCHITECTURE=amd64
ARG CANDIDATE_VERSION=10.5p1
ARG SOURCE_URL=https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-10.5p1.tar.gz
ARG SOURCE_SHA256=d44d28a839ea9daf969cc69150fde59910b2b39361dad81a3bd6cbd19218db11
ARG SOURCE_BYTES=2333659
ARG SIGNATURE_URL=https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-10.5p1.tar.gz.asc
ARG SIGNATURE_SHA256=77b48fd2657520db9229b82bc1bab3f5c00b1b6f7ac2dbb9111b1c8584d6e335
ARG SIGNING_IDENTITY_URL=https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/RELEASE_KEY.asc
ARG SIGNING_IDENTITY_SHA256=c4a6f4692c9b8e75ec096add049fe0314b3ceff9410321f1e85907cf7a864269
ARG SIGNING_FINGERPRINT=7168B983815A5EEF59A4ADFD2A3F414E736060BA
ARG SOURCE_TREE_ROOT=openssh-10.5p1
ARG SOURCE_TREE_ENTRIES=930
ARG SOURCE_TREE_FILES=892
ARG SOURCE_TREE_BYTES=10059047
ARG SOURCE_TREE_MANIFEST_SHA256=b711344d08bc174e15067b936018eb4e07e308b6526228ba1afd927ba70759ab
ARG INSTALL_ROOT=/opt/starfiniti/openssh/10.5p1
ARG CANDIDATE_EXECUTABLE_SHA256

SHELL ["/bin/sh", "-euxc"]

COPY --chmod=0555 verify-source.py /usr/local/bin/starfiniti-verify-openssh-source

RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    . /etc/os-release; test "$ID" = debian; test "$VERSION_ID" = 13; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends build-essential ca-certificates curl gnupg libssl-dev python3 zlib1g-dev; \
    starfiniti-verify-openssh-source --self-test; \
    mkdir -m 0700 /tmp/starfiniti-openssh-build /tmp/starfiniti-openssh-gnupg; \
    cd /tmp/starfiniti-openssh-build; \
    curl --fail --location --proto '=https' --tlsv1.2 --output source.tar.gz "$SOURCE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output source.tar.gz.asc "$SIGNATURE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output release-key.asc "$SIGNING_IDENTITY_URL"; \
    printf '%s  %s\n' "$SOURCE_SHA256" source.tar.gz "$SIGNATURE_SHA256" source.tar.gz.asc "$SIGNING_IDENTITY_SHA256" release-key.asc | sha256sum --check --strict; \
    test "$(wc -c <source.tar.gz)" -eq "$SOURCE_BYTES"; \
    GNUPGHOME=/tmp/starfiniti-openssh-gnupg gpg --batch --import release-key.asc; \
    test "$(GNUPGHOME=/tmp/starfiniti-openssh-gnupg gpg --batch --with-colons --fingerprint "$SIGNING_FINGERPRINT" | awk -F: '$1 == "fpr" { print $10; exit }')" = "$SIGNING_FINGERPRINT"; \
    GNUPGHOME=/tmp/starfiniti-openssh-gnupg gpg --batch --status-fd=1 --verify source.tar.gz.asc source.tar.gz >signature.status 2>/dev/null; \
    awk -v fingerprint="$SIGNING_FINGERPRINT" '$2 == "VALIDSIG" && $NF == fingerprint { valid += 1 } END { exit valid == 1 ? 0 : 1 }' signature.status; \
    starfiniti-verify-openssh-source --archive source.tar.gz --root "$SOURCE_TREE_ROOT" --entries "$SOURCE_TREE_ENTRIES" --files "$SOURCE_TREE_FILES" --bytes "$SOURCE_TREE_BYTES" --manifest-sha256 "$SOURCE_TREE_MANIFEST_SHA256"; \
    tar -xzf source.tar.gz --no-same-owner -C /tmp/starfiniti-openssh-build; \
    starfiniti-verify-openssh-source --tree "/tmp/starfiniti-openssh-build/$SOURCE_TREE_ROOT" --root "$SOURCE_TREE_ROOT" --entries "$SOURCE_TREE_ENTRIES" --files "$SOURCE_TREE_FILES" --bytes "$SOURCE_TREE_BYTES" --manifest-sha256 "$SOURCE_TREE_MANIFEST_SHA256"; \
    cd "/tmp/starfiniti-openssh-build/$SOURCE_TREE_ROOT"; \
    SOURCE_DATE_EPOCH=1786409280 ./configure --prefix="$INSTALL_ROOT" --sysconfdir=/etc/ssh --without-pam --without-libedit --without-kerberos5 --with-default-path=/usr/bin:/bin; \
    SOURCE_DATE_EPOCH=1786409280 make -j2 ssh; \
    strip --strip-unneeded ssh; \
    install -D -o root -g root -m 0555 ssh "$INSTALL_ROOT/bin/ssh"; \
    test "$(readlink -f "$INSTALL_ROOT/bin/ssh")" = "$INSTALL_ROOT/bin/ssh"; \
    test "$(stat -c '%u:%g:%a:%F' "$INSTALL_ROOT/bin/ssh")" = '0:0:555:regular file'; \
    "$INSTALL_ROOT/bin/ssh" -V 2>&1 | grep -Eq '^OpenSSH_10\.5p1([,[:space:]]|$)'; \
    if test -n "$CANDIDATE_EXECUTABLE_SHA256"; then printf '%s  %s\n' "$CANDIDATE_EXECUTABLE_SHA256" "$INSTALL_ROOT/bin/ssh" | sha256sum --check --strict; fi; \
    ldd "$INSTALL_ROOT/bin/ssh" | tee /tmp/starfiniti-openssh-runtime-libraries; \
    ! grep -Eq 'not found|/usr/local|/tmp' /tmp/starfiniti-openssh-runtime-libraries

FROM ${BASE_IMAGE}

ARG EXPECTED_ARCHITECTURE=amd64
ARG CURRENT_PACKAGE_VERSION=1:10.0p1-7+deb13u4
ARG CURRENT_PACKAGE_URL=https://deb.debian.org/debian/pool/main/o/openssh/openssh-client_10.0p1-7+deb13u4_amd64.deb
ARG CURRENT_PACKAGE_SHA256=8fff343654f86c3b3266f94cd338c7b4da2e386da029327815118ea00bce03b9
ARG CURRENT_EXECUTABLE_SHA256=af3b04ec5653755032fc18ad02445e4e51170e75d8bac4265647d423caa9a83e
ARG INSTALL_ROOT=/opt/starfiniti/openssh/10.5p1
ARG CANDIDATE_EXECUTABLE_SHA256

SHELL ["/bin/sh", "-euxc"]

RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates curl openssh-client="$CURRENT_PACKAGE_VERSION"; \
    mkdir -m 0700 /tmp/starfiniti-openssh-rollback; \
    cd /tmp/starfiniti-openssh-rollback; \
    apt-get download "openssh-client=$CURRENT_PACKAGE_VERSION"; \
    set -- ./openssh-client_*.deb; test "$#" -eq 1; mv "$1" signed-metadata.deb; \
    curl --fail --location --proto '=https' --tlsv1.2 --output exact-url.deb "$CURRENT_PACKAGE_URL"; \
    printf '%s  %s\n' "$CURRENT_PACKAGE_SHA256" signed-metadata.deb "$CURRENT_PACKAGE_SHA256" exact-url.deb | sha256sum --check --strict; \
    cmp signed-metadata.deb exact-url.deb; \
    test "$(dpkg-deb --field signed-metadata.deb Package)" = openssh-client; \
    test "$(dpkg-deb --field signed-metadata.deb Version)" = "$CURRENT_PACKAGE_VERSION"; \
    test "$(dpkg-deb --field signed-metadata.deb Architecture)" = "$EXPECTED_ARCHITECTURE"; \
    test "$(dpkg-query --show --showformat='${Version}' openssh-client)" = "$CURRENT_PACKAGE_VERSION"; \
    printf '%s  %s\n' "$CURRENT_EXECUTABLE_SHA256" /usr/bin/ssh | sha256sum --check --strict; \
    rm -rf /tmp/starfiniti-openssh-rollback /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

COPY --from=builder /opt/starfiniti/openssh/10.5p1 /opt/starfiniti/openssh/10.5p1
COPY --chmod=0555 client-canary.sh /usr/local/bin/starfiniti-openssh-client-canary

RUN candidate="$INSTALL_ROOT/bin/ssh"; \
    test "$(readlink -f "$candidate")" = "$candidate"; \
    test "$(stat -c '%u:%g:%a:%F' "$candidate")" = '0:0:555:regular file'; \
    "$candidate" -V 2>&1 | grep -Eq '^OpenSSH_10\.5p1([,[:space:]]|$)'; \
    if test -n "$CANDIDATE_EXECUTABLE_SHA256"; then printf '%s  %s\n' "$CANDIDATE_EXECUTABLE_SHA256" "$candidate" | sha256sum --check --strict; fi; \
    ! find /opt/starfiniti/openssh -type f -perm /022 -print -quit | grep -q .; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb; \
    test -z "$(find /tmp /var/cache/apt/archives -type f \( -name '*.deb' -o -name 'source.tar.gz*' -o -name 'release-key.asc' \) -print -quit)"; \
    printf '%s\n' 'starfiniti:x:65532:' >>/etc/group; \
    printf '%s\n' 'starfiniti:x:65532:65532:Starfiniti OpenSSH canary:/nonexistent:/usr/sbin/nologin' >>/etc/passwd

LABEL com.starfiniti.disposable="true" \
      com.starfiniti.purpose="openssh-client-security-canary"

USER 65532:65532

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=1 \
    CMD ["/opt/starfiniti/openssh/10.5p1/bin/ssh", "-V"]

ENTRYPOINT ["/usr/local/bin/starfiniti-openssh-client-canary"]
