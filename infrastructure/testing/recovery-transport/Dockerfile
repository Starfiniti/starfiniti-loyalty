ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ARG EXPECTED_OS_ID
ARG EXPECTED_OS_VERSION
ARG EXPECTED_ARCHITECTURE
ARG PACKAGE_NAME
ARG PACKAGE_VERSION
ARG PACKAGE_AUTHORITY
ARG PACKAGE_REPOSITORY_URL
ARG PACKAGE_SUITE
ARG PACKAGE_URL
ARG PACKAGE_SHA256
ARG SIGNING_FINGERPRINT
ARG MINIMUM_VERSION

SHELL ["/bin/sh", "-euxc"]

RUN . /etc/os-release; \
    test "$ID" = "$EXPECTED_OS_ID"; \
    test "$VERSION_ID" = "$EXPECTED_OS_VERSION"; \
    test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates curl gnupg python3; \
    case "$PACKAGE_AUTHORITY" in \
      debian-archive) \
        test "$SIGNING_FINGERPRINT" = debian-archive-keyring; \
        test -s /usr/share/keyrings/debian-archive-keyring.gpg; \
        printf 'deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] %s %s main\n' "$PACKAGE_REPOSITORY_URL" "$PACKAGE_SUITE" > /etc/apt/sources.list.d/starfiniti-rsync-candidate.list; \
        printf 'Package: *\nPin: release a=unstable\nPin-Priority: 1\n\nPackage: rsync\nPin: version %s\nPin-Priority: 1001\n' "$PACKAGE_VERSION" > /etc/apt/preferences.d/starfiniti-rsync-candidate \
        ;; \
      rsync-project-launchpad-ppa) \
        mkdir -m 0700 /tmp/starfiniti-gnupg; \
        curl --fail --location --proto '=https' --tlsv1.2 --output /tmp/starfiniti-ppa.asc "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x${SIGNING_FINGERPRINT}"; \
        GNUPGHOME=/tmp/starfiniti-gnupg gpg --batch --import /tmp/starfiniti-ppa.asc; \
        test "$(GNUPGHOME=/tmp/starfiniti-gnupg gpg --batch --with-colons --list-keys | awk -F: '$1 == "pub" { count += 1 } END { print count + 0 }')" -eq 1; \
        test "$(GNUPGHOME=/tmp/starfiniti-gnupg gpg --batch --with-colons --fingerprint "$SIGNING_FINGERPRINT" | awk -F: '$1 == "fpr" { print $10; exit }')" = "$SIGNING_FINGERPRINT"; \
        GNUPGHOME=/tmp/starfiniti-gnupg gpg --batch --export "$SIGNING_FINGERPRINT" | gpg --batch --yes --dearmor --output /usr/share/keyrings/starfiniti-rsync-ppa.gpg; \
        printf 'deb [signed-by=/usr/share/keyrings/starfiniti-rsync-ppa.gpg] %s %s main\n' "$PACKAGE_REPOSITORY_URL" "$PACKAGE_SUITE" > /etc/apt/sources.list.d/starfiniti-rsync-candidate.list; \
        printf 'Package: *\nPin: release o=LP-PPA-rsyncproject-rsync\nPin-Priority: 1\n\nPackage: rsync\nPin: version %s\nPin-Priority: 1001\n' "$PACKAGE_VERSION" > /etc/apt/preferences.d/starfiniti-rsync-candidate \
        ;; \
      *) exit 1 ;; \
    esac; \
    apt-get update; \
    cd /tmp; \
    apt-get download "$PACKAGE_NAME=$PACKAGE_VERSION"; \
    set -- /tmp/rsync_*.deb; \
    test "$#" -eq 1; \
    mv "$1" /tmp/rsync-candidate.deb; \
    printf '%s  %s\n' "$PACKAGE_SHA256" /tmp/rsync-candidate.deb | sha256sum --check --strict; \
    test "$(dpkg-deb --field /tmp/rsync-candidate.deb Package)" = "$PACKAGE_NAME"; \
    test "$(dpkg-deb --field /tmp/rsync-candidate.deb Version)" = "$PACKAGE_VERSION"; \
    test "$(dpkg-deb --field /tmp/rsync-candidate.deb Architecture)" = "$EXPECTED_ARCHITECTURE"; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends /tmp/rsync-candidate.deb; \
    test "$(dpkg-query --show --showformat='${Version}' "$PACKAGE_NAME")" = "$PACKAGE_VERSION"; \
    test "$(readlink -f /usr/bin/rsync)" = /usr/bin/rsync; \
    test "$(readlink -f /usr/bin/rrsync)" = /usr/bin/rrsync; \
    test "$(stat --format='%u:%g:%a:%F' /usr/bin/rsync)" = '0:0:755:regular file'; \
    test "$(stat --format='%u:%g:%a:%F' /usr/bin/rrsync)" = '0:0:755:regular file'; \
    actual_version="$(rsync --version | sed -n '1s/^rsync  version \([0-9][0-9.]*\).*/\1/p')"; \
    test -n "$actual_version"; \
    first="${actual_version%%.*}"; remainder="${actual_version#*.}"; second="${remainder%%.*}"; third="${remainder#*.}"; \
    min_first="${MINIMUM_VERSION%%.*}"; min_remainder="${MINIMUM_VERSION#*.}"; min_second="${min_remainder%%.*}"; min_third="${min_remainder#*.}"; \
    test "$first" -gt "$min_first" || { test "$first" -eq "$min_first" && { test "$second" -gt "$min_second" || { test "$second" -eq "$min_second" && test "$third" -ge "$min_third"; }; }; }; \
    grep -Fq -- "rsync_opts.append('--confine-root=' + os.getcwd())" /usr/bin/rrsync; \
    grep -Fq -- 'subprocess.run(cmd, pass_fds=tuple(pinned_fds))' /usr/bin/rrsync; \
    mkdir -p /tmp/rrsync-negative/root; \
    printf 'private-canary-marker\n' > /tmp/rrsync-negative/root/marker; \
    if env -i PATH=/usr/bin:/bin LC_ALL=C SSH_ORIGINAL_COMMAND=id /usr/bin/rrsync -ro /tmp/rrsync-negative/root > /tmp/rrsync-negative/output 2>&1; then exit 1; fi; \
    ! grep -Fq -- private-canary-marker /tmp/rrsync-negative/output; \
    rm -rf /var/lib/apt/lists/* /tmp/rsync-candidate.deb /tmp/rrsync-negative /tmp/starfiniti-gnupg /tmp/starfiniti-ppa.asc

LABEL com.starfiniti.disposable="true" \
      com.starfiniti.purpose="recovery-transport-canary"

CMD ["sleep", "infinity"]
