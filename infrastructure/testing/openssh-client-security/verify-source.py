#!/usr/bin/env python3
import argparse
import hashlib
import io
import pathlib
import stat
import sys
import tarfile
import tempfile


def fail(message: str) -> None:
    raise SystemExit(f"OpenSSH source verification failed: {message}")


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


def digest_rows(rows: list[tuple[str, str, int, int, str]]) -> str:
    digest = hashlib.sha256()
    for relative, kind, mode, size, content_hash in sorted(rows):
        digest.update(
            f"{relative}\0{kind}\0{mode:o}\0{size}\0{content_hash}\n".encode()
        )
    return digest.hexdigest()


def archive_rows(path: pathlib.Path, root: str):
    rows = []
    seen = set()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive.getmembers():
            relative = safe_relative(member.name, root)
            if relative is None:
                if not member.isdir():
                    fail("archive root is not a directory")
                continue
            if relative in seen:
                fail("archive contains a duplicate member")
            seen.add(relative)
            if member.isdir():
                rows.append((relative, "d", member.mode, 0, "-"))
            elif member.isfile():
                source = archive.extractfile(member)
                if source is None:
                    fail("regular file could not be read")
                content_hash = hashlib.sha256(source.read()).hexdigest()
                rows.append((relative, "f", member.mode, member.size, content_hash))
            else:
                fail("archive contains a link or special member")
    return rows


def tree_rows(path: pathlib.Path):
    rows = []
    if path.is_symlink() or not path.is_dir():
        fail("extracted root must be a real directory")
    for child in sorted(path.rglob("*")):
        relative = child.relative_to(path).as_posix()
        status = child.lstat()
        if stat.S_ISLNK(status.st_mode):
            fail("extracted tree contains a symbolic link")
        mode = stat.S_IMODE(status.st_mode)
        if stat.S_ISDIR(status.st_mode):
            rows.append((relative, "d", mode, 0, "-"))
        elif stat.S_ISREG(status.st_mode):
            content_hash = hashlib.sha256(child.read_bytes()).hexdigest()
            rows.append((relative, "f", mode, status.st_size, content_hash))
        else:
            fail("extracted tree contains a special file")
    return rows


def write_test_archive(path: pathlib.Path, members: list[tuple[str, str]]) -> None:
    with tarfile.open(path, "w:gz") as archive:
        for name, kind in members:
            member = tarfile.TarInfo(name)
            member.mode = 0o755 if kind == "directory" else 0o644
            if kind == "directory":
                member.type = tarfile.DIRTYPE
                archive.addfile(member)
            elif kind == "file":
                payload = b"starfiniti-openssh-source-test\n"
                member.size = len(payload)
                archive.addfile(member, io.BytesIO(payload))
            elif kind == "symlink":
                member.type = tarfile.SYMTYPE
                member.linkname = "target"
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
    root = "openssh-test"
    cases = {
        "valid": [
            (root, "directory"),
            (f"{root}/directory", "directory"),
            (f"{root}/directory/file", "file"),
        ],
        "traversal": [
            (root, "directory"),
            (f"{root}/../escape", "file"),
        ],
        "duplicate": [
            (root, "directory"),
            (f"{root}/file", "file"),
            (f"{root}/file", "file"),
        ],
        "symlink": [
            (root, "directory"),
            (f"{root}/link", "symlink"),
        ],
        "absolute": [("/openssh-test/file", "file")],
    }
    with tempfile.TemporaryDirectory(prefix="starfiniti-openssh-source-") as raw:
        directory = pathlib.Path(raw)
        archives = {}
        for name, members in cases.items():
            archive = directory / f"{name}.tar.gz"
            write_test_archive(archive, members)
            archives[name] = archive
        rows = archive_rows(archives["valid"], root)
        if len(rows) != 2 or len(digest_rows(rows)) != 64:
            raise AssertionError("valid source verifier fixture differs")
        for name in ("traversal", "duplicate", "symlink", "absolute"):
            expect_failure(lambda path=archives[name]: archive_rows(path, root))


def main() -> None:
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("OpenSSH source verifier self-test passed.")
        return
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--archive", type=pathlib.Path)
    mode.add_argument("--tree", type=pathlib.Path)
    parser.add_argument("--root", required=True)
    parser.add_argument("--entries", type=int, required=True)
    parser.add_argument("--files", type=int, required=True)
    parser.add_argument("--bytes", type=int, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    arguments = parser.parse_args()
    rows = (
        archive_rows(arguments.archive, arguments.root)
        if arguments.archive
        else tree_rows(arguments.tree)
    )
    files = [row for row in rows if row[1] == "f"]
    if len(rows) != arguments.entries:
        fail("entry count differs")
    if len(files) != arguments.files:
        fail("file count differs")
    if sum(row[3] for row in files) != arguments.bytes:
        fail("byte count differs")
    if digest_rows(rows) != arguments.manifest_sha256:
        fail("manifest digest differs")


if __name__ == "__main__":
    main()
