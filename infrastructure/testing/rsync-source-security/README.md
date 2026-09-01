# Side-by-side rsync source security canary

This disposable canary builds the exact signed rsync 3.5.0 source separately on
Debian 13 and Ubuntu 24.04, copies only the versioned candidate binaries into
runtime images, preserves the exact distribution rsync and native ACL library,
and exercises both current-host and candidate-host pulls from the candidate
guest on one internal Docker network.

Run the repository-only checks with:

```sh
npm run rsync-source-security:validate
```

Run the networked disposable canary only on an approved Docker host:

```sh
npm run rsync-source-security:run -- \
  --out dist/rsync-source-security/ci.json
```

The report is minimized and contains no route, credential, production path,
archive, customer, or tenant data. A pass does not authorize production
download, build, installation, selector changes, timer execution, or recovery.
Bootstrap discovers endpoint hashes, `locked` pins them while the second run is
pending, and only a fresh digest-locked pass may promote the plan to
`candidate`. Both reports remain separately hash-bound.
