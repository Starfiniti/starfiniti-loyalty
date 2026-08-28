#!/usr/bin/env python3
"""Verify the exact Proxmox candidate without installing or retaining it."""

from __future__ import annotations

import csv
import hashlib
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from urllib.parse import unquote


MANIFEST = Path("/workspace/manifest.tsv")
FACTS = Path("/output/facts.tsv")
WORK_ROOT = Path("/tmp/starfiniti-proxmox-package-canary")
APT_LISTS = Path("/var/lib/apt/lists")
APT_ARCHIVES = Path("/var/cache/apt/archives")
DEBIAN_KEYRING = Path("/usr/share/keyrings/debian-archive-keyring.gpg")
PROXMOX_KEYRING = Path("/usr/share/keyrings/starfiniti-proxmox-archive.gpg")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
FINGERPRINT = re.compile(r"^[0-9A-F]{40}$")
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9.-]{0,79}$")
SAFE_VERSION = re.compile(r"^[0-9][0-9A-Za-z.+:~_-]{0,79}$")
SAFE_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+/-]{1,239}$")


def fail(message: str) -> None:
    raise RuntimeError(f"Proxmox package canary failed: {message}")


def run(
    arguments: list[str],
    *,
    capture: bool = True,
    cwd: Path | None = None,
    timeout: int = 300,
    stdout_file=None,
) -> str:
    if not arguments or any("\x00" in argument for argument in arguments):
        fail("invalid process argument")
    result = subprocess.run(
        arguments,
        cwd=cwd,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=stdout_file if stdout_file is not None else (
            subprocess.PIPE if capture else None
        ),
        stderr=subprocess.PIPE,
        text=stdout_file is None,
        timeout=timeout,
        env={
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "DEBIAN_FRONTEND": "noninteractive",
        },
    )
    if result.returncode != 0:
        stderr = result.stderr if isinstance(result.stderr, str) else ""
        fail(f"command {arguments[0]} failed: {stderr[-1000:].strip()}")
    if stdout_file is not None or not capture:
        return ""
    return (result.stdout or "").strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def bounded_regular(path: Path, maximum: int, label: str) -> None:
    before = path.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_size < 2
        or before.st_size > maximum
    ):
        fail(f"{label} is not a bounded regular file")


def trusted_root_file(path: Path, maximum: int, label: str) -> None:
    """Require an immutable-enough package-managed trust input for this run."""
    bounded_regular(path, maximum, label)
    metadata = path.lstat()
    if (
        metadata.st_uid != 0
        or metadata.st_gid != 0
        or metadata.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
    ):
        fail(f"{label} ownership or permissions differ")


