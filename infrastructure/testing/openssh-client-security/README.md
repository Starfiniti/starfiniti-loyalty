# OpenSSH recovery client security canary

This fixture builds only the upstream-signed OpenSSH Portable 10.5p1 `ssh`
client beside Debian's retained `/usr/bin/ssh`. It never builds or installs a
candidate daemon. A disposable client exercises the current and candidate
clients against the exact Ubuntu 24.04 OpenSSH package line used by the
database guest on a Docker-internal network with no published ports.

The `bootstrap` plan state permits one Linux build to discover the stripped
candidate executable digest. That run is not production or final compatibility
evidence. Lock the digest, change the plan to `candidate`, and rerun the exact
head before evidence can pass.

```sh
npm run openssh-client-security:validate
npm run openssh-client-security:run -- \
  --out dist/openssh-client-security/ci.json
```

Neither command has production credentials, routes, package authority, daemon
authority, or permission to alter a backup consumer.
