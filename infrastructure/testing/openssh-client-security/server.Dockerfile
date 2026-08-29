ARG BASE_IMAGE=ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517
FROM ${BASE_IMAGE}

ARG EXPECTED_ARCHITECTURE=amd64
ARG PACKAGE_VERSION=1:9.6p1-3ubuntu13.18
ARG CLIENT_URL=https://security.ubuntu.com/ubuntu/pool/main/o/openssh/openssh-client_9.6p1-3ubuntu13.18_amd64.deb
ARG CLIENT_SHA256=900ee53c747920694bd508e598702aa794911a7c8273e66f292fe45144a00a9f
ARG SERVER_URL=https://security.ubuntu.com/ubuntu/pool/main/o/openssh/openssh-server_9.6p1-3ubuntu13.18_amd64.deb
ARG SERVER_SHA256=81a6c622a2b566a95f1939f25776e0ec05b6b40c2fa61f7cd9f148bca4344208
ARG SFTP_URL=https://security.ubuntu.com/ubuntu/pool/main/o/openssh/openssh-sftp-server_9.6p1-3ubuntu13.18_amd64.deb
ARG SFTP_SHA256=2287e3e9e3d0ace278173ca218d32d41a24b87afec3b42ef7dabfda4d9125edd
ARG SERVER_EXECUTABLE_SHA256=02580eb1cc489f0359e3008b62c8dee14183b9252c81bf638ed4d911fe624ae2

SHELL ["/bin/sh", "-euxc"]

RUN test "$(dpkg --print-architecture)" = "$EXPECTED_ARCHITECTURE"; \
    . /etc/os-release; test "$ID" = ubuntu; test "$VERSION_ID" = 24.04; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends ca-certificates curl openssh-client="$PACKAGE_VERSION" openssh-server="$PACKAGE_VERSION" openssh-sftp-server="$PACKAGE_VERSION"; \
    mkdir -m 0700 /tmp/starfiniti-openssh-server-packages; \
    cd /tmp/starfiniti-openssh-server-packages; \
    for package in openssh-client openssh-server openssh-sftp-server; do apt-get download "$package=$PACKAGE_VERSION"; done; \
    set -- openssh-client_*.deb; test "$#" -eq 1; mv "$1" client-metadata.deb; \
    set -- openssh-server_*.deb; test "$#" -eq 1; mv "$1" server-metadata.deb; \
    set -- openssh-sftp-server_*.deb; test "$#" -eq 1; mv "$1" sftp-metadata.deb; \
    curl --fail --location --proto '=https' --tlsv1.2 --output client-url.deb "$CLIENT_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output server-url.deb "$SERVER_URL"; \
    curl --fail --location --proto '=https' --tlsv1.2 --output sftp-url.deb "$SFTP_URL"; \
    printf '%s  %s\n' "$CLIENT_SHA256" client-metadata.deb "$CLIENT_SHA256" client-url.deb "$SERVER_SHA256" server-metadata.deb "$SERVER_SHA256" server-url.deb "$SFTP_SHA256" sftp-metadata.deb "$SFTP_SHA256" sftp-url.deb | sha256sum --check --strict; \
    cmp client-metadata.deb client-url.deb; cmp server-metadata.deb server-url.deb; cmp sftp-metadata.deb sftp-url.deb; \
    for pair in 'client openssh-client' 'server openssh-server' 'sftp openssh-sftp-server'; do set -- $pair; test "$(dpkg-deb --field "$1-metadata.deb" Package)" = "$2"; test "$(dpkg-deb --field "$1-metadata.deb" Version)" = "$PACKAGE_VERSION"; test "$(dpkg-deb --field "$1-metadata.deb" Architecture)" = "$EXPECTED_ARCHITECTURE"; done; \
    printf '%s  %s\n' "$SERVER_EXECUTABLE_SHA256" /usr/sbin/sshd | sha256sum --check --strict; \
    /usr/sbin/sshd -V 2>&1 | grep -Eq '^OpenSSH_9\.6p1([,[:space:]]|$)'; \
    useradd --uid 65532 --user-group --home-dir /nonexistent --shell /bin/sh starfiniti; \
    passwd -d starfiniti; \
    rm -rf /tmp/starfiniti-openssh-server-packages /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

COPY --chmod=0555 server-entrypoint.sh /usr/local/bin/starfiniti-openssh-server
COPY --chmod=0555 forced-command.sh /usr/local/bin/starfiniti-openssh-forced-command

LABEL com.starfiniti.disposable="true" \
      com.starfiniti.purpose="openssh-client-security-server"

EXPOSE 2222

USER 65532:65532

HEALTHCHECK --interval=5s --timeout=2s --start-period=2s --retries=3 \
    CMD ["/usr/bin/test", "-r", "/state/ready"]

ENTRYPOINT ["/usr/local/bin/starfiniti-openssh-server"]
