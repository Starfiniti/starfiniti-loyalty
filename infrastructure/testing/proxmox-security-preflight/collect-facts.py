#!/usr/bin/env python3
"""Emit bounded, minimized, read-only Proxmox package preflight facts.

This program deliberately contains no endpoint, SSH, credential, package refresh,
download, install, repository-edit, service-control, or reboot capability. The
operator supplies it over an already approved session and captures stdout.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "starfiniti.proxmox-security-preflight-facts.v1"
ENDPOINT_ID = "proxmox-host"
MAXIMUM_DURATION_SECONDS = 90
MAXIMUM_COMMAND_OUTPUT_BYTES = 256 * 1024
MAXIMUM_TREE_FILES = 2_048
MAXIMUM_TREE_BYTES = 512 * 1024 * 1024

REPAIR_PACKAGES = (
    ("base-files", "13.8+deb13u5", "13.8+deb13u6", "amd64", "upgrade"),
    ("pve-qemu-kvm", "11.0.0-4", "11.0.3-3", "amd64", "upgrade"),
    ("libpve-storage-perl", "9.1.5", "9.1.9", "all", "upgrade"),
    ("qemu-server", "9.1.16", "9.2.7", "amd64", "upgrade"),
    ("pve-manager", "9.2.3", "9.2.11", "all", "upgrade"),
    ("libpve-common-perl", "9.1.16", "9.2.1", "all", "upgrade"),
    ("pve-container", "6.1.10", "6.1.13", "all", "upgrade"),
    ("pve-ha-manager", "5.2.4", "5.2.5", "amd64", "upgrade"),
    ("proxmox-mini-journalreader", "1.6", "1.7", "amd64", "upgrade"),
    ("proxmox-widget-toolkit", "5.2.3", "5.2.8", "all", "upgrade"),
    (
        "proxmox-kernel-7.0.14-14-pve-signed",
        None,
        "7.0.14-14",
        "amd64",
        "install",
    ),
    ("proxmox-kernel-7.0", "7.0.6-2", "7.0.14-14", "amd64", "upgrade"),
)

RETAINED_PACKAGES = (
    ("rsync", "3.4.1+ds1-5+deb13u3", "amd64"),
    ("borgbackup", "1.4.0-5", "amd64"),
    ("openssh-client", "1:10.0p1-7+deb13u4", "amd64"),
    ("openssh-server", "1:10.0p1-7+deb13u4", "amd64"),
)

RUNNING_KERNEL = "7.0.6-2-pve"
RUNNING_KERNEL_PACKAGE = (
    "proxmox-kernel-7.0.6-2-pve-signed",
    "7.0.6-2",
    "amd64",
)

APT_INDEXES = (
    (
        "debian-trixie",
        "be70297f6ea499e8ef0bd93906719298c795bc3dc4ce72560f13e6c9836bfedb",
    ),
    (
        "proxmox-trixie-no-subscription",
        "e3675a92287d0a77e15f1ca512fa95ca56564624eff7d4164f2bd91f3cd091c7",
    ),
)

SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9.+-]{0,99}$")
SAFE_VERSION = re.compile(r"^[0-9][0-9A-Za-z.+:~_-]{0,99}$")
INST_LINE = re.compile(
    r"^Inst (?P<id>\S+)(?: \[(?P<from>[^\]]+)\])? "
    r"\((?P<to>\S+) .+ \[(?P<arch>[^\]]+)\]\)(?: \[\])?$"
)
CONF_LINE = re.compile(
    r"^Conf (?P<id>\S+) \((?P<version>\S+) .+ \[(?P<arch>[^\]]+)\]\)$"
)
REMV_LINE = re.compile(r"^Remv (?P<id>\S+)(?: \[(?P<version>[^\]]+)\])?.*$")
SUMMARY_LINE = re.compile(
    r"^(?P<upgrades>\d+) upgraded, (?P<installs>\d+) newly installed, "
    r"(?P<removals>\d+) to remove and (?P<kept>\d+) not upgraded\.$"
)


class PreflightError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise PreflightError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def run_command(argv: list[str], timeout_seconds: int = 30) -> bytes:
    if not argv or any(not isinstance(item, str) or not item for item in argv):
        fail("command arguments are invalid")
    completed = subprocess.run(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
        check=False,
        timeout=timeout_seconds,
    )
    output = completed.stdout
    if len(output) > MAXIMUM_COMMAND_OUTPUT_BYTES:
        fail(f"{argv[0]} output exceeds the bound")
    if completed.returncode != 0:
        fail(f"{argv[0]} exited {completed.returncode}")
    return output


def verify_program(path: str, program_id: str | None = None) -> dict[str, str]:
    requested = Path(path)
    resolved = requested.resolve(strict=True)
    if resolved != requested:
        fail(f"{path} is not canonical")
    metadata = resolved.stat(follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode):
        fail(f"{path} is not a regular file")
    if metadata.st_uid != 0 or metadata.st_mode & 0o022:
        fail(f"{path} ownership or write permissions are unsafe")
    return {
        "id": program_id if program_id is not None else requested.name,
        "sha256": stable_file_digest(resolved),
    }


def stable_file_digest(path: Path) -> str:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NOATIME", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAXIMUM_TREE_BYTES:
            fail(f"{path} is not a bounded regular file")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (
            before.st_dev != after.st_dev
            or before.st_ino != after.st_ino
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
        ):
            fail(f"{path} changed while reading")
        return digest.hexdigest()
    finally:
        os.close(descriptor)


def tree_digest(root: str) -> dict[str, int | str]:
    root_path = Path(root).resolve(strict=True)
    root_metadata = root_path.stat(follow_symlinks=False)
    if not stat.S_ISDIR(root_metadata.st_mode):
        fail(f"{root} is not a directory")
    entries: list[dict[str, int | str]] = []
    total_bytes = 0
    for directory, names, files in os.walk(root_path, followlinks=False):
        names.sort()
        files.sort()
        directory_path = Path(directory)
        for name in names:
            item = directory_path / name
            metadata = item.lstat()
            relative = item.relative_to(root_path).as_posix()
            if stat.S_ISLNK(metadata.st_mode):
                entries.append(
                    {"path": relative, "kind": "link", "target": os.readlink(item)}
                )
            elif stat.S_ISDIR(metadata.st_mode):
                entries.append({"path": relative, "kind": "directory"})
            else:
                fail(f"{item} has an unsupported type")
        for name in files:
            item = directory_path / name
            metadata = item.lstat()
            relative = item.relative_to(root_path).as_posix()
            if stat.S_ISLNK(metadata.st_mode):
                entries.append(
                    {"path": relative, "kind": "link", "target": os.readlink(item)}
                )
                continue
            if not stat.S_ISREG(metadata.st_mode):
                fail(f"{item} has an unsupported type")
            total_bytes += metadata.st_size
            if total_bytes > MAXIMUM_TREE_BYTES:
                fail(f"{root} exceeds the byte bound")
            entries.append(
                {
                    "path": relative,
                    "kind": "file",
                    "size": metadata.st_size,
                    "sha256": stable_file_digest(item),
                }
            )
            if len(entries) > MAXIMUM_TREE_FILES:
                fail(f"{root} exceeds the file bound")
    return {
        "sha256": sha256_bytes(canonical_json(entries)),
        "fileCount": sum(item["kind"] == "file" for item in entries),
        "bytes": total_bytes,
    }


def package_record(package_id: str) -> dict[str, str | None]:
    output = subprocess.run(
        [
            "/usr/bin/dpkg-query",
            "-W",
            "-f=${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Abbrev}\n",
            package_id,
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
        check=False,
        timeout=10,
    )
    if len(output.stdout) > 1_024:
        fail(f"{package_id} query exceeds the bound")
    if output.returncode != 0:
        return {
            "id": package_id,
            "version": None,
            "architecture": None,
            "status": "absent",
        }
    parts = output.stdout.decode("utf-8", "strict").rstrip("\n").split("\t")
    if len(parts) != 4 or parts[0] != package_id or parts[3] != "ii ":
        fail(f"{package_id} installed record differs")
    if not SAFE_VERSION.fullmatch(parts[1]) or parts[2] not in {"all", "amd64"}:
        fail(f"{package_id} metadata is invalid")
    return {
        "id": parts[0],
        "version": parts[1],
        "architecture": parts[2],
        "status": "installed",
    }


def selected_package_digest() -> str:
    output = run_command(["/usr/bin/dpkg", "--get-selections"], 20)
    return sha256_bytes(output)


def state_snapshot() -> dict[str, object]:
    return {
        "dpkgStatusSha256": stable_file_digest(Path("/var/lib/dpkg/status")),
        "dpkgUpdates": tree_digest("/var/lib/dpkg/updates"),
        "dpkgSelectionsSha256": selected_package_digest(),
        "aptState": tree_digest("/var/lib/apt"),
        "aptLists": tree_digest("/var/lib/apt/lists"),
        "aptCache": tree_digest("/var/cache/apt"),
        "aptArchives": tree_digest("/var/cache/apt/archives"),
        "aptConfiguration": tree_digest("/etc/apt"),
        "aptTrust": tree_digest("/usr/share/keyrings"),
    }


def index_facts() -> list[dict[str, str]]:
    output = run_command(
        [
            "/usr/bin/apt-get",
            "indextargets",
            "--format",
            "$(IDENTIFIER)|$(RELEASE)|$(COMPONENT)|$(ARCHITECTURE)|$(FILENAME)",
        ],
        20,
    ).decode("utf-8", "strict")
    candidates: list[str] = []
    for raw_line in output.splitlines():
        line = raw_line.strip()
        parts = line.split("|")
        if len(parts) != 5 or parts[0] != "Packages" or parts[3] != "amd64":
            continue
        path = Path(parts[4]).resolve(strict=True)
        if path.parent != Path("/var/lib/apt/lists"):
            fail("APT index path escapes the expected directory")
        candidates.append(stable_file_digest(path))
    facts = []
    for source_id, expected_digest in APT_INDEXES:
        if candidates.count(expected_digest) != 1:
            fail(f"{source_id} exact package index is not uniquely present")
        facts.append({"id": source_id, "packagesSha256": expected_digest})
    return facts


def relevant_holds(package_ids: set[str]) -> list[str]:
    output = run_command(["/usr/bin/apt-mark", "showhold"], 10).decode(
        "utf-8", "strict"
    )
    values = sorted(line.strip() for line in output.splitlines() if line.strip())
    if any(not SAFE_ID.fullmatch(value) for value in values):
        fail("held package identity is invalid")
    return [value for value in values if value in package_ids]


def parse_autoremovable(lines: list[str]) -> list[str]:
    start = None
    for index, line in enumerate(lines):
        if line == "The following package was automatically installed and is no longer required:":
            start = index + 1
            break
        if line == "The following packages were automatically installed and are no longer required:":
            start = index + 1
            break
    if start is None:
        return []
    values: list[str] = []
    for line in lines[start:]:
        if line.startswith("Use 'apt autoremove'"):
            break
        values.extend(line.split())
    if any(not SAFE_ID.fullmatch(value) for value in values):
        fail("automatic-removal package identity is invalid")
    return values


def simulation() -> dict[str, object]:
    selectors = [f"{item[0]}={item[2]}" for item in REPAIR_PACKAGES]
    argv = [
        "/usr/bin/unshare",
        "--net",
        "--",
        "/usr/bin/apt-get",
        "--simulate",
        "--no-remove",
        "install",
        *selectors,
    ]
    output = run_command(argv, 60)
    text = output.decode("utf-8", "strict")
    lines = text.splitlines()
    if any(
        line.startswith(("E:", "W:", "N:", "Get:", "Fetch:", "Hit:", "Ign:", "Err:"))
        for line in lines
    ):
        fail("APT simulation emitted an error, warning, or acquisition line")
    actions: list[dict[str, str | None]] = []
    configurations: list[dict[str, str]] = []
    removals: list[dict[str, str | None]] = []
    summary = None
    for line in lines:
        match = INST_LINE.fullmatch(line)
        if match:
            actions.append(
                {
                    "id": match.group("id"),
                    "fromVersion": match.group("from"),
                    "toVersion": match.group("to"),
                    "architecture": match.group("arch"),
                }
            )
            continue
        match = CONF_LINE.fullmatch(line)
        if match:
            configurations.append(
                {
                    "id": match.group("id"),
                    "version": match.group("version"),
                    "architecture": match.group("arch"),
                }
            )
            continue
        match = REMV_LINE.fullmatch(line)
        if match:
            removals.append(
                {"id": match.group("id"), "version": match.group("version")}
            )
            continue
        match = SUMMARY_LINE.fullmatch(line)
        if match:
            summary = {key: int(value) for key, value in match.groupdict().items()}
    if summary is None:
        fail("APT simulation summary is absent")
    return {
        "networkNamespace": "isolated-empty",
        "selectorsSha256": sha256_bytes(canonical_json(selectors)),
        "outputSha256": sha256_bytes(output),
        "actions": actions,
        "configurations": configurations,
        "removals": removals,
        "autoremovablePackages": parse_autoremovable(lines),
        "summary": summary,
    }


def main() -> None:
    started = time.monotonic()
    if os.geteuid() != 0:
        fail("effective UID must be root for authoritative simulation")
    if sys.flags.isolated != 1 or not sys.flags.safe_path:
        fail("Python isolated safe-path mode is required")
    if sys.argv != [sys.argv[0]]:
        fail("arguments are prohibited")
    tools = [verify_program(os.path.realpath(sys.executable), "python3")]
    tools.extend(
        verify_program(path)
        for path in (
            "/usr/bin/apt-get",
            "/usr/bin/apt-mark",
            "/usr/bin/dpkg",
            "/usr/bin/dpkg-query",
            "/usr/bin/unshare",
            "/usr/bin/pveversion",
        )
    )
    architecture = run_command(["/usr/bin/dpkg", "--print-architecture"], 10).decode(
        "ascii", "strict"
    ).strip()
    if architecture != "amd64":
        fail("host architecture differs")
    release = os.uname().release
    if release != RUNNING_KERNEL:
        fail("running kernel differs")
    pve_version = run_command(["/usr/bin/pveversion"], 10).decode(
        "ascii", "strict"
    ).strip()
    if not re.fullmatch(
        r"pve-manager/9\.2\.3/[0-9a-f]{16} \(running kernel: 7\.0\.6-2-pve\)",
        pve_version,
    ):
        fail("PVE version differs")

    expected_ids = {item[0] for item in REPAIR_PACKAGES}
    expected_ids.update(item[0] for item in RETAINED_PACKAGES)
    installed = [package_record(item[0]) for item in REPAIR_PACKAGES]
    retained = [package_record(item[0]) for item in RETAINED_PACKAGES]
    running_package = package_record(RUNNING_KERNEL_PACKAGE[0])
    before = state_snapshot()
    indexes = index_facts()
    holds = relevant_holds(expected_ids | {RUNNING_KERNEL_PACKAGE[0]})
    result = simulation()
    after = state_snapshot()
    if before != after:
        fail("package, APT, or repository state changed during simulation")
    elapsed_milliseconds = round((time.monotonic() - started) * 1_000)
    if elapsed_milliseconds > MAXIMUM_DURATION_SECONDS * 1_000:
        fail("preflight exceeded the duration bound")

    document = {
        "schema": SCHEMA,
        "observedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        ),
        "endpointId": ENDPOINT_ID,
        "architecture": architecture,
        "pveVersion": pve_version,
        "runningKernel": release,
        "runningKernelPackage": running_package,
        "tools": tools,
        "installedPackages": installed,
        "retainedBoundaryPackages": retained,
        "relevantHolds": holds,
        "aptIndexes": indexes,
        "simulation": result,
        "stateBefore": before,
        "stateAfter": after,
        "elapsedMilliseconds": elapsed_milliseconds,
    }
    encoded = json.dumps(document, sort_keys=True, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 64 * 1024:
        fail("fact document exceeds the output bound")
    sys.stdout.write(encoded + "\n")


if __name__ == "__main__":
    try:
        main()
    except (OSError, PreflightError, subprocess.SubprocessError, UnicodeError) as error:
        sys.stderr.write(f"Proxmox security preflight refused: {error}\n")
        raise SystemExit(1) from None