def read_manifest() -> tuple[dict[str, str], list[dict[str, str]], list[dict[str, str]]]:
    bounded_regular(MANIFEST, 128 * 1024, "manifest")
    before = MANIFEST.stat()
    rows: list[list[str]] = []
    with MANIFEST.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.reader(handle, delimiter="\t"):
            if not row or any("\n" in field or "\r" in field for field in row):
                fail("manifest contains an invalid row")
            rows.append(row)
    after = MANIFEST.stat()
    if (
        before.st_dev != after.st_dev
        or before.st_ino != after.st_ino
        or before.st_size != after.st_size
        or before.st_mtime_ns != after.st_mtime_ns
    ):
        fail("manifest changed while reading")
    if len(rows) != 18 or rows[0][0] != "plan":
        fail("manifest row count or plan identity differs")
    plan_row = rows[0]
    if len(plan_row) != 8:
        fail("manifest plan row shape differs")
    plan = {
        "schema": plan_row[1],
        "candidateProvenance": plan_row[2],
        "keyUrl": plan_row[3],
        "keySha256": plan_row[4],
        "keyFingerprint": plan_row[5],
        "packageBytes": plan_row[6],
        "architecture": plan_row[7],
    }
    if (
        plan["schema"] != "starfiniti.proxmox-security-package-canary-manifest.v1"
        or not DIGEST.fullmatch(plan["candidateProvenance"])
        or plan["keyUrl"]
        != "https://enterprise.proxmox.com/debian/proxmox-archive-keyring-trixie.gpg"
        or not DIGEST.fullmatch(plan["keySha256"])
        or not FINGERPRINT.fullmatch(plan["keyFingerprint"])
        or plan["packageBytes"] != "165341024"
        or plan["architecture"] != "amd64"
    ):
        fail("manifest plan boundary differs")

    repositories: list[dict[str, str]] = []
    packages: list[dict[str, str]] = []
    for row in rows[1:]:
        if row[0] == "repository":
            if len(row) != 11:
                fail("repository row shape differs")
            item = dict(
                zip(
                    [
                        "kind",
                        "id",
                        "repositoryUri",
                        "suite",
                        "component",
                        "inReleaseUrl",
                        "keyring",
                        "listToken",
                        "observationInReleaseSha256",
                        "observationPackagesSha256",
                        "architecture",
                    ],
                    row,
                    strict=True,
                )
            )
            if (
                not SAFE_ID.fullmatch(item["id"])
                or item["keyring"] not in {"debian", "proxmox"}
                or item["architecture"] != "amd64"
                or not SAFE_PATH.fullmatch(item["listToken"])
                or not DIGEST.fullmatch(item["observationInReleaseSha256"])
                or not DIGEST.fullmatch(item["observationPackagesSha256"])
            ):
                fail(f"{item['id']} repository row is invalid")
            repositories.append(item)
        elif row[0] == "package":
            if len(row) != 9:
                fail("package row shape differs")
            item = dict(
                zip(
                    [
                        "kind",
                        "id",
                        "sourceId",
                        "version",
                        "architecture",
                        "filename",
                        "size",
                        "sha256",
                        "action",
                    ],
                    row,
                    strict=True,
                )
            )
            if (
                not SAFE_ID.fullmatch(item["id"])
                or not SAFE_ID.fullmatch(item["sourceId"])
                or not SAFE_VERSION.fullmatch(item["version"])
                or item["architecture"] not in {"all", "amd64"}
                or not SAFE_PATH.fullmatch(item["filename"])
                or item["filename"].startswith("/")
                or ".." in item["filename"].split("/")
                or not item["size"].isdigit()
                or int(item["size"]) < 1
                or int(item["size"]) > 192 * 1024 * 1024
                or not DIGEST.fullmatch(item["sha256"])
                or item["action"] not in {"install", "upgrade"}
            ):
                fail(f"{item['id']} package row is invalid")
            packages.append(item)
        else:
            fail("manifest row identity differs")
    if len(repositories) != 5 or len(packages) != 12:
        fail("manifest repository or package count differs")
    if sum(int(item["size"]) for item in packages) != int(plan["packageBytes"]):
        fail("manifest package byte total differs")
    repository_ids = {item["id"] for item in repositories}
    if len(repository_ids) != 5 or any(
        item["sourceId"] not in repository_ids for item in packages
    ):
        fail("manifest repository package binding differs")
    return plan, repositories, packages


