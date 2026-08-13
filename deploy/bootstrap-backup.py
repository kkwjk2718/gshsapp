#!/usr/bin/env python3
"""Create and verify a DB-only bootstrap backup without using a candidate image on live data."""

from __future__ import annotations

import argparse
import datetime as dt
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
from urllib.parse import quote


BACKUP_NAME = re.compile(r"backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz\Z")
SQLITE_HEADER = b"SQLite format 3\x00"
MAX_DATABASE_BYTES = 512 * 1024 * 1024
MAX_MANIFEST_BYTES = 64 * 1024
RESERVE_BYTES = 256 * 1024 * 1024
METADATA_KEYS = {"format", "version", "file", "createdAt", "reason", "size", "sha256"}
MANIFEST_KEYS = {"format", "version", "createdAt", "database", "contentRoots", "files"}
CANONICAL_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\Z")


class BootstrapBackupError(RuntimeError):
    pass


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
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


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


def write_archive(target: Path, manifest_bytes: bytes, snapshot: Path) -> None:
    with target.open("xb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                archive.addfile(tar_info("manifest.json", size=len(manifest_bytes)), fileobj=_BytesReader(manifest_bytes))
                archive.addfile(tar_info("database", directory=True))
                with snapshot.open("rb") as database:
                    archive.addfile(tar_info("database/dev.db", size=snapshot.stat().st_size), fileobj=database)
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


def validate_manifest(value: object, database_size: int, database_hash: str) -> str:
    if not isinstance(value, dict) or set(value) != MANIFEST_KEYS:
        raise BootstrapBackupError("Backup manifest shape is invalid")
    if (
        value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("database") != "database/dev.db"
        or value.get("contentRoots") != []
    ):
        raise BootstrapBackupError("Backup manifest identity is invalid")
    files = value.get("files")
    expected = [{"path": "database/dev.db", "size": database_size, "sha256": database_hash}]
    if files != expected:
        raise BootstrapBackupError("Backup manifest file list is invalid")
    return require_canonical_timestamp(value.get("createdAt"))


def validate_archive(archive_path: Path) -> str:
    listed = archive_path.lstat()
    if not stat.S_ISREG(listed.st_mode) or archive_path.is_symlink():
        raise BootstrapBackupError("Backup archive must be a regular file")
    extraction_root = Path(tempfile.mkdtemp(prefix=".bootstrap-verify-", dir=archive_path.parent))
    extraction_root.chmod(0o700)
    try:
        database_copy = extraction_root / "dev.db"
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members = archive.getmembers()
            expected = [
                ("manifest.json", True, False),
                ("database", False, True),
                ("database/dev.db", True, False),
            ]
            if len(members) != len(expected):
                raise BootstrapBackupError("Backup archive entry count is invalid")
            for member, (name, regular, directory) in zip(members, expected, strict=True):
                if member.name.rstrip("/") != name or member.isreg() != regular or member.isdir() != directory:
                    raise BootstrapBackupError("Backup archive layout is invalid")
                if member.issym() or member.islnk() or member.isdev() or member.size < 0:
                    raise BootstrapBackupError("Backup archive contains an unsafe entry")
            manifest_member = members[0]
            database_member = members[2]
            if manifest_member.size > MAX_MANIFEST_BYTES or database_member.size > MAX_DATABASE_BYTES:
                raise BootstrapBackupError("Backup archive entry exceeds its limit")
            manifest_stream = archive.extractfile(manifest_member)
            database_stream = archive.extractfile(database_member)
            if manifest_stream is None or database_stream is None:
                raise BootstrapBackupError("Backup archive payload is missing")
            manifest_bytes = manifest_stream.read(MAX_MANIFEST_BYTES + 1)
            if len(manifest_bytes) != manifest_member.size:
                raise BootstrapBackupError("Backup manifest length changed")
            digest = hashlib.sha256()
            total = 0
            with database_copy.open("xb") as output:
                while True:
                    block = database_stream.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > MAX_DATABASE_BYTES:
                        raise BootstrapBackupError("Backup database exceeds its limit")
                    digest.update(block)
                    output.write(block)
                output.flush()
                os.fsync(output.fileno())
            if total != database_member.size:
                raise BootstrapBackupError("Backup database length changed")
            manifest = decode_strict_json(manifest_bytes)
            manifest_timestamp = validate_manifest(manifest, total, digest.hexdigest())
        validate_sqlite(database_copy)
        return manifest_timestamp
    except (tarfile.TarError, OSError) as error:
        raise BootstrapBackupError("Backup archive validation failed") from error
    finally:
        shutil.rmtree(extraction_root, ignore_errors=True)


def validate_metadata(value: object, archive_path: Path, manifest_timestamp: str) -> None:
    if not isinstance(value, dict) or set(value) != METADATA_KEYS:
        raise BootstrapBackupError("Backup metadata shape is invalid")
    size = value.get("size")
    digest = value.get("sha256")
    if (
        value.get("format") != "gshsapp-backup"
        or value.get("version") != 2
        or value.get("file") != archive_path.name
        or value.get("reason") != "predeployment-bootstrap"
        or require_canonical_timestamp(value.get("createdAt")) != manifest_timestamp
        or type(size) is not int
        or size != archive_path.stat().st_size
        or not isinstance(digest, str)
        or re.fullmatch(r"[a-f0-9]{64}", digest) is None
        or not hmac.compare_digest(digest, sha256_file(archive_path))
    ):
        raise BootstrapBackupError("Backup metadata does not match the archive")


def resolve_pair(backup_dir_raw: str, name: str) -> tuple[Path, Path, Path]:
    backup_dir = require_real_directory(backup_dir_raw)
    if BACKUP_NAME.fullmatch(name) is None or Path(name).name != name:
        raise BootstrapBackupError("Backup name is invalid")
    archive = backup_dir / name
    metadata = backup_dir / f"{name}.json"
    return backup_dir, archive, metadata


def verify_pair(backup_dir_raw: str, name: str) -> None:
    _backup_dir, archive, metadata = resolve_pair(backup_dir_raw, name)
    manifest_timestamp = validate_archive(archive)
    validate_metadata(strict_json(metadata, maximum_bytes=MAX_MANIFEST_BYTES), archive, manifest_timestamp)


def publish_exclusive(partial: Path, target: Path) -> None:
    try:
        os.link(partial, target, follow_symlinks=False)
    except OSError as error:
        raise BootstrapBackupError("Backup target already exists or could not be published") from error
    partial.unlink()


def create_backup(database_raw: str, data_root_raw: str, backup_dir_raw: str) -> str:
    data_root = require_real_directory(data_root_raw)
    backup_dir = require_real_directory(backup_dir_raw, create=True)
    database, identity = require_database(database_raw, data_root)
    if identity.st_size > MAX_DATABASE_BYTES:
        raise BootstrapBackupError("Database exceeds the bootstrap backup limit")
    estimated = min(max(identity.st_size, 4096), MAX_DATABASE_BYTES)
    if shutil.disk_usage(backup_dir).free < estimated * 2 + RESERVE_BYTES:
        raise BootstrapBackupError("Insufficient free space for a durable bootstrap backup")

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
        snapshot = work / "dev.db"
        create_online_snapshot(database, identity, snapshot)
        snapshot_size = snapshot.stat().st_size
        if shutil.disk_usage(backup_dir).free < snapshot_size + RESERVE_BYTES:
            raise BootstrapBackupError("Insufficient free space to archive the bootstrap snapshot")
        snapshot_hash = sha256_file(snapshot)
        manifest = {
            "format": "gshsapp-backup",
            "version": 2,
            "createdAt": created_at,
            "database": "database/dev.db",
            "contentRoots": [],
            "files": [{"path": "database/dev.db", "size": snapshot_size, "sha256": snapshot_hash}],
        }
        manifest_bytes = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if len(manifest_bytes) > MAX_MANIFEST_BYTES:
            raise BootstrapBackupError("Backup manifest exceeds its limit")
        write_archive(archive_partial, manifest_bytes, snapshot)
        validate_archive(archive_partial)
        publish_exclusive(archive_partial, target)
        published_archive = True

        metadata_value = {
            "format": "gshsapp-backup",
            "version": 2,
            "file": name,
            "createdAt": created_at,
            "reason": "predeployment-bootstrap",
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
    verify = commands.add_parser("verify")
    verify.add_argument("--backup-dir", required=True)
    verify.add_argument("--name", required=True)
    return result


def main() -> int:
    arguments = parser().parse_args()
    try:
        if arguments.command == "create":
            print(create_backup(arguments.database, arguments.data_root, arguments.backup_dir))
        else:
            verify_pair(arguments.backup_dir, arguments.name)
        return 0
    except (BootstrapBackupError, OSError) as error:
        print(f"Bootstrap backup failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
