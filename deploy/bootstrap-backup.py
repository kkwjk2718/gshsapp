#!/usr/bin/env python3
"""Create and verify a complete, offline application backup generation."""

from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import errno
import gzip
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import stat
import sys
import tarfile
import tempfile
import unicodedata
from urllib.parse import quote


BACKUP_NAME = re.compile(r"backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz\Z")
RECEIPT_NAME = re.compile(
    r"(backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz)\.receipt\.json\Z"
)
CREATE_WORK_NAME = re.compile(r"\.create-[A-Za-z0-9_-]{6,32}\Z")
LOCAL_ARCHIVE_PARTIAL_NAME = re.compile(
    r"\.(backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz)\.partial\Z"
)
LOCAL_METADATA_PARTIAL_NAME = re.compile(
    r"\.(backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz)\.json\.partial\Z"
)
RECEIPT_PARTIAL_NAME = re.compile(
    r"\.(backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz)\.receipt\.partial\Z"
)
SQLITE_HEADER = b"SQLite format 3\x00"
MAX_DATABASE_BYTES = 512 * 1024 * 1024
MAX_CONTENT_FILE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_TOTAL_BYTES = 512 * 1024 * 1024
MAX_COMPRESSED_ARCHIVE_BYTES = MAX_ARCHIVE_TOTAL_BYTES + 16 * 1024 * 1024
MAX_UNCOMPRESSED_TAR_BYTES = MAX_ARCHIVE_TOTAL_BYTES + 32 * 1024 * 1024
MAX_PAX_HEADER_BYTES = 8 * 1024
MAX_PAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_FILES = 9_990
MAX_ARCHIVE_ENTRIES = 10_000
MAX_ARCHIVE_PATH_BYTES = 512
MAX_ARCHIVE_DEPTH = 32
MAX_BACKUP_DIRECTORY_ENTRIES = 512
MAX_RECEIPT_DIRECTORY_ENTRIES = 10_000
MAX_MANIFEST_BYTES = 64 * 1024
RESERVE_BYTES = 256 * 1024 * 1024
STALE_OFFSITE_EXIT_STATUS = 10
CONTENT_ROOTS = ("logs", "storage", "uploads", "user-content")
ALLOWED_REASONS = {"predeployment-bootstrap", "pre-deployment", "scheduled", "manual", "pre-restore"}
RECEIPT_KEYS = {"format", "version", "file", "createdAt", "exportedAt", "size", "sha256"}
METADATA_KEYS = {"format", "version", "file", "createdAt", "reason", "size", "sha256"}
MANIFEST_KEYS = {"format", "version", "createdAt", "database", "contentRoots", "files"}
CANONICAL_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\Z")
FORBIDDEN_ARCHIVE_CHARACTERS = re.compile(r'[\x00-\x1f\x7f-\x9f\ufeff\\:<>"|?*]')
WINDOWS_DEVICE_NAME = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$", re.IGNORECASE)


class BootstrapBackupError(RuntimeError):
    pass


def bounded_directory_entries(directory: Path) -> list[Path]:
    entries: list[Path] = []
    for entry in directory.iterdir():
        entries.append(entry)
        if len(entries) > MAX_BACKUP_DIRECTORY_ENTRIES:
            raise BootstrapBackupError("Backup directory contains too many entries")
    return entries


def bounded_receipt_entries(directory: Path) -> list[Path]:
    entries: list[Path] = []
    for entry in directory.iterdir():
        entries.append(entry)
        if len(entries) > MAX_RECEIPT_DIRECTORY_ENTRIES:
            raise BootstrapBackupError("Offsite receipt directory contains too many entries")
    return entries


def require_real_directory(raw: str, *, create: bool = False) -> Path:
    directory = Path(os.path.abspath(raw))
    if create:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        listed = directory.lstat()
    except OSError as error:
        raise BootstrapBackupError("Required directory is unavailable") from error
    if not stat.S_ISDIR(listed.st_mode) or directory.is_symlink():
        raise BootstrapBackupError("Required directory must not be a filesystem link")
    directory.chmod(0o700)
    return directory.resolve(strict=True)


def require_database(raw: str, data_root: Path) -> tuple[Path, os.stat_result]:
    database = Path(os.path.abspath(raw))
    if database.is_symlink():
        raise BootstrapBackupError("Database path must not contain filesystem links")
    if os.name != "nt":
        try:
            relative = database.relative_to(data_root)
        except ValueError as error:
            raise BootstrapBackupError("Database must stay inside the configured data root") from error

        current = data_root
        for segment in relative.parts:
            current = current / segment
            try:
                if current.is_symlink():
                    raise BootstrapBackupError("Database path must not contain filesystem links")
            except OSError as error:
                raise BootstrapBackupError("Database path could not be inspected") from error

    try:
        resolved = database.resolve(strict=True)
        resolved.relative_to(data_root)
    except (OSError, ValueError) as error:
        raise BootstrapBackupError("Database must stay inside the configured data root") from error

    listed = resolved.lstat()
    if not stat.S_ISREG(listed.st_mode) or resolved.is_symlink() or listed.st_nlink != 1:
        raise BootstrapBackupError("Database must be one unaliased regular file")
    return resolved, listed


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_canonical_timestamp(value: object) -> str:
    if not isinstance(value, str) or CANONICAL_TIMESTAMP.fullmatch(value) is None:
        raise BootstrapBackupError("Backup timestamp is invalid")
    try:
        dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError as error:
        raise BootstrapBackupError("Backup timestamp is invalid") from error
    return value


def fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    try:
        descriptor = os.open(directory, flags)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError as error:
        if os.name == "nt" and error.errno in {errno.EACCES, errno.EINVAL, errno.EPERM}:
            return
        raise BootstrapBackupError("Backup directory durability sync failed") from error


def sqlite_uri(file: Path) -> str:
    return f"file:{quote(file.as_posix(), safe='/:')}?mode=ro"


