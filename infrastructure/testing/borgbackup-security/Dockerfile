ARG BASE_IMAGE=debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132
FROM ${BASE_IMAGE}

ARG EXPECTED_ARCHITECTURE=amd64
ARG CURRENT_PACKAGE_VERSION=1.4.0-5
ARG CURRENT_PACKAGE_URL=https://deb.debian.org/debian/pool/main/b/borgbackup/borgbackup_1.4.0-5_amd64.deb
ARG CURRENT_PACKAGE_SHA256=51e1cbdee1fccb31e9c63b93fda81d5fffb14289dc31ba27984e04ebb0c85733
ARG CURRENT_EXECUTABLE_SHA256=babb2b42edd64283220d1f1ca57119d41d8f8b93e4af9c5606874b60dd43bc4d
ARG CANDIDATE_VERSION=1.4.5
ARG CANDIDATE_URL=https://github.com/borgbackup/borg/releases/download/1.4.5/borg-linux-glibc231-x86_64.tgz
ARG CANDIDATE_SHA256=b6cba6b5eee19d51fbf4d89c6090dd40647b856755fffe2e26417365536f2c58
ARG CANDIDATE_BYTES=29702061
ARG CANDIDATE_SIGNATURE_URL=https://github.com/borgbackup/borg/releases/download/1.4.5/borg-linux-glibc231-x86_64.tgz.asc
ARG CANDIDATE_SIGNATURE_SHA256=9e7027a2573028e67d9138ccd3de4008d3fad22a5840ac4711f7d56fe89f850a
ARG CANDIDATE_README_URL=https://github.com/borgbackup/borg/releases/download/1.4.5/00_README.txt
ARG CANDIDATE_README_SHA256=9245dd1cfffb1b40d7f1b112e9e917902f2ca255b63a417f671d3da3a12e204a
ARG SIGNER_IDENTITY_URL=https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x6D5BEF9ADD2075805747B70F9F88FB52FAF7B393
ARG SIGNING_FINGERPRINT=6D5BEF9ADD2075805747B70F9F88FB52FAF7B393
ARG CANDIDATE_EXECUTABLE_SHA256=e0a23534bf28aa90940f749bb25dbbeecd401e9bf1de1dd8872cedc45f98718d
ARG CANDIDATE_TREE_ENTRIES=106
ARG CANDIDATE_TREE_FILES=95
ARG CANDIDATE_TREE_BYTES=79942815
ARG CANDIDATE_TREE_MANIFEST_SHA256=09fb420dce78c94814520628cf68ecdd77ab75d4fd9c794f8916874f2a767827

SHELL ["/bin/sh", "-euxc"]

COPY --chmod=0555 verify-tree.py /usr/local/bin/starfiniti-verify-borg-tree

RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    . /etc/os-release; test "$ID" = debian; test "$VERSION_ID" = 13; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates curl gnupg jq python3 borgbackup="$CURRENT_PACKAGE_VERSION"; \
    mkdir -m 0700 /tmp/starfiniti-borg-verify; \
    cd /tmp/starfiniti-borg-verify; \
    apt-get download "borgbackup=$CURRENT_PACKAGE_VERSION"; \
    set -- ./borgbackup_*.deb; test "$#" -eq 1; mv "$1" signed-metadata.deb; \
    curl --fail --location --proto '=https' --tlsv1.2 --output exact-url.deb "$CURRENT_PACKAGE_URL"; \
    printf '%s  %s\n' "$CURRENT_PACKAGE_SHA256" signed-metadata.deb "$CURRENT_PACKAGE_SHA256" exact-url.deb | sha256sum --check --strict; \
    cmp signed-metadata.deb exact-url.deb; \
    test "$(dpkg-deb --field signed-metadata.deb Package)" = borgbackup; \
    test "$(dpkg-deb --field signed-metadata.deb Version)" = "$CURRENT_PACKAGE_VERSION"; \
    test "$(dpkg-deb --field signed-metadata.deb Architecture)" = "$EXPECTED_ARCHITECTURE"; \
    test "$(dpkg-query --show --showformat='${Version}' borgbackup)" = "$CURRENT_PACKAGE_VERSION"; \
    printf '%s  %s\n' "$CURRENT_EXECUTABLE_SHA256" /usr/bin/borg | sha256sum --check --strict; \
    test "$(borg --version)" = 'borg 1.4.0'; \
    curl --fail --location --proto '=https' --tlsv1.2 --output candidate.tgz "$CANDIDATE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output candidate.tgz.asc "$CANDIDATE_SIGNATURE_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output 00_README.txt "$CANDIDATE_README_URL"; \
    printf '%s  %s\n' "$CANDIDATE_SHA256" candidate.tgz "$CANDIDATE_SIGNATURE_SHA256" candidate.tgz.asc "$CANDIDATE_README_SHA256" 00_README.txt | sha256sum --check --strict; \
    test "$(wc -c <candidate.tgz)" -eq "$CANDIDATE_BYTES"; \
    mkdir -m 0700 gnupg; \
    curl --fail --location --proto '=https' --tlsv1.2 --output signer.asc "$SIGNER_IDENTITY_URL"; \
    GNUPGHOME=/tmp/starfiniti-borg-verify/gnupg gpg --batch --import signer.asc; \
    test "$(GNUPGHOME=/tmp/starfiniti-borg-verify/gnupg gpg --batch --with-colons --fingerprint "$SIGNING_FINGERPRINT" | awk -F: '$1 == "fpr" { print $10; exit }')" = "$SIGNING_FINGERPRINT"; \
    grep -Fq 'GPG key fingerprint: 6D5B EF9A DD20 7580 5747 B70F 9F88 FB52 FAF7 B393' 00_README.txt; \
    GNUPGHOME=/tmp/starfiniti-borg-verify/gnupg gpg --batch --status-fd=1 --verify candidate.tgz.asc candidate.tgz >signature.status 2>/dev/null; \
    awk -v fingerprint="$SIGNING_FINGERPRINT" '$2 == "VALIDSIG" && $NF == fingerprint { valid += 1 } END { exit valid == 1 ? 0 : 1 }' signature.status; \
    starfiniti-verify-borg-tree --archive candidate.tgz "$CANDIDATE_TREE_ENTRIES" "$CANDIDATE_TREE_FILES" "$CANDIDATE_TREE_BYTES" "$CANDIDATE_TREE_MANIFEST_SHA256"; \
    mkdir -p /opt/starfiniti/borg/1.4.5; \
    tar -xzf candidate.tgz --no-same-owner --no-same-permissions -C /opt/starfiniti/borg/1.4.5; \
    chown -R root:root /opt/starfiniti/borg; \
    find /opt/starfiniti/borg -type d -exec chmod 0755 {} +; \
    find /opt/starfiniti/borg -type f -exec chmod 0444 {} +; \
    candidate=/opt/starfiniti/borg/1.4.5/borg-dir/borg.exe; \
    chmod 0555 "$candidate"; \
    test "$(readlink -f "$candidate")" = "$candidate"; \
    test "$(stat -c '%u:%g:%a:%F' "$candidate")" = '0:0:555:regular file'; \
    printf '%s  %s\n' "$CANDIDATE_EXECUTABLE_SHA256" "$candidate" | sha256sum --check --strict; \
    test "$("$candidate" --version)" = "borg.exe $CANDIDATE_VERSION"; \
    starfiniti-verify-borg-tree --tree /opt/starfiniti/borg/1.4.5/borg-dir "$CANDIDATE_TREE_ENTRIES" "$CANDIDATE_TREE_FILES" "$CANDIDATE_TREE_BYTES" "$CANDIDATE_TREE_MANIFEST_SHA256"; \
    rm -rf /tmp/starfiniti-borg-verify /var/lib/apt/lists/* /var/cache/apt/archives/*.deb; \
    test -z "$(find /tmp /var/cache/apt/archives -type f \( -name '*.deb' -o -name 'candidate.tgz*' -o -name 'signer.asc' \) -print -quit)"

COPY --chmod=0555 starfiniti-borg-fake-ssh /usr/local/bin/starfiniti-borg-fake-ssh
COPY --chmod=0555 canary.sh /usr/local/bin/starfiniti-borg-canary

LABEL com.starfiniti.disposable="true" \
      com.starfiniti.purpose="borgbackup-security-canary"

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=1 \
  CMD /opt/starfiniti/borg/1.4.5/borg-dir/borg.exe --version >/dev/null || exit 1

USER 65532:65532

ENTRYPOINT ["/usr/local/bin/starfiniti-borg-canary"]
