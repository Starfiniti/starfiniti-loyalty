#!/usr/bin/env python3
"""Verify the exact rsync source archive and extracted tree without following links."""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import pathlib
import posixpath
import stat
import sys
import tarfile
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class Row:
    relative: str
    kind: str
    mode: int
    size: int
    content_hash: str
    link_target: str | None = None


def fail(message: str) -> None:
    raise SystemExit(f"rsync source verification failed: {message}")


def safe_relative(name: str, root: str) -> str | None:
    if "\\" in name or name.startswith("/") or "\x00" in name:
        fail("archive member has an unsafe name")
    normalized = name.rstrip("/")
    if normalized == root:
        return None
    prefix = f"{root}/"
    if not normalized.startswith(prefix):
        fail("archive member escapes the expected root")
    relative = normalized[len(prefix) :]
    if not relative or any(part in ("", ".", "..") for part in relative.split("/")):
        fail("archive member contains an unsafe component")
    return relative


def safe_link(relative: str, target: str, members: set[str]) -> str:
    if (
        not target
        or "\\" in target
        or "\x00" in target
        or target.startswith("/")
    ):
        fail("source symlink has an unsafe target")
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(relative), target))
    if resolved in ("", ".", "..") or resolved.startswith("../"):
        fail("source symlink escapes the expected root")
    if resolved not in members:
        fail("source symlink target is absent")
    return resolved


def digest_rows(rows: list[Row]) -> str:
    digest = hashlib.sha256()
    for row in sorted(
        rows,
        key=lambda item: (
            item.relative,
            item.kind,
            item.mode,
            item.size,
            item.content_hash,
        ),
    ):
        digest.update(
            f"{row.relative}\0{row.kind}\0{row.mode:o}\0{row.size}\0{row.content_hash}\n".encode()
        )
    return digest.hexdigest()


def archive_rows(path: pathlib.Path, root: str) -> list[Row]:
    rows: list[Row] = []
    seen: set[str] = set()
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        prepared: list[tuple[tarfile.TarInfo, str | None]] = []
        member_map: dict[str, tarfile.TarInfo] = {}
        root_count = 0
        for member in members:
            relative = safe_relative(member.name, root)
            if relative is None:
                root_count += 1
                if root_count != 1 or not member.isdir():
                    fail("archive root is not a directory")
                continue
            if relative in seen:
                fail("archive contains a duplicate member")
            seen.add(relative)
            member_map[relative] = member
            prepared.append((member, relative))
        if root_count != 1:
            fail("archive must contain exactly one root directory")
        symlinks = {
            relative for relative, member in member_map.items() if member.issym()
        }
        for relative in member_map:
            parts = relative.split("/")
            if any("/".join(parts[:index]) in symlinks for index in range(1, len(parts))):
                fail("archive member traverses a symbolic-link parent")
        relative_members = set(member_map)
        for member, relative in prepared:
            mode = stat.S_IMODE(member.mode)
            if member.isdir() or member.isfile():
                if mode & 0o7000 or mode & 0o002:
                    fail("archive member has unsafe permissions")
            if member.isdir():
                rows.append(Row(relative, "d", mode, 0, "-"))
            elif member.isfile():
                source = archive.extractfile(member)
                if source is None:
                    fail("regular file could not be read")
                content = source.read()
                if len(content) != member.size:
                    fail("regular file ended early")
                rows.append(
                    Row(
                        relative,
                        "f",
                        mode,
                        member.size,
                        hashlib.sha256(content).hexdigest(),
                    )
                )
            elif member.issym():
                resolved = safe_link(relative, member.linkname, relative_members)
                if member_map[resolved].issym():
                    fail("source symlink target must not be another symlink")
                encoded = member.linkname.encode("utf-8", "strict")
                rows.append(
                    Row(
                        relative,
                        "l",
                        mode,
                        len(encoded),
                        hashlib.sha256(encoded).hexdigest(),
                        member.linkname,
                    )
                )
            else:
                fail("archive contains a hard link or special member")
    return rows


def tree_rows(path: pathlib.Path) -> list[Row]:
    rows: list[Row] = []
    if path.is_symlink() or not path.is_dir():
        fail("extracted root must be a real directory")
    children = sorted(path.rglob("*"))
    members = {child.relative_to(path).as_posix() for child in children}
    for child in children:
        relative = child.relative_to(path).as_posix()
        status = child.lstat()
        mode = stat.S_IMODE(status.st_mode)
        if stat.S_ISDIR(status.st_mode) or stat.S_ISREG(status.st_mode):
            if mode & 0o7000 or mode & 0o002:
                fail("extracted tree contains unsafe permissions")
        if stat.S_ISDIR(status.st_mode):
            rows.append(Row(relative, "d", mode, 0, "-"))
        elif stat.S_ISREG(status.st_mode):
            content_hash = hashlib.sha256(child.read_bytes()).hexdigest()
            rows.append(Row(relative, "f", mode, status.st_size, content_hash))
        elif stat.S_ISLNK(status.st_mode):
            target = os.readlink(child)
            safe_link(relative, target, members)
            encoded = target.encode("utf-8", "strict")
            rows.append(
                Row(
                    relative,
                    "l",
                    mode,
                    len(encoded),
                    hashlib.sha256(encoded).hexdigest(),
                    target,
                )
            )
        else:
            fail("extracted tree contains a special file")
    return rows