def configure_repositories(
    plan: dict[str, str], repositories: list[dict[str, str]]
) -> None:
    trusted_root_file(DEBIAN_KEYRING, 4 * 1024 * 1024, "Debian archive keyring")
    run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--connect-timeout",
            "20",
            "--max-time",
            "120",
            "--retry",
            "3",
            "--retry-all-errors",
            "--output",
            str(PROXMOX_KEYRING),
            plan["keyUrl"],
        ],
        timeout=180,
    )
    if sha256_file(PROXMOX_KEYRING) != plan["keySha256"]:
        fail("Proxmox archive keyring digest differs")
    trusted_root_file(PROXMOX_KEYRING, 4 * 1024 * 1024, "Proxmox archive keyring")
    key_output = run(
        [
            "gpg",
            "--batch",
            "--with-colons",
            "--show-keys",
            "--fingerprint",
            str(PROXMOX_KEYRING),
        ]
    )
    key_fingerprints = {
        fields[9]
        for line in key_output.splitlines()
        if (fields := line.split(":"))[0] == "fpr" and len(fields) > 9
    }
    if plan["keyFingerprint"] not in key_fingerprints:
        fail("Proxmox release fingerprint is absent from the pinned keyring")

    source_directory = Path("/etc/apt/sources.list.d")
    for path in source_directory.glob("*"):
        if path.is_symlink() or not path.is_file():
            fail("unexpected APT source entry type")
        path.unlink()
    legacy_sources = Path("/etc/apt/sources.list")
    if legacy_sources.exists():
        if legacy_sources.is_symlink() or not legacy_sources.is_file():
            fail("unexpected legacy APT source type")
        legacy_sources.unlink()
    stanzas: list[str] = []
    for repository in repositories:
        keyring = (
            DEBIAN_KEYRING
            if repository["keyring"] == "debian"
            else PROXMOX_KEYRING
        )
        stanzas.append(
            "\n".join(
                [
                    "Types: deb",
                    f"URIs: {repository['repositoryUri']}",
                    f"Suites: {repository['suite']}",
                    f"Components: {repository['component']}",
                    "Architectures: amd64",
                    f"Signed-By: {keyring}",
                ]
            )
        )
    source_file = source_directory / "starfiniti-proxmox-canary.sources"
    source_file.write_text("\n\n".join(stanzas) + "\n", encoding="utf-8")
    source_file.chmod(0o644)
    run(
        [
            "apt-get",
            "-o",
            "Acquire::AllowInsecureRepositories=false",
            "-o",
            "Acquire::AllowDowngradeToInsecureRepositories=false",
            "update",
        ],
        capture=False,
        timeout=300,
    )


def signed_index_entry(release_path: Path, target: str) -> tuple[str, int]:
    in_sha256 = False
    with release_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if line == "SHA256:":
                in_sha256 = True
                continue
            if in_sha256 and line and not line.startswith(" "):
                break
            if not in_sha256:
                continue
            fields = line.split()
            if len(fields) == 3 and fields[2] == target:
                if not DIGEST.fullmatch(fields[0]) or not fields[1].isdigit():
                    fail(f"signed index entry for {target} is invalid")
                return fields[0], int(fields[1])
    fail(f"signed index entry for {target} is absent")


