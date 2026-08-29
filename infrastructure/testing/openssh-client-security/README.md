# OpenSSH recovery client security canary

This fixture builds only the upstream-signed OpenSSH Portable 10.5p1 `ssh`
client beside Debian's retained `/usr/bin/ssh`. It never builds or installs a
candidate daemon. A disposable client exercises the current and candidate
clients against the exact Ubuntu 24.04 OpenSSH package line used by the
database guest on a Docker-internal network with no published ports.

Bootstrap Security run `33240398639` discovered stripped candidate executable
SHA-256 `be9dd9ee2550e3fca2a6fa15edb5ab9303e42ac783ac766928fa5380971bf081`.
The plan is now `candidate` and binds that digest. The bootstrap run is not
production or final compatibility evidence; a fresh exact-head run of this
digest-locked plan must pass before evidence can advance.

```sh
npm run openssh-client-security:validate
npm run openssh-client-security:run -- \
  --out dist/openssh-client-security/ci.json
```

Neither command has production credentials, routes, package authority, daemon
authority, or permission to alter a backup consumer.