def validate_sqlite(file: Path) -> None:
    listed = file.lstat()
    if not stat.S_ISREG(listed.st_mode) or file.is_symlink() or listed.st_size > MAX_DATABASE_BYTES:
        raise BootstrapBackupError("Snapshot is not a bounded regular SQLite file")
    with file.open("rb") as stream:
        if stream.read(len(SQLITE_HEADER)) != SQLITE_HEADER:
            raise BootstrapBackupError("Snapshot has an invalid SQLite header")

    connection = sqlite3.connect(sqlite_uri(file), uri=True, timeout=30)
    try:
        connection.execute("PRAGMA query_only = ON")
        connection.execute("PRAGMA trusted_schema = OFF")
        if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise BootstrapBackupError("SQLite quick_check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise BootstrapBackupError("SQLite foreign key validation failed")
        executable = connection.execute(
            "SELECT type, name FROM sqlite_master "
            "WHERE type IN ('trigger', 'view') AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).fetchone()
        if executable is not None:
            raise BootstrapBackupError("Executable SQLite schema objects are not accepted")
    except sqlite3.Error as error:
        raise BootstrapBackupError("SQLite snapshot validation failed") from error
    finally:
        connection.close()


def create_online_snapshot(source_path: Path, source_identity: os.stat_result, destination: Path) -> None:
    if destination.exists() or destination.is_symlink():
        raise BootstrapBackupError("Snapshot destination already exists")
    source = sqlite3.connect(sqlite_uri(source_path), uri=True, timeout=30)
    target = sqlite3.connect(destination, timeout=30)
    completed = False
    try:
        source.execute("PRAGMA query_only = ON")
        source.execute("PRAGMA trusted_schema = OFF")
        source.execute("PRAGMA busy_timeout = 30000")
        source.backup(target, pages=256, sleep=0.05)
        target.commit()
        completed = True
    except sqlite3.Error as error:
        raise BootstrapBackupError("SQLite online backup failed") from error
    finally:
        target.close()
        source.close()
        if not completed:
            destination.unlink(missing_ok=True)

    final_source = source_path.lstat()
    if (
        not stat.S_ISREG(final_source.st_mode)
        or source_path.is_symlink()
        or final_source.st_dev != source_identity.st_dev
        or final_source.st_ino != source_identity.st_ino
        or final_source.st_nlink != 1
    ):
        destination.unlink(missing_ok=True)
        raise BootstrapBackupError("Database identity changed during online backup")
    destination.chmod(0o600)
    with destination.open("r+b") as stream:
        os.fsync(stream.fileno())
    validate_sqlite(destination)


def utc_timestamp() -> tuple[str, str]:
    now = dt.datetime.now(dt.timezone.utc)
    created_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    filename_time = now.strftime("%Y%m%d-%H%M%S")
    return created_at, filename_time


def tar_info(name: str, *, size: int = 0, directory: bool = False) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mtime = 0
    info.mode = 0o700 if directory else 0o600
    info.type = tarfile.DIRTYPE if directory else tarfile.REGTYPE
    info.size = 0 if directory else size
    return info


def safe_archive_path(value: str) -> str:
    if (
        not value
        or value.startswith("/")
        or value.startswith("~")
        or value.startswith("./")
        or re.match(r"^[A-Za-z]:", value) is not None
        or unicodedata.normalize("NFC", value) != value
        or FORBIDDEN_ARCHIVE_CHARACTERS.search(value) is not None
        or len(value.encode("utf-8")) > MAX_ARCHIVE_PATH_BYTES
    ):
        raise BootstrapBackupError("Backup content path is invalid")
    parts = value.split("/")
    if (
        len(parts) > MAX_ARCHIVE_DEPTH
        or any(part in {"", ".", ".."} for part in parts)
        or any(part.endswith(".") or part.endswith(" ") or WINDOWS_DEVICE_NAME.fullmatch(part) is not None for part in parts)
    ):
        raise BootstrapBackupError("Backup content path is invalid")
    return value


def copy_content_roots(data_root: Path, staging: Path) -> tuple[list[str], list[dict[str, object]]]:
    included: list[str] = []
    files: list[dict[str, object]] = []
    total_bytes = 0

    def copy_tree(source: Path, destination: Path, relative_root: str) -> None:
        nonlocal total_bytes
        try:
            children = sorted(os.scandir(source), key=lambda child: child.name)
        except OSError as error:
            raise BootstrapBackupError("Backup content directory could not be read") from error
        for child in children:
            relative = safe_archive_path(f"{relative_root}/{child.name}")
            source_path = source / child.name
            destination_path = destination / child.name
            try:
                before = source_path.lstat()
            except OSError as error:
                raise BootstrapBackupError("Backup content changed during inspection") from error
            if stat.S_ISLNK(before.st_mode):
                raise BootstrapBackupError("Backup content must not contain filesystem links")
            if stat.S_ISDIR(before.st_mode):
                destination_path.mkdir(mode=0o700)
                copy_tree(source_path, destination_path, relative)
                continue
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise BootstrapBackupError("Backup content must contain only unaliased regular files")
            if before.st_size > MAX_CONTENT_FILE_BYTES:
                raise BootstrapBackupError("Backup content file exceeds its limit")
            total_bytes += before.st_size
            if total_bytes > MAX_ARCHIVE_TOTAL_BYTES or len(files) >= MAX_ARCHIVE_FILES - 1:
                raise BootstrapBackupError("Backup content generation exceeds its limit")
            if shutil.disk_usage(staging).free < before.st_size + RESERVE_BYTES:
                raise BootstrapBackupError("Insufficient free space to stage backup content")
            digest = hashlib.sha256()
            flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
            try:
                source_descriptor = os.open(source_path, flags)
                with os.fdopen(source_descriptor, "rb", closefd=True) as input_file, destination_path.open("xb") as output:
                    copied = 0
                    while True:
                        block = input_file.read(1024 * 1024)
                        if not block:
                            break
                        copied += len(block)
                        if copied > before.st_size or copied > MAX_CONTENT_FILE_BYTES:
                            raise BootstrapBackupError("Backup content changed while it was copied")
                        digest.update(block)
                        output.write(block)
                    output.flush()
                    os.fsync(output.fileno())
            except BootstrapBackupError:
                raise
            except OSError as error:
                raise BootstrapBackupError("Backup content could not be copied safely") from error
            after = source_path.lstat()
            if (
                not stat.S_ISREG(after.st_mode)
                or source_path.is_symlink()
                or after.st_nlink != 1
                or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
                != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
                or copied != before.st_size
            ):
                raise BootstrapBackupError("Backup content changed while it was copied")
            destination_path.chmod(0o600)
            files.append({"path": relative, "size": copied, "sha256": digest.hexdigest()})

    for root_name in CONTENT_ROOTS:
        source_root = data_root / root_name
        try:
            root_stats = source_root.lstat()
        except FileNotFoundError:
            continue
        except OSError as error:
            raise BootstrapBackupError("Backup content root could not be inspected") from error
        if source_root.is_symlink() or not stat.S_ISDIR(root_stats.st_mode):
            raise BootstrapBackupError("Backup content root must be a real directory")
        destination_root = staging / "content" / root_name
        destination_root.mkdir(parents=True, mode=0o700)
        included.append(root_name)
        copy_tree(source_root, destination_root, f"content/{root_name}")
    files.sort(key=lambda item: str(item["path"]))
    return included, files


def estimate_content_roots(data_root: Path) -> tuple[int, int]:
    total_bytes = 0
    total_files = 0

    def walk(directory: Path, relative_root: str) -> None:
        nonlocal total_bytes, total_files
        try:
            children = sorted(os.scandir(directory), key=lambda child: child.name)
        except OSError as error:
            raise BootstrapBackupError("Backup content directory could not be read") from error
        for child in children:
            relative = safe_archive_path(f"{relative_root}/{child.name}")
            source = directory / child.name
            listed = source.lstat()
            if source.is_symlink() or stat.S_ISLNK(listed.st_mode):
                raise BootstrapBackupError("Backup content must not contain filesystem links")
            if stat.S_ISDIR(listed.st_mode):
                walk(source, relative)
            elif stat.S_ISREG(listed.st_mode) and listed.st_nlink == 1:
                if listed.st_size > MAX_CONTENT_FILE_BYTES:
                    raise BootstrapBackupError("Backup content file exceeds its limit")
                total_files += 1
                total_bytes += listed.st_size
                if total_files >= MAX_ARCHIVE_FILES or total_bytes > MAX_ARCHIVE_TOTAL_BYTES:
                    raise BootstrapBackupError("Backup content generation exceeds its limit")
            else:
                raise BootstrapBackupError("Backup content must contain only unaliased regular files")

    for root_name in CONTENT_ROOTS:
        source_root = data_root / root_name
        try:
            listed = source_root.lstat()
        except FileNotFoundError:
            continue
        if source_root.is_symlink() or not stat.S_ISDIR(listed.st_mode):
            raise BootstrapBackupError("Backup content root must be a real directory")
        walk(source_root, f"content/{root_name}")
    return total_bytes, total_files


def staged_directories(files: list[dict[str, object]], roots: list[str]) -> list[str]:
    directories = {"database"}
    if roots:
        directories.add("content")
        directories.update(f"content/{root}" for root in roots)
    for item in files:
        path_value = str(item["path"])
        parts = path_value.split("/")[:-1]
        for index in range(1, len(parts) + 1):
            directories.add("/".join(parts[:index]))
    return sorted(directories, key=lambda value: (value.count("/"), value))


def write_archive(
    target: Path,
    manifest_bytes: bytes,
    staging: Path,
    files: list[dict[str, object]],
    roots: list[str],
) -> None:
    with target.open("xb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
                archive.addfile(tar_info("manifest.json", size=len(manifest_bytes)), fileobj=_BytesReader(manifest_bytes))
                for directory in staged_directories(files, roots):
                    archive.addfile(tar_info(directory, directory=True))
                for item in files:
                    relative = safe_archive_path(str(item["path"]))
                    source = staging.joinpath(*relative.split("/"))
                    with source.open("rb") as payload:
                        archive.addfile(tar_info(relative, size=int(item["size"])), fileobj=payload)
        raw.flush()
        os.fsync(raw.fileno())
    target.chmod(0o600)


class _BytesReader:
    def __init__(self, value: bytes):
        self._value = value
        self._offset = 0

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self._value) - self._offset
        result = self._value[self._offset:self._offset + size]
        self._offset += len(result)
        return result


def decode_strict_json(value: bytes) -> object:
    def no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        output: dict[str, object] = {}
        for key, item in pairs:
            if key in output:
                raise BootstrapBackupError("Backup JSON contains duplicate keys")
            output[key] = item
        return output

    try:
        return json.loads(value.decode("utf-8"), object_pairs_hook=no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise BootstrapBackupError("Backup JSON is invalid") from error


def strict_json(file: Path, *, maximum_bytes: int) -> object:
    listed = file.lstat()
    if not stat.S_ISREG(listed.st_mode) or file.is_symlink() or listed.st_size > maximum_bytes:
        raise BootstrapBackupError("Backup JSON is not a bounded regular file")
    return decode_strict_json(file.read_bytes())


def validate_manifest(value: object) -> tuple[str, list[str], list[dict[str, object]]]:
    if not isinstance(value, dict) or set(value) != MANIFEST_KEYS:
        raise BootstrapBackupError("Backup manifest shape is invalid")
    if (
        value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("database") != "database/dev.db"
    ):
        raise BootstrapBackupError("Backup manifest identity is invalid")
    roots = value.get("contentRoots")
    if (
        not isinstance(roots, list)
        or roots != sorted(roots)
        or len(set(roots)) != len(roots)
        or any(not isinstance(root, str) or root not in CONTENT_ROOTS for root in roots)
    ):
        raise BootstrapBackupError("Backup manifest content roots are invalid")
    raw_files = value.get("files")
    if not isinstance(raw_files, list) or not raw_files or len(raw_files) > MAX_ARCHIVE_FILES:
        raise BootstrapBackupError("Backup manifest file list is invalid")
    files: list[dict[str, object]] = []
    previous_path = ""
    database_count = 0
    total_content = 0
    for item in raw_files:
        if not isinstance(item, dict) or set(item) != {"path", "size", "sha256"}:
            raise BootstrapBackupError("Backup manifest file entry is invalid")
        path_value = item.get("path")
        size = item.get("size")
        digest = item.get("sha256")
        if (
            not isinstance(path_value, str)
            or safe_archive_path(path_value) != path_value
            or path_value <= previous_path
            or type(size) is not int
            or size < 0
            or not isinstance(digest, str)
            or re.fullmatch(r"[a-f0-9]{64}", digest) is None
        ):
            raise BootstrapBackupError("Backup manifest file entry is invalid")
        if path_value == "database/dev.db":
            database_count += 1
            if size > MAX_DATABASE_BYTES:
                raise BootstrapBackupError("Backup database exceeds its limit")
        elif path_value.startswith("content/"):
            parts = path_value.split("/")
            if len(parts) < 3 or parts[1] not in roots or size > MAX_CONTENT_FILE_BYTES:
                raise BootstrapBackupError("Backup manifest content path is invalid")
            total_content += size
            if total_content > MAX_ARCHIVE_TOTAL_BYTES:
                raise BootstrapBackupError("Backup content generation exceeds its limit")
        else:
            raise BootstrapBackupError("Backup manifest file path is invalid")
        previous_path = path_value
        files.append(item)
    if database_count != 1:
        raise BootstrapBackupError("Backup manifest file list is invalid")
    if sum(int(item["size"]) for item in files) > MAX_ARCHIVE_TOTAL_BYTES:
        raise BootstrapBackupError("Backup generation exceeds its shared archive limit")
    return require_canonical_timestamp(value.get("createdAt")), roots, files


def _parse_tar_octal(raw: bytes) -> int:
    # The reviewed writer emits canonical POSIX octal fields. Reject base-256
    # and other extensions before the stdlib can allocate for their payload.
    if raw and raw[0] & 0x80:
        raise BootstrapBackupError("Backup archive contains a non-canonical size field")
    stripped = raw.rstrip(b"\0 ").lstrip(b" ")
    if not stripped:
        return 0
    if any(value < ord("0") or value > ord("7") for value in stripped):
        raise BootstrapBackupError("Backup archive contains an invalid size field")
    return int(stripped, 8)


def scan_bounded_gzip_tar(archive_path: Path) -> None:
    """Bound gzip expansion and metadata payloads before tarfile parses them."""
    total = 0
    entries = 0
    pax_total = 0
    ended = False
    zero_headers = 0
    try:
        with gzip.open(archive_path, "rb") as stream:
            while True:
                header = stream.read(512)
                if not header:
                    break
                total += len(header)
                if len(header) != 512 or total > MAX_UNCOMPRESSED_TAR_BYTES:
                    raise BootstrapBackupError("Backup archive expansion exceeds its limit")
                if header == b"\0" * 512:
                    zero_headers += 1
                    if zero_headers >= 2:
                        ended = True
                    continue
                if ended:
                    raise BootstrapBackupError("Backup archive contains data after its end marker")
                zero_headers = 0
                entries += 1
                if entries > MAX_ARCHIVE_ENTRIES * 2:
                    raise BootstrapBackupError("Backup archive physical entry count is invalid")
                size = _parse_tar_octal(header[124:136])
                type_flag = header[156:157]
                if type_flag in {tarfile.XHDTYPE, tarfile.XGLTYPE}:
                    if size > MAX_PAX_HEADER_BYTES:
                        raise BootstrapBackupError("Backup archive metadata entry exceeds its limit")
                    pax_total += size
                    if pax_total > MAX_PAX_TOTAL_BYTES:
                        raise BootstrapBackupError("Backup archive metadata exceeds its limit")
                elif type_flag in {tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK}:
                    raise BootstrapBackupError("Backup archive uses an unsupported metadata extension")
                elif type_flag == tarfile.DIRTYPE:
                    if size != 0:
                        raise BootstrapBackupError("Backup archive directory is invalid")
                elif size > MAX_CONTENT_FILE_BYTES:
                    raise BootstrapBackupError("Backup archive entry exceeds its limit")
                padded = ((size + 511) // 512) * 512
                if total + padded > MAX_UNCOMPRESSED_TAR_BYTES:
                    raise BootstrapBackupError("Backup archive expansion exceeds its limit")
                remaining = padded
                while remaining:
                    block = stream.read(min(1024 * 1024, remaining))
                    if not block:
                        raise BootstrapBackupError("Backup archive payload is truncated")
                    total += len(block)
                    remaining -= len(block)
            if not ended:
                raise BootstrapBackupError("Backup archive end marker is missing")
    except (OSError, EOFError, gzip.BadGzipFile) as error:
        if isinstance(error, BootstrapBackupError):
            raise
        raise BootstrapBackupError("Backup archive compression stream is invalid") from error


def validate_archive(archive_path: Path) -> str:
    listed = archive_path.lstat()
    if (
        not stat.S_ISREG(listed.st_mode)
        or archive_path.is_symlink()
        or listed.st_nlink != 1
        or listed.st_size < 1
        or listed.st_size > MAX_COMPRESSED_ARCHIVE_BYTES
    ):
        raise BootstrapBackupError("Backup archive must be a regular file")
    scan_bounded_gzip_tar(archive_path)
    extraction_root = Path(tempfile.mkdtemp(prefix=".bootstrap-verify-", dir=archive_path.parent))
    extraction_root.chmod(0o700)
    try:
        database_copy = extraction_root / "dev.db"
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members: list[tarfile.TarInfo] = []
            names: set[str] = set()
            declared_payload_bytes = 0
            for member in archive:
                if len(members) >= MAX_ARCHIVE_ENTRIES:
                    raise BootstrapBackupError("Backup archive entry count is invalid")
                name = safe_archive_path(member.name.rstrip("/"))
                if name in names:
                    raise BootstrapBackupError("Backup archive contains duplicate entries")
                names.add(name)
                if not member.isreg() and not member.isdir():
                    raise BootstrapBackupError("Backup archive layout is invalid")
                if member.issym() or member.islnk() or member.isdev() or member.size < 0:
                    raise BootstrapBackupError("Backup archive contains an unsafe entry")
                if member.isdir() and member.size != 0:
                    raise BootstrapBackupError("Backup archive directory is invalid")
                if not members:
                    if member.name != "manifest.json" or not member.isreg() or member.size > MAX_MANIFEST_BYTES:
                        raise BootstrapBackupError("Backup archive entry exceeds its limit")
                elif member.isreg():
                    if member.size > MAX_CONTENT_FILE_BYTES:
                        raise BootstrapBackupError("Backup archive entry exceeds its limit")
                    declared_payload_bytes += member.size
                    if declared_payload_bytes > MAX_ARCHIVE_TOTAL_BYTES:
                        raise BootstrapBackupError("Backup generation exceeds its shared archive limit")
                members.append(member)
            if not members:
                raise BootstrapBackupError("Backup archive entry count is invalid")
            manifest_member = members[0]
            if manifest_member.name != "manifest.json" or not manifest_member.isreg() or manifest_member.size > MAX_MANIFEST_BYTES:
                raise BootstrapBackupError("Backup archive entry exceeds its limit")
            manifest_stream = archive.extractfile(manifest_member)
            if manifest_stream is None:
                raise BootstrapBackupError("Backup archive manifest is missing")
            manifest_bytes = manifest_stream.read(MAX_MANIFEST_BYTES + 1)
            if len(manifest_bytes) != manifest_member.size:
                raise BootstrapBackupError("Backup manifest length changed")
            manifest = decode_strict_json(manifest_bytes)
            manifest_timestamp, roots, manifest_files = validate_manifest(manifest)
            expected_files = {"manifest.json", *(str(item["path"]) for item in manifest_files)}
            actual_files = {member.name for member in members if member.isreg()}
            if actual_files != expected_files:
                raise BootstrapBackupError("Backup archive files do not match the manifest")
            expected_directories = set(staged_directories(manifest_files, roots))
            actual_directories = {member.name.rstrip("/") for member in members if member.isdir()}
            if actual_directories != expected_directories:
                raise BootstrapBackupError("Backup archive directories do not match the manifest")

            for item in manifest_files:
                path_value = str(item["path"])
                member = archive.getmember(path_value)
                payload = archive.extractfile(member)
                if payload is None or member.size != item["size"]:
                    raise BootstrapBackupError("Backup archive payload is missing")
                digest = hashlib.sha256()
                total = 0
                output = database_copy.open("xb") if path_value == "database/dev.db" else None
                try:
                    while True:
                        block = payload.read(1024 * 1024)
                        if not block:
                            break
                        total += len(block)
                        if total > int(item["size"]):
                            raise BootstrapBackupError("Backup archive payload exceeds its declared length")
                        digest.update(block)
                        if output is not None:
                            output.write(block)
                    if output is not None:
                        output.flush()
                        os.fsync(output.fileno())
                finally:
                    if output is not None:
                        output.close()
                if total != item["size"] or not hmac.compare_digest(digest.hexdigest(), str(item["sha256"])):
                    raise BootstrapBackupError("Backup archive checksum validation failed")
            if sorted(roots) != roots:
                raise BootstrapBackupError("Backup content roots are not canonical")
        validate_sqlite(database_copy)
        return manifest_timestamp
    except (tarfile.TarError, OSError) as error:
        raise BootstrapBackupError("Backup archive validation failed") from error
    finally:
        shutil.rmtree(extraction_root, ignore_errors=True)


def validate_metadata(value: object, archive_path: Path, manifest_timestamp: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != METADATA_KEYS:
        raise BootstrapBackupError("Backup metadata shape is invalid")
    size = value.get("size")
    digest = value.get("sha256")
    if (
        value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("file") != archive_path.name
        or value.get("reason") not in ALLOWED_REASONS
        or require_canonical_timestamp(value.get("createdAt")) != manifest_timestamp
        or type(size) is not int
        or size != archive_path.stat().st_size
        or not isinstance(digest, str)
        or re.fullmatch(r"[a-f0-9]{64}", digest) is None
        or not hmac.compare_digest(digest, sha256_file(archive_path))
    ):
        raise BootstrapBackupError("Backup metadata does not match the archive")
    return value


def resolve_pair(backup_dir_raw: str, name: str) -> tuple[Path, Path, Path]:
    backup_dir = require_real_directory(backup_dir_raw)
    if BACKUP_NAME.fullmatch(name) is None or Path(name).name != name:
        raise BootstrapBackupError("Backup name is invalid")
    archive = backup_dir / name
    metadata = backup_dir / f"{name}.json"
    return backup_dir, archive, metadata


def verify_pair(backup_dir_raw: str, name: str) -> dict[str, object]:
    _backup_dir, archive, metadata = resolve_pair(backup_dir_raw, name)
    manifest_timestamp = validate_archive(archive)
    return validate_metadata(strict_json(metadata, maximum_bytes=MAX_MANIFEST_BYTES), archive, manifest_timestamp)


def copy_regular_exclusive(source: Path, destination: Path) -> None:
    before = source.lstat()
    if source.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise BootstrapBackupError("Backup pair contains an unsafe file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        source_descriptor = os.open(source, flags)
        with os.fdopen(source_descriptor, "rb", closefd=True) as input_file, destination.open("xb") as output:
            copied = 0
            while True:
                block = input_file.read(1024 * 1024)
                if not block:
                    break
                copied += len(block)
                if copied > before.st_size:
                    raise BootstrapBackupError("Backup pair changed while it was copied")
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
    except BootstrapBackupError:
        raise
    except OSError as error:
        raise BootstrapBackupError("Backup pair could not be copied safely") from error
    after = source.lstat()
    if (
        source.is_symlink()
        or not stat.S_ISREG(after.st_mode)
        or after.st_nlink != 1
        or copied != before.st_size
        or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
        != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    ):
        destination.unlink(missing_ok=True)
        raise BootstrapBackupError("Backup pair changed while it was copied")
    destination.chmod(0o600)


def exact_bounded_regular_file_match(left: Path, right: Path) -> bool:
    """Compare two small files while proving neither identity changed."""
    identities: list[tuple[Path, os.stat_result]] = []
    for path in (left, right):
        try:
            identity = path.lstat()
        except OSError as error:
            raise BootstrapBackupError("Interrupted offsite metadata is unreadable") from error
        if (
            path.is_symlink()
            or not stat.S_ISREG(identity.st_mode)
            or identity.st_nlink != 1
            or identity.st_size > MAX_MANIFEST_BYTES
        ):
            raise BootstrapBackupError("Interrupted offsite metadata is unsafe")
        identities.append((path, identity))
    try:
        matches = hmac.compare_digest(left.read_bytes(), right.read_bytes())
    except OSError as error:
        raise BootstrapBackupError("Interrupted offsite metadata is unreadable") from error
    for path, before in identities:
        try:
            after = path.lstat()
        except OSError as error:
            raise BootstrapBackupError("Interrupted offsite metadata changed") from error
        if (
            path.is_symlink()
            or not stat.S_ISREG(after.st_mode)
            or after.st_nlink != 1
            or (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
        ):
            raise BootstrapBackupError("Interrupted offsite metadata changed")
    return matches


def export_offsite_pair(
    backup_dir_raw: str,
    name: str,
    offsite_dir_raw: str,
    receipt_dir_raw: str,
) -> Path:
    _backup_dir, archive, metadata_path = resolve_pair(backup_dir_raw, name)
    metadata = verify_pair(backup_dir_raw, name)
    offsite_dir = require_real_directory(offsite_dir_raw, create=True)
    receipt_dir = require_real_directory(receipt_dir_raw, create=True)
    target_archive = offsite_dir / name
    target_metadata = offsite_dir / f"{name}.json"
    partial_archive = offsite_dir / f".{name}.partial"
    partial_metadata = offsite_dir / f".{name}.json.partial"
    receipt_partial = receipt_dir / f".{name}.receipt.partial"
    created_targets: list[Path] = []
    receipt_committed = False
    receipt_created = False
    try:
        for stale_partial in (partial_archive, partial_metadata):
            try:
                stale_stats = stale_partial.lstat()
            except FileNotFoundError:
                continue
            if stale_partial.is_symlink() or not stat.S_ISREG(stale_stats.st_mode) or stale_stats.st_nlink != 1:
                raise BootstrapBackupError("Offsite partial state is unsafe")
            stale_partial.unlink()
            fsync_directory(offsite_dir)
        try:
            receipt_partial_stats = receipt_partial.lstat()
        except FileNotFoundError:
            pass
        else:
            if receipt_partial.is_symlink() or not stat.S_ISREG(receipt_partial_stats.st_mode) or receipt_partial_stats.st_nlink != 1:
                raise BootstrapBackupError("Offsite receipt partial state is unsafe")
            receipt_partial.unlink()
            fsync_directory(receipt_dir)
        archive_present = target_archive.exists() or target_archive.is_symlink()
        metadata_present = target_metadata.exists() or target_metadata.is_symlink()
        if archive_present != metadata_present:
            # Publication is archive first, metadata second. An interrupted
            # export normally leaves one strict-name archive. Older releases
            # did not fsync between the archive and metadata links, so a
            # metadata-only dirent is also recoverable only when its exact
            # bounded bytes and stable file identity match local metadata.
            if archive_present:
                if target_archive.is_symlink() or not target_archive.is_file():
                    raise BootstrapBackupError("Offsite generation is incomplete")
                if (
                    target_archive.stat().st_size != archive.stat().st_size
                    or not hmac.compare_digest(sha256_file(target_archive), sha256_file(archive))
                ):
                    raise BootstrapBackupError("Offsite orphan conflicts with the local backup")
                target_archive.unlink()
            else:
                if not exact_bounded_regular_file_match(metadata_path, target_metadata):
                    raise BootstrapBackupError("Offsite orphan conflicts with the local backup")
                target_metadata.unlink()
            fsync_directory(offsite_dir)
        receipt_target = receipt_dir / f"{name}.receipt.json"
        if receipt_target.exists() or receipt_target.is_symlink():
            # Validate the durable receipt against the exact local generation
            # before recreating any missing offsite pair.
            local_receipt = strict_json(receipt_target, maximum_bytes=MAX_MANIFEST_BYTES)
            assert_receipt_matches_local_generation(local_receipt, metadata, archive)
            receipt_timestamps(local_receipt)
            receipt_committed = True

        if target_archive.exists() and target_metadata.exists():
            verify_pair(str(offsite_dir), name)
            if (
                target_archive.stat().st_size != archive.stat().st_size
                or not hmac.compare_digest(sha256_file(target_archive), sha256_file(archive))
            ):
                raise BootstrapBackupError("Offsite generation conflicts with the local backup")
        else:
            copy_regular_exclusive(archive, partial_archive)
            copy_regular_exclusive(metadata_path, partial_metadata)
            publish_exclusive(partial_archive, target_archive)
            created_targets.append(target_archive)
            # Make archive-first ordering durable. Without this barrier a
            # crash can persist metadata but lose the archive dirent.
            fsync_directory(offsite_dir)
            publish_exclusive(partial_metadata, target_metadata)
            created_targets.append(target_metadata)
            fsync_directory(offsite_dir)
            verify_pair(str(offsite_dir), name)

        if receipt_target.exists() or receipt_target.is_symlink():
            verified_receipt = verify_offsite_receipt(str(offsite_dir), str(receipt_dir), name)
            assert_receipt_matches_local_generation(verified_receipt, metadata, archive)
            return receipt_target

        exported_at, _ = utc_timestamp()
        receipt_value = {
            "format": "gshsapp-offsite-receipt",
            "version": 1,
            "file": name,
            "createdAt": metadata["createdAt"],
            "exportedAt": exported_at,
            "size": metadata["size"],
            "sha256": metadata["sha256"],
        }
        with receipt_partial.open("x", encoding="utf-8", newline="\n") as receipt_file:
            json.dump(receipt_value, receipt_file, separators=(",", ":"), ensure_ascii=False)
            receipt_file.write("\n")
            receipt_file.flush()
            os.fsync(receipt_file.fileno())
        receipt_partial.chmod(0o600)
        publish_exclusive(receipt_partial, receipt_target)
        receipt_created = True
        fsync_directory(receipt_dir)
        receipt_committed = True
        verified_receipt = verify_offsite_receipt(str(offsite_dir), str(receipt_dir), name)
        assert_receipt_matches_local_generation(verified_receipt, metadata, archive)
        return receipt_target
    except Exception:
        partial_archive.unlink(missing_ok=True)
        partial_metadata.unlink(missing_ok=True)
        receipt_partial.unlink(missing_ok=True)
        if not receipt_committed:
            if receipt_created:
                receipt_target.unlink(missing_ok=True)
                fsync_directory(receipt_dir)
            for target in reversed(created_targets):
                target.unlink(missing_ok=True)
        if created_targets and not receipt_committed:
            fsync_directory(offsite_dir)
        raise


def verify_offsite_receipt(offsite_dir_raw: str, receipt_dir_raw: str, name: str) -> dict[str, object]:
    offsite_dir, archive, _metadata_path = resolve_pair(offsite_dir_raw, name)
    receipt_dir = require_real_directory(receipt_dir_raw)
    metadata = verify_pair(str(offsite_dir), name)
    receipt_path = receipt_dir / f"{name}.receipt.json"
    receipt = strict_json(receipt_path, maximum_bytes=MAX_MANIFEST_BYTES)
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        raise BootstrapBackupError("Offsite receipt shape is invalid")
    if (
        receipt.get("format") != "gshsapp-offsite-receipt"
        or receipt.get("version") != 1
        or receipt.get("file") != name
        or receipt.get("createdAt") != metadata.get("createdAt")
        or receipt.get("size") != archive.stat().st_size
        or receipt.get("sha256") != metadata.get("sha256")
        or require_canonical_timestamp(receipt.get("exportedAt")) == ""
    ):
        raise BootstrapBackupError("Offsite receipt does not match the exported generation")
    return receipt


def assert_receipt_matches_local_generation(
    receipt: object,
    metadata: dict[str, object],
    archive: Path,
) -> None:
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        raise BootstrapBackupError("Offsite receipt shape is invalid")
    receipt_digest = receipt.get("sha256")
    metadata_digest = metadata.get("sha256")
    if (
        receipt.get("format") != "gshsapp-offsite-receipt"
        or receipt.get("version") != 1
        or receipt.get("file") != archive.name
        or receipt.get("createdAt") != metadata.get("createdAt")
        or receipt.get("size") != archive.stat().st_size
        or receipt.get("size") != metadata.get("size")
        or not isinstance(receipt_digest, str)
        or not isinstance(metadata_digest, str)
        or not hmac.compare_digest(receipt_digest, metadata_digest)
    ):
        raise BootstrapBackupError("Offsite receipt does not identify the local generation")


def receipt_timestamps(receipt: dict[str, object]) -> tuple[dt.datetime, dt.datetime]:
    created_text = require_canonical_timestamp(receipt.get("createdAt"))
    exported_text = require_canonical_timestamp(receipt.get("exportedAt"))
    created_at = dt.datetime.strptime(created_text, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
        tzinfo=dt.timezone.utc
    )
    exported_at = dt.datetime.strptime(exported_text, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
        tzinfo=dt.timezone.utc
    )
    if exported_at < created_at:
        raise BootstrapBackupError("Offsite receipt predates its backup generation")
    return created_at, exported_at


def parse_receipt_for_selection(receipt_dir: Path, name: str) -> tuple[dict[str, object], dt.datetime]:
    receipt = strict_json(receipt_dir / f"{name}.receipt.json", maximum_bytes=MAX_MANIFEST_BYTES)
    if not isinstance(receipt, dict) or set(receipt) != RECEIPT_KEYS:
        raise BootstrapBackupError("Offsite receipt shape is invalid")
    size = receipt.get("size")
    digest = receipt.get("sha256")
    if (
        receipt.get("format") != "gshsapp-offsite-receipt"
        or receipt.get("version") != 1
        or receipt.get("file") != name
        or type(size) is not int
        or not 1 <= size <= MAX_COMPRESSED_ARCHIVE_BYTES
        or not isinstance(digest, str)
        or re.fullmatch(r"[a-f0-9]{64}", digest) is None
    ):
        raise BootstrapBackupError("Offsite receipt identity is invalid")
    _created_at, exported_at = receipt_timestamps(receipt)
    return receipt, exported_at


def has_fresh_verified_offsite_receipt(
    offsite_dir_raw: str,
    receipt_dir_raw: str,
    freshness_hours: int,
    *,
    now: dt.datetime | None = None,
) -> bool:
    """Return true only when the newest bounded receipt and its offsite pair verify."""
    if type(freshness_hours) is not int or not 1 <= freshness_hours <= 24:
        raise BootstrapBackupError("Backup freshness hours are invalid")
    effective_now = dt.datetime.now(dt.timezone.utc) if now is None else now
    if effective_now.tzinfo != dt.timezone.utc:
        raise BootstrapBackupError("Backup freshness clock must be UTC")

    receipt_dir = require_real_directory(receipt_dir_raw)
    latest: tuple[dt.datetime, str, dict[str, object]] | None = None
    for entry in bounded_receipt_entries(receipt_dir):
        match = RECEIPT_NAME.fullmatch(entry.name)
        if match is None:
            continue
        name = match.group(1)
        receipt, exported_at = parse_receipt_for_selection(receipt_dir, name)
        candidate = (exported_at, name, receipt)
        if latest is None or candidate[:2] > latest[:2]:
            latest = candidate
    if latest is None:
        return False

    selected_exported_at, selected_name, selected_receipt = latest
    try:
        verified_receipt = verify_offsite_receipt(offsite_dir_raw, receipt_dir_raw, selected_name)
    except OSError as error:
        raise BootstrapBackupError("Newest offsite backup pair is missing or unreadable") from error
    if verified_receipt != selected_receipt:
        raise BootstrapBackupError("Offsite receipt changed while freshness was verified")
    verified_created_at, verified_exported_at = receipt_timestamps(verified_receipt)
    if verified_exported_at != selected_exported_at:
        raise BootstrapBackupError("Offsite receipt timestamp changed while it was verified")
    future_limit = effective_now + dt.timedelta(minutes=5)
    if verified_created_at > future_limit or verified_exported_at > future_limit:
        raise BootstrapBackupError("Offsite receipt timestamp is in the future")
    freshness = dt.timedelta(hours=freshness_hours)
    return (
        effective_now - verified_created_at < freshness
        and effective_now - verified_exported_at < freshness
    )


def parse_freshness_hours(value: str) -> int:
    if re.fullmatch(r"[1-9][0-9]*", value) is None:
        raise argparse.ArgumentTypeError("freshness hours must be a canonical positive integer")
    parsed = int(value)
    if not 1 <= parsed <= 24:
        raise argparse.ArgumentTypeError("freshness hours must be between 1 and 24")
    return parsed


def extract_pair(backup_dir_raw: str, name: str, output_raw: str) -> None:
    _backup_dir, archive, _metadata = resolve_pair(backup_dir_raw, name)
    verify_pair(backup_dir_raw, name)
    output = Path(os.path.abspath(output_raw))
    parent = require_real_directory(str(output.parent))
    if output.exists() or output.is_symlink():
        raise BootstrapBackupError("Restore output must not already exist")
    work = Path(tempfile.mkdtemp(prefix=".restore-", dir=parent))
    work.chmod(0o700)
    private_archive = work / "generation.tar.gz"
    payload_root = work / "payload"
    payload_root.mkdir(mode=0o700)
    try:
        copy_regular_exclusive(archive, private_archive)
        validate_archive(private_archive)
        with tarfile.open(private_archive, mode="r:gz") as bundle:
            manifest_member = bundle.getmember("manifest.json")
            manifest_stream = bundle.extractfile(manifest_member)
            if manifest_stream is None:
                raise BootstrapBackupError("Backup archive manifest is missing")
            _created_at, roots, files = validate_manifest(decode_strict_json(manifest_stream.read(MAX_MANIFEST_BYTES + 1)))
            for directory in staged_directories(files, roots):
                destination = payload_root.joinpath(*directory.split("/"))
                destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            for item in files:
                relative = str(item["path"])
                member = bundle.getmember(relative)
                stream = bundle.extractfile(member)
                if stream is None:
                    raise BootstrapBackupError("Backup archive payload is missing")
                destination = payload_root.joinpath(*relative.split("/"))
                digest = hashlib.sha256()
                total = 0
                with destination.open("xb") as output_file:
                    while True:
                        block = stream.read(1024 * 1024)
                        if not block:
                            break
                        total += len(block)
                        if total > int(item["size"]):
                            raise BootstrapBackupError("Backup archive payload exceeds its declared length")
                        digest.update(block)
                        output_file.write(block)
                    output_file.flush()
                    os.fsync(output_file.fileno())
                destination.chmod(0o600)
                if total != item["size"] or not hmac.compare_digest(digest.hexdigest(), str(item["sha256"])):
                    raise BootstrapBackupError("Backup archive checksum validation failed")
        validate_sqlite(payload_root / "database" / "dev.db")
        os.replace(payload_root, output)
        fsync_directory(parent)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def parse_timestamp(value: object) -> dt.datetime:
    canonical = require_canonical_timestamp(value)
    return dt.datetime.strptime(canonical, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=dt.timezone.utc)


def prune_confirmed_generations(
    backup_dir_raw: str,
    offsite_dir_raw: str,
    receipt_dir_raw: str,
    *,
    minimum_generations: int = 3,
    maximum_generations: int = 14,
    maximum_age_days: int = 30,
    maximum_total_bytes: int = 20 * 1024 * 1024 * 1024,
) -> list[str]:
    if (
        minimum_generations < 1
        or maximum_generations < minimum_generations
        or maximum_age_days < 1
        or maximum_total_bytes < 1024 * 1024
    ):
        raise BootstrapBackupError("Backup retention policy is invalid")
    backup_dir = require_real_directory(backup_dir_raw)
    generations: list[dict[str, object]] = []
    for archive in bounded_directory_entries(backup_dir):
        if not archive.is_file() or archive.is_symlink() or BACKUP_NAME.fullmatch(archive.name) is None:
            continue
        metadata_path = backup_dir / f"{archive.name}.json"
        if not metadata_path.exists():
            # Archive-first deletion is the durable retention order. A prior
            # interrupted prune may therefore leave only an archive. It is
            # safe to remove that strict-name orphan after proving that the
            # offsite generation and root receipt still match it.
            try:
                verify_offsite_receipt(offsite_dir_raw, receipt_dir_raw, archive.name)
            except (BootstrapBackupError, FileNotFoundError):
                # A create crash may publish the archive but never publish its
                # companion metadata. It was never a committed generation and
                # may be removed locally after strict archive validation.
                validate_archive(archive)
            else:
                offsite_archive = require_real_directory(offsite_dir_raw) / archive.name
                if (
                    archive.stat().st_size != offsite_archive.stat().st_size
                    or not hmac.compare_digest(sha256_file(archive), sha256_file(offsite_archive))
                ):
                    raise BootstrapBackupError("Local orphan does not match its offsite generation")
            archive.unlink()
            fsync_directory(backup_dir)
            continue
        metadata = verify_pair(str(backup_dir), archive.name)
        generations.append({
            "name": archive.name,
            "created": parse_timestamp(metadata["createdAt"]),
            "bytes": archive.stat().st_size + metadata_path.stat().st_size,
        })
    generations.sort(key=lambda generation: (generation["created"], generation["name"]))
    total_bytes = sum(int(generation["bytes"]) for generation in generations)
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=maximum_age_days)
    removed: list[str] = []
    while len(generations) > minimum_generations:
        oldest = generations[0]
        violates_age = oldest["created"] < cutoff
        violates_count = len(generations) > maximum_generations
        violates_bytes = total_bytes > maximum_total_bytes
        if not (violates_age or violates_count or violates_bytes):
            break
        name = str(oldest["name"])
        archive_path = backup_dir / name
        metadata = verify_pair(str(backup_dir), name)
        receipt = verify_offsite_receipt(offsite_dir_raw, receipt_dir_raw, name)
        assert_receipt_matches_local_generation(receipt, metadata, archive_path)
        archive_path.unlink()
        fsync_directory(backup_dir)
        metadata_path = backup_dir / f"{name}.json"
        metadata_path.unlink()
        fsync_directory(backup_dir)
        removed.append(name)
        total_bytes -= int(oldest["bytes"])
        generations.pop(0)
    if (
        len(generations) > maximum_generations
        or total_bytes > maximum_total_bytes
        or (len(generations) > minimum_generations and generations[0]["created"] < cutoff)
    ):
        raise BootstrapBackupError("Retention limits could not be met without an offsite-confirmed generation")
    return removed


def publish_exclusive(partial: Path, target: Path) -> None:
    if target.exists() or target.is_symlink():
        raise BootstrapBackupError("Backup target already exists or could not be published")
    try:
        if os.name == "nt":
            # Windows rename is no-replace. This branch exists only for the
            # cross-platform policy tests; production uses renameat2 below.
            os.rename(partial, target)
        else:
            libc = ctypes.CDLL(None, use_errno=True)
            renameat2 = libc.renameat2
            renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            renameat2.restype = ctypes.c_int
            if renameat2(
                getattr(os, "AT_FDCWD", -100),
                os.fsencode(partial),
                getattr(os, "AT_FDCWD", -100),
                os.fsencode(target),
                1,  # RENAME_NOREPLACE
            ) != 0:
                error = ctypes.get_errno()
                raise OSError(error, os.strerror(error))
    except OSError as error:
        raise BootstrapBackupError("Backup target already exists or could not be published") from error


def require_cleanup_file(path: Path, message: str) -> os.stat_result:
    try:
        identity = path.lstat()
    except OSError as error:
        raise BootstrapBackupError(message) from error
    if path.is_symlink() or not stat.S_ISREG(identity.st_mode) or identity.st_nlink != 1:
        raise BootstrapBackupError(message)
    return identity


def validate_unpaired_metadata(path: Path, expected_name: str) -> None:
    require_cleanup_file(path, "Interrupted local metadata is unsafe")
    value = strict_json(path, maximum_bytes=MAX_MANIFEST_BYTES)
    if (
        not isinstance(value, dict)
        or set(value) != METADATA_KEYS
        or value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("file") != expected_name
        or value.get("reason") not in ALLOWED_REASONS
        or not isinstance(value.get("size"), int)
        or value["size"] < 1
        or value["size"] > MAX_COMPRESSED_ARCHIVE_BYTES
        or re.fullmatch(r"[0-9a-f]{64}", str(value.get("sha256", ""))) is None
        or require_canonical_timestamp(value.get("createdAt")) == ""
    ):
        raise BootstrapBackupError("Interrupted local metadata is malformed")


def recover_local_publication_state(backup_dir_raw: str) -> None:
    """Remove only strict crash debris while the caller holds the lifecycle lock."""
    backup_dir = require_real_directory(backup_dir_raw)
    changed = False
    for entry in bounded_directory_entries(backup_dir):
        if CREATE_WORK_NAME.fullmatch(entry.name):
            identity = entry.lstat()
            if entry.is_symlink() or not stat.S_ISDIR(identity.st_mode):
                raise BootstrapBackupError("Interrupted backup staging state is unsafe")
            shutil.rmtree(entry)
            changed = True
            continue
        if LOCAL_ARCHIVE_PARTIAL_NAME.fullmatch(entry.name) or LOCAL_METADATA_PARTIAL_NAME.fullmatch(entry.name):
            require_cleanup_file(entry, "Interrupted local partial state is unsafe")
            entry.unlink()
            changed = True
    if changed:
        fsync_directory(backup_dir)

    archives = {
        entry.name: entry
        for entry in bounded_directory_entries(backup_dir)
        if BACKUP_NAME.fullmatch(entry.name)
    }
    metadata_names = {
        entry.name[:-5]: entry
        for entry in bounded_directory_entries(backup_dir)
        if entry.name.endswith(".tar.gz.json") and BACKUP_NAME.fullmatch(entry.name[:-5])
    }
    for name in sorted(set(archives) | set(metadata_names)):
        archive = archives.get(name)
        metadata = metadata_names.get(name)
        if archive is not None and metadata is not None:
            continue
        if archive is not None:
            require_cleanup_file(archive, "Interrupted local archive is unsafe")
            validate_archive(archive)
            archive.unlink()
            fsync_directory(backup_dir)
        elif metadata is not None:
            validate_unpaired_metadata(metadata, name)
            metadata.unlink()
            fsync_directory(backup_dir)


def reconcile_backup_state(
    backup_dir_raw: str,
    offsite_dir_raw: str,
    receipt_dir_raw: str,
) -> list[str]:
    """Recover crash debris and finish exporting every committed local pair."""
    recover_local_publication_state(backup_dir_raw)
    backup_dir = require_real_directory(backup_dir_raw)
    offsite_dir = require_real_directory(offsite_dir_raw)
    receipt_dir = require_real_directory(receipt_dir_raw)
    committed: list[tuple[dt.datetime, str]] = []
    for archive in bounded_directory_entries(backup_dir):
        if BACKUP_NAME.fullmatch(archive.name) is None:
            continue
        require_cleanup_file(archive, "Local backup generation is unsafe")
        metadata = verify_pair(str(backup_dir), archive.name)
        committed.append((parse_timestamp(metadata["createdAt"]), archive.name))
    committed.sort()
    exported: list[str] = []
    for _created, name in committed:
        already_complete = all(
            path.exists() and not path.is_symlink()
            for path in (
                offsite_dir / name,
                offsite_dir / f"{name}.json",
                receipt_dir / f"{name}.receipt.json",
            )
        )
        export_offsite_pair(str(backup_dir), name, str(offsite_dir), str(receipt_dir))
        if not already_complete:
            exported.append(name)
    return exported


def create_backup(
    database_raw: str,
    data_root_raw: str,
    backup_dir_raw: str,
    *,
    reason: str = "predeployment-bootstrap",
) -> str:
    if reason not in ALLOWED_REASONS:
        raise BootstrapBackupError("Backup reason is invalid")
    data_root = require_real_directory(data_root_raw)
    backup_dir = require_real_directory(backup_dir_raw, create=True)
    recover_local_publication_state(str(backup_dir))
    database, identity = require_database(database_raw, data_root)
    if identity.st_size > MAX_DATABASE_BYTES:
        raise BootstrapBackupError("Database exceeds the bootstrap backup limit")
    content_bytes, _content_files = estimate_content_roots(data_root)
    estimated_database = min(max(identity.st_size, 4096), MAX_DATABASE_BYTES)
    estimated_generation = estimated_database + content_bytes
    if estimated_generation > MAX_ARCHIVE_TOTAL_BYTES:
        raise BootstrapBackupError("Complete backup exceeds the shared archive limit")
    # One uncompressed staging generation plus a worst-case uncompressed tar
    # copy (headers/compression overhead included) must fit without consuming
    # the operational reserve.
    required_bytes = estimated_generation * 2 + max(64 * 1024, estimated_generation // 100) + RESERVE_BYTES
    if shutil.disk_usage(backup_dir).free < required_bytes:
        raise BootstrapBackupError("Insufficient free space for a durable complete backup")

    created_at, filename_time = utc_timestamp()
    name = f"backup-{filename_time}-{secrets.token_hex(4)}.tar.gz"
    target = backup_dir / name
    metadata_target = backup_dir / f"{name}.json"
    archive_partial = backup_dir / f".{name}.partial"
    metadata_partial = backup_dir / f".{name}.json.partial"
    work = Path(tempfile.mkdtemp(prefix=".create-", dir=backup_dir))
    work.chmod(0o700)
    published_archive = False
    published_metadata = False
    try:
        staging = work / "staging"
        (staging / "database").mkdir(parents=True, mode=0o700)
        snapshot = staging / "database" / "dev.db"
        create_online_snapshot(database, identity, snapshot)
        snapshot_size = snapshot.stat().st_size
        if shutil.disk_usage(backup_dir).free < snapshot_size + RESERVE_BYTES:
            raise BootstrapBackupError("Insufficient free space to archive the bootstrap snapshot")
        snapshot_hash = sha256_file(snapshot)
        included_roots, content_files = copy_content_roots(data_root, staging)
        files = [
            {"path": "database/dev.db", "size": snapshot_size, "sha256": snapshot_hash},
            *content_files,
        ]
        files.sort(key=lambda item: str(item["path"]))
        manifest = {
            "format": "gshsapp-backup",
            "version": 2,
            "createdAt": created_at,
            "database": "database/dev.db",
            "contentRoots": included_roots,
            "files": files,
        }
        manifest_bytes = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if len(manifest_bytes) > MAX_MANIFEST_BYTES:
            raise BootstrapBackupError("Backup manifest exceeds its limit")
        staged_bytes = sum(int(item["size"]) for item in files)
        if staged_bytes > MAX_ARCHIVE_TOTAL_BYTES or len(files) + len(staged_directories(files, included_roots)) + 1 > MAX_ARCHIVE_ENTRIES:
            raise BootstrapBackupError("Complete backup exceeds the shared archive policy")
        archive_reserve = staged_bytes + max(64 * 1024, staged_bytes // 100) + RESERVE_BYTES
        if shutil.disk_usage(backup_dir).free < archive_reserve:
            raise BootstrapBackupError("Insufficient free space to publish the complete backup")
        write_archive(archive_partial, manifest_bytes, staging, files, included_roots)
        validate_archive(archive_partial)
        publish_exclusive(archive_partial, target)
        published_archive = True

        metadata_value = {
            "format": "gshsapp-backup",
            "version": 2,
            "file": name,
            "createdAt": created_at,
            "reason": reason,
            "size": target.stat().st_size,
            "sha256": sha256_file(target),
        }
        with metadata_partial.open("x", encoding="utf-8", newline="\n") as metadata_file:
            json.dump(metadata_value, metadata_file, indent=2, ensure_ascii=False)
            metadata_file.write("\n")
            metadata_file.flush()
            os.fsync(metadata_file.fileno())
        metadata_partial.chmod(0o600)
        publish_exclusive(metadata_partial, metadata_target)
        published_metadata = True
        fsync_directory(backup_dir)
        verify_pair(str(backup_dir), name)
        return name
    finally:
        shutil.rmtree(work, ignore_errors=True)
        archive_partial.unlink(missing_ok=True)
        metadata_partial.unlink(missing_ok=True)
        if sys.exc_info()[0] is not None:
            if published_metadata:
                metadata_target.unlink(missing_ok=True)
            if published_archive:
                target.unlink(missing_ok=True)
            fsync_directory(backup_dir)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--database", required=True)
    create.add_argument("--data-root", required=True)
    create.add_argument("--backup-dir", required=True)
    create.add_argument("--reason", choices=sorted(ALLOWED_REASONS), default="predeployment-bootstrap")
    verify = commands.add_parser("verify")
    verify.add_argument("--backup-dir", required=True)
    verify.add_argument("--name", required=True)
    export = commands.add_parser("export-offsite")
    export.add_argument("--backup-dir", required=True)
    export.add_argument("--name", required=True)
    export.add_argument("--offsite-dir", required=True)
    export.add_argument("--receipt-dir", required=True)
    verify_receipt = commands.add_parser("verify-receipt")
    verify_receipt.add_argument("--offsite-dir", required=True)
    verify_receipt.add_argument("--receipt-dir", required=True)
    verify_receipt.add_argument("--name", required=True)
    fresh_offsite = commands.add_parser("fresh-offsite")
    fresh_offsite.add_argument("--offsite-dir", required=True)
    fresh_offsite.add_argument("--receipt-dir", required=True)
    fresh_offsite.add_argument("--freshness-hours", required=True, type=parse_freshness_hours)
    extract = commands.add_parser("extract")
    extract.add_argument("--backup-dir", required=True)
    extract.add_argument("--name", required=True)
    extract.add_argument("--output", required=True)
    reconcile = commands.add_parser("reconcile")
    reconcile.add_argument("--backup-dir", required=True)
    reconcile.add_argument("--offsite-dir", required=True)
    reconcile.add_argument("--receipt-dir", required=True)
    prune = commands.add_parser("prune")
    prune.add_argument("--backup-dir", required=True)
    prune.add_argument("--offsite-dir", required=True)
    prune.add_argument("--receipt-dir", required=True)
    prune.add_argument("--minimum-generations", type=int, default=3)
    prune.add_argument("--maximum-generations", type=int, default=14)
    prune.add_argument("--maximum-age-days", type=int, default=30)
    prune.add_argument("--maximum-total-bytes", type=int, default=20 * 1024 * 1024 * 1024)
    return result


def main() -> int:
    arguments = parser().parse_args()
    try:
        if arguments.command == "create":
            print(create_backup(arguments.database, arguments.data_root, arguments.backup_dir, reason=arguments.reason))
        elif arguments.command == "verify":
            verify_pair(arguments.backup_dir, arguments.name)
        elif arguments.command == "export-offsite":
            print(export_offsite_pair(
                arguments.backup_dir,
                arguments.name,
                arguments.offsite_dir,
                arguments.receipt_dir,
            ))
        elif arguments.command == "verify-receipt":
            verify_offsite_receipt(arguments.offsite_dir, arguments.receipt_dir, arguments.name)
        elif arguments.command == "fresh-offsite":
            return 0 if has_fresh_verified_offsite_receipt(
                arguments.offsite_dir,
                arguments.receipt_dir,
                arguments.freshness_hours,
            ) else STALE_OFFSITE_EXIT_STATUS
        elif arguments.command == "extract":
            extract_pair(arguments.backup_dir, arguments.name, arguments.output)
        elif arguments.command == "reconcile":
            for exported in reconcile_backup_state(
                arguments.backup_dir,
                arguments.offsite_dir,
                arguments.receipt_dir,
            ):
                print(exported)
        else:
            for removed in prune_confirmed_generations(
                arguments.backup_dir,
                arguments.offsite_dir,
                arguments.receipt_dir,
                minimum_generations=arguments.minimum_generations,
                maximum_generations=arguments.maximum_generations,
                maximum_age_days=arguments.maximum_age_days,
                maximum_total_bytes=arguments.maximum_total_bytes,
            ):
                print(removed)
        return 0
    except (BootstrapBackupError, OSError) as error:
        print(f"Bootstrap backup failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