def verify_repositories(
    plan: dict[str, str], repositories: list[dict[str, str]], writer: csv.writer
) -> None:
    for repository in repositories:
        repository_work = WORK_ROOT / repository["id"]
        repository_work.mkdir(mode=0o700)
        in_release = repository_work / "InRelease"
        release = repository_work / "Release"
        status_path = repository_work / "gpg-status"
        scheme = "=https" if repository["inReleaseUrl"].startswith("https://") else "=http"
        curl_arguments = [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--proto",
            scheme,
        ]
        if scheme == "=https":
            curl_arguments.extend(["--tlsv1.2"])
        curl_arguments.extend(
            [
                "--connect-timeout",
                "20",
                "--max-time",
                "120",
                "--retry",
                "3",
                "--retry-all-errors",
                "--output",
                str(in_release),
                repository["inReleaseUrl"],
            ]
        )
        run(curl_arguments, timeout=180)
        current_in_release = sha256_file(in_release)
        keyring = (
            DEBIAN_KEYRING
            if repository["keyring"] == "debian"
            else PROXMOX_KEYRING
        )
        status_output = run(
            [
                "gpgv",
                "--status-fd",
                "1",
                "--keyring",
                str(keyring),
                "--output",
                str(release),
                str(in_release),
            ]
        )
        status_path.write_text(status_output + "\n", encoding="utf-8")
        valid_signatures: list[list[str]] = []
        for line in status_output.splitlines():
            fields = line.split()
            if len(fields) >= 3 and fields[:2] == ["[GNUPG:]", "VALIDSIG"]:
                if not FINGERPRINT.fullmatch(fields[2]):
                    fail(f"{repository['id']} signature fingerprint is invalid")
                valid_signatures.append(fields)
        if not valid_signatures:
            fail(f"{repository['id']} has no valid repository signature")
        if repository["keyring"] == "proxmox" and not any(
            plan["keyFingerprint"] in signature[2:] for signature in valid_signatures
        ):
            fail("Proxmox InRelease did not validate to the pinned release key")

        index_matches = list(APT_LISTS.glob(f"{repository['listToken']}*"))
        if len(index_matches) != 1 or not index_matches[0].is_file():
            fail(f"{repository['id']} local package index identity differs")
        unpacked_index = repository_work / "Packages"
        with unpacked_index.open("wb") as output:
            run(
                [
                    "/usr/lib/apt/apt-helper",
                    "cat-file",
                    str(index_matches[0]),
                ],
                stdout_file=output,
                timeout=180,
            )
        current_packages = sha256_file(unpacked_index)
        target = f"{repository['component']}/binary-amd64/Packages"
        signed_sha256, signed_size = signed_index_entry(release, target)
        if (
            current_packages != signed_sha256
            or unpacked_index.stat().st_size != signed_size
        ):
            fail(f"{repository['id']} package index differs from signed Release")
        signers = ",".join(sorted({signature[2] for signature in valid_signatures}))
        writer.writerow(
            [
                "repository",
                repository["id"],
                current_in_release,
                current_packages,
                signers,
                "true",
                "true",
                str(
                    current_in_release
                    == repository["observationInReleaseSha256"]
                ).lower(),
                str(
                    current_packages == repository["observationPackagesSha256"]
                ).lower(),
            ]
        )
        shutil.rmtree(repository_work)


def apt_uri(selector: str) -> tuple[str, str, int, str]:
    output = run(["apt-get", "--quiet=2", "--print-uris", "download", selector])
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if len(lines) != 1:
        fail(f"APT selector {selector} returned an unexpected URI count")
    matched = re.fullmatch(
        r"'([^']+)'\s+(\S+)\s+(\d+)\s+SHA256:([0-9a-f]{64})", lines[0]
    )
    if not matched:
        fail(f"APT selector {selector} returned an invalid URI record")
    return matched.group(1), matched.group(2), int(matched.group(3)), matched.group(4)


