#!/usr/bin/env python3
import hashlib
import pathlib
import stat
import sys
import tarfile


def digest_rows(files: list[tuple[str, str, int]]) -> str:
    manifest = hashlib.sha256()
    for relative, digest, size in sorted(
        files, key=lambda item: item[0].encode("utf-8")
    ):
        manifest.update(f"{relative}\0{digest}\0{size}\n".encode("utf-8"))
    return manifest.hexdigest()


def verify_values(
    entries: int,
    files: list[tuple[str, str, int]],
    expected_entries: int,
    expected_files: int,
    expected_bytes: int,
    expected_manifest: str,
) -> None:
    if entries != expected_entries:
        raise SystemExit("candidate entry count differs")
    if len(files) != expected_files:
        raise SystemExit("candidate file count differs")
    if sum(size for _, _, size in files) != expected_bytes:
        raise SystemExit("candidate tree size differs")
    if digest_rows(files) != expected_manifest:
        raise SystemExit("candidate tree manifest differs")


def verify_archive(
    archive: pathlib.Path,
    root_name: str,
    expected_entries: int,
    expected_files: int,
    expected_bytes: int,
    expected_manifest: str,
) -> None:
    files: list[tuple[str, str, int]] = []
    names: set[str] = set()
    entries = 0
    with tarfile.open(archive, "r:gz") as handle:
        for member in handle:
            entries += 1
            path = pathlib.PurePosixPath(member.name)
            if (
                not member.name
                or member.name.startswith("/")
                or "\\" in member.name
                or any(part in {"", ".", ".."} for part in path.parts)
                or path.parts[0] != root_name
                or member.name in names
                or not (member.isdir() or member.isreg())
            ):
                raise SystemExit("unsafe candidate archive entry")
            names.add(member.name)
            if member.isreg():
                source = handle.extractfile(member)
                if source is None:
                    raise SystemExit("candidate archive file is unreadable")
                digest = hashlib.sha256()
                size = 0
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > expected_bytes:
                        raise SystemExit("candidate archive exceeds byte bound")
                    digest.update(chunk)
                if size != member.size:
                    raise SystemExit("candidate archive file size differs")
                relative = path.relative_to(root_name).as_posix()
                files.append((relative, digest.hexdigest(), size))
    verify_values(
        entries,
        files,
        expected_entries,
        expected_files,
        expected_bytes,
        expected_manifest,
    )


def verify_tree(
    root: pathlib.Path,
    expected_entries: int,
    expected_files: int,
    expected_bytes: int,
    expected_manifest: str,
) -> None:
    root_mode = root.lstat().st_mode
    if not stat.S_ISDIR(root_mode) or stat.S_ISLNK(root_mode):
        raise SystemExit("candidate root is unsafe")
    files: list[tuple[str, str, int]] = []
    entries = 1
    for path in root.rglob("*"):
        entries += 1
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            raise SystemExit("unsafe extracted entry")
        if stat.S_ISREG(mode):
            relative = path.relative_to(root).as_posix()
            digest = hashlib.sha256()
            size = 0
            with path.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > expected_bytes:
                        raise SystemExit("candidate tree exceeds byte bound")
                    digest.update(chunk)
            files.append((relative, digest.hexdigest(), size))
    verify_values(
        entries,
        files,
        expected_entries,
        expected_files,
        expected_bytes,
        expected_manifest,
    )


def main() -> None:
    if len(sys.argv) != 7 or sys.argv[1] not in {"--archive", "--tree"}:
        raise SystemExit(
            "expected mode, path, entry count, file count, byte count, and manifest digest"
        )
    mode, path_value, entries, files, size, manifest = sys.argv[1:]
    common = (int(entries), int(files), int(size), manifest)
    if mode == "--archive":
        verify_archive(pathlib.Path(path_value), "borg-dir", *common)
    else:
        verify_tree(pathlib.Path(path_value), *common)


if __name__ == "__main__":
    main()