def write_test_archive(
    path: pathlib.Path, members: list[tuple[str, str, str | None]]
) -> None:
    with tarfile.open(path, "w:gz") as archive:
        for name, kind, target in members:
            member = tarfile.TarInfo(name)
            member.mode = 0o755 if kind in {"directory", "symlink"} else 0o644
            if kind == "directory":
                member.type = tarfile.DIRTYPE
                archive.addfile(member)
            elif kind == "file":
                payload = b"starfiniti-rsync-source-test\n"
                member.size = len(payload)
                archive.addfile(member, io.BytesIO(payload))
            elif kind == "symlink":
                member.type = tarfile.SYMTYPE
                member.linkname = target or ""
                archive.addfile(member)
            elif kind == "hardlink":
                member.type = tarfile.LNKTYPE
                member.linkname = target or ""
                archive.addfile(member)
            else:
                raise AssertionError("unknown test member kind")


def expect_failure(callback) -> None:
    try:
        callback()
    except SystemExit:
        return
    raise AssertionError("unsafe archive passed the source verifier")


def self_test() -> None:
    root = "rsync-test"
    valid = [
        (root, "directory", None),
        (f"{root}/directory", "directory", None),
        (f"{root}/directory/file", "file", None),
        (f"{root}/link", "symlink", "directory/file"),
    ]
    cases = {
        "valid": valid,
        "traversal": [(root, "directory", None), (f"{root}/../escape", "file", None)],
        "duplicate": [
            (root, "directory", None),
            (f"{root}/file", "file", None),
            (f"{root}/file", "file", None),
        ],
        "duplicate-root": [
            (root, "directory", None),
            (root, "directory", None),
            (f"{root}/file", "file", None),
        ],
        "missing-root": [(f"{root}/file", "file", None)],
        "escaping-link": [
            (root, "directory", None),
            (f"{root}/link", "symlink", "../../escape"),
        ],
        "absent-link": [
            (root, "directory", None),
            (f"{root}/link", "symlink", "absent"),
        ],
        "hardlink": [
            (root, "directory", None),
            (f"{root}/file", "file", None),
            (f"{root}/hard", "hardlink", "file"),
        ],
        "symlink-parent": [
            (root, "directory", None),
            (f"{root}/directory", "directory", None),
            (f"{root}/directory/file", "file", None),
            (f"{root}/link", "symlink", "directory"),
            (f"{root}/link/escape", "file", None),
        ],
        "absolute": [("/rsync-test/file", "file", None)],
    }
    with tempfile.TemporaryDirectory(prefix="starfiniti-rsync-source-") as raw:
        directory = pathlib.Path(raw)
        archives: dict[str, pathlib.Path] = {}
        for name, members in cases.items():
            archive = directory / f"{name}.tar.gz"
            write_test_archive(archive, members)
            archives[name] = archive
        rows = archive_rows(archives["valid"], root)
        if len(rows) != 3 or len(digest_rows(rows)) != 64:
            raise AssertionError("valid source verifier fixture differs")
        for name in (
            "traversal",
            "duplicate",
            "duplicate-root",
            "missing-root",
            "escaping-link",
            "absent-link",
            "hardlink",
            "symlink-parent",
            "absolute",
        ):
            expect_failure(lambda path=archives[name]: archive_rows(path, root))


def main() -> None:
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("rsync source verifier self-test passed.")
        return
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--archive", type=pathlib.Path)
    mode.add_argument("--tree", type=pathlib.Path)
    parser.add_argument("--root", required=True)
    parser.add_argument("--entries", type=int, required=True)
    parser.add_argument("--files", type=int, required=True)
    parser.add_argument("--links", type=int, required=True)
    parser.add_argument("--bytes", type=int, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    arguments = parser.parse_args()
    rows = (
        archive_rows(arguments.archive, arguments.root)
        if arguments.archive
        else tree_rows(arguments.tree)
    )
    files = [row for row in rows if row.kind == "f"]
    links = [row for row in rows if row.kind == "l"]
    if len(rows) != arguments.entries:
        fail("entry count differs")
    if len(files) != arguments.files:
        fail("file count differs")
    if len(links) != arguments.links:
        fail("symbolic-link count differs")
    if sum(row.size for row in files) != arguments.bytes:
        fail("regular-file byte count differs")
    if digest_rows(rows) != arguments.manifest_sha256:
        fail("manifest digest differs")


if __name__ == "__main__":
    main()