def verify_packages(
    repositories: list[dict[str, str]],
    packages: list[dict[str, str]],
    writer: csv.writer,
) -> tuple[str, str]:
    repository_map = {item["id"]: item for item in repositories}
    run(["apt-get", "clean"], capture=False)
    status_path = Path("/var/lib/dpkg/status")
    status_before = sha256_file(status_path)
    for package in packages:
        package_work = WORK_ROOT / f"package-{package['id']}"
        package_work.mkdir(mode=0o700)
        try:
            selector = f"{package['id']}={package['version']}"
            uri, local_name, size, digest = apt_uri(selector)
            repository = repository_map[package["sourceId"]]
            expected_uri = f"{repository['repositoryUri'].rstrip('/')}/{package['filename']}"
            if (
                unquote(uri) != expected_uri
                or Path(unquote(local_name)).name != Path(package["filename"]).name
                or size != int(package["size"])
                or digest != package["sha256"]
            ):
                fail(f"{package['id']} APT signed-metadata selection differs")

            run(
                ["apt-get", "--quiet=2", "download", selector],
                cwd=package_work,
                timeout=300,
            )
            apt_files = list(package_work.glob("*.deb"))
            if len(apt_files) != 1 or apt_files[0].is_symlink():
                fail(f"{package['id']} APT download identity differs")
            apt_file = apt_files[0]
            exact_file = package_work / "exact-url.deb"
            scheme = "=https" if expected_uri.startswith("https://") else "=http"
            curl_arguments = [
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--proto",
                scheme,
            ]
            if scheme == "=https":
                curl_arguments.extend(["--tlsv1.2"])
            curl_arguments.extend(
                [
                    "--connect-timeout",
                    "20",
                    "--max-time",
                    "300",
                    "--retry",
                    "3",
                    "--retry-all-errors",
                    "--output",
                    str(exact_file),
                    expected_uri,
                ]
            )
            run(curl_arguments, timeout=360)
            for path in [apt_file, exact_file]:
                if (
                    path.stat().st_size != int(package["size"])
                    or sha256_file(path) != package["sha256"]
                ):
                    fail(f"{package['id']} package bytes differ")
            run(["cmp", "--silent", str(apt_file), str(exact_file)])
            fields = {
                field: run(["dpkg-deb", "--field", str(apt_file), field])
                for field in ["Package", "Version", "Architecture"]
            }
            if (
                fields["Package"] != package["id"]
                or fields["Version"] != package["version"]
                or fields["Architecture"] != package["architecture"]
            ):
                fail(f"{package['id']} package control fields differ")
            writer.writerow(
                [
                    "package",
                    package["id"],
                    package["version"],
                    package["architecture"],
                    package["size"],
                    package["sha256"],
                    "true",
                    "true",
                    "true",
                    "false",
                ]
            )
        finally:
            if package_work.exists():
                shutil.rmtree(package_work)
    status_after = sha256_file(status_path)
    if status_after != status_before:
        fail("dpkg status changed during candidate package verification")
    return status_before, status_after


def assert_no_package_bytes() -> None:
    for root in [WORK_ROOT, APT_ARCHIVES, Path("/output")]:
        if root.exists() and any(root.rglob("*.deb")):
            fail(f"package bytes remain under {root}")


def main() -> None:
    if os.geteuid() != 0:
        fail("container verifier must run as disposable root")
    os_release = Path("/etc/os-release").read_text(encoding="utf-8")
    if '\nID=debian\n' not in f"\n{os_release}" or '\nVERSION_ID="13"\n' not in f"\n{os_release}":
        fail("container OS identity differs")
    if run(["dpkg", "--print-architecture"]) != "amd64":
        fail("container architecture differs")
    if FACTS.exists() or FACTS.is_symlink():
        fail("facts output must be exclusive")
    if WORK_ROOT.exists():
        fail("work root must be exclusive")
    WORK_ROOT.mkdir(mode=0o700)
    plan, repositories, packages = read_manifest()
    temporary_facts = WORK_ROOT / "facts.tsv"
    try:
        configure_repositories(plan, repositories)
        descriptor = os.open(
            temporary_facts,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            verify_repositories(plan, repositories, writer)
            status_before, status_after = verify_packages(
                repositories, packages, writer
            )
            assert_no_package_bytes()
            writer.writerow(
                [
                    "summary",
                    "starfiniti.proxmox-security-package-canary-facts.v1",
                    sha256_file(DEBIAN_KEYRING),
                    plan["keySha256"],
                    plan["keyFingerprint"],
                    str(len(repositories)),
                    str(len(packages)),
                    plan["packageBytes"],
                    status_before,
                    status_after,
                    "false",
                    "false",
                ]
            )
            handle.flush()
            os.fsync(handle.fileno())
        bounded_regular(temporary_facts, 128 * 1024, "temporary facts")
        os.replace(temporary_facts, FACTS)
        FACTS.chmod(0o644)
    finally:
        if temporary_facts.exists():
            temporary_facts.unlink()
        if WORK_ROOT.exists():
            shutil.rmtree(WORK_ROOT)
    bounded_regular(FACTS, 128 * 1024, "facts")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - fail closed at the process boundary.
        print(str(error), file=sys.stderr)
        sys.exit(1)
