#!/usr/bin/env python3
"""Validate a candidate-produced SQLite database using root-reviewed invariants."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import stat
import sys
from pathlib import Path


CURRENT_SCHEMA_FINGERPRINT = "9c68d972a79c850bdf7bccf8a5bcacfccfac2632a199f811e152afd05bf3a366"
MAX_DATABASE_BYTES = 512 * 1024 * 1024
ALLOWED_ROLES = ("STUDENT", "TEACHER", "ADMIN", "BROADCAST", "GRADUATE")


class DatabaseValidationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise DatabaseValidationError(message)


def schema_fingerprint(connection: sqlite3.Connection) -> str:
    rows = []
    for object_type, name, table_name, sql in connection.execute(
        """
        SELECT type, name, tbl_name, sql
        FROM sqlite_master
        WHERE type IN ('table', 'index', 'trigger', 'view')
          AND name NOT LIKE 'sqlite_%'
          AND name <> '_prisma_migrations'
          AND tbl_name <> '_prisma_migrations'
        ORDER BY type, name
        """
    ):
        rows.append(
            {
                "type": object_type,
                "name": name,
                "tableName": table_name,
                "sql": sql.replace("\r\n", "\n") if isinstance(sql, str) else sql,
            }
        )
    encoded = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def scalar(connection: sqlite3.Connection, sql: str, parameters: tuple[object, ...] = ()) -> int:
    row = connection.execute(sql, parameters).fetchone()
    if row is None or not isinstance(row[0], int):
        fail("SQLite invariant query returned an invalid result")
    return row[0]


def validate_database(raw_path: str | os.PathLike[str]) -> None:
    path = Path(raw_path)
    try:
        listed = path.lstat()
    except OSError as error:
        raise DatabaseValidationError("Candidate database is unavailable") from error
    if path.is_symlink() or not stat.S_ISREG(listed.st_mode) or listed.st_nlink != 1:
        fail("Candidate database must be one unaliased regular file")
    if listed.st_size <= 0 or listed.st_size > MAX_DATABASE_BYTES:
        fail("Candidate database size is outside the reviewed boundary")

    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    try:
        connection = sqlite3.connect(uri, uri=True, timeout=5)
    except sqlite3.Error as error:
        raise DatabaseValidationError("Candidate database could not be opened read-only") from error
    try:
        connection.execute("PRAGMA query_only=ON")
        quick_check = connection.execute("PRAGMA quick_check").fetchall()
        if quick_check != [("ok",)]:
            fail("Candidate database quick_check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            fail("Candidate database contains foreign-key violations")
        executable = scalar(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('trigger','view') AND name NOT LIKE 'sqlite_%'",
        )
        if executable != 0:
            fail("Candidate database contains executable schema objects")
        if schema_fingerprint(connection) != CURRENT_SCHEMA_FINGERPRINT:
            fail("Candidate database schema is not the reviewed production schema")
        admin_count = scalar(connection, 'SELECT COUNT(*) FROM "User" WHERE role = ?', ("ADMIN",))
        if admin_count < 1 or admin_count > 1_000:
            fail("Candidate database administrator invariant failed")
        placeholders = ",".join("?" for _ in ALLOWED_ROLES)
        if scalar(connection, f'SELECT COUNT(*) FROM "User" WHERE role NOT IN ({placeholders})', ALLOWED_ROLES):
            fail("Candidate database contains an unsupported user role")
        if scalar(
            connection,
            'SELECT COUNT(*) FROM "User" WHERE length(trim(id))=0 OR length(trim(userId))=0 OR length(passwordHash)<20 OR length(trim(name))=0',
        ):
            fail("Candidate database contains invalid authentication records")
        if scalar(connection, 'SELECT COUNT(*) FROM "InviteToken" WHERE token IS NOT NULL AND isUsed = 0'):
            fail("Candidate database contains unused legacy plaintext invite tokens")
    except sqlite3.Error as error:
        raise DatabaseValidationError("Candidate database invariant query failed") from error
    finally:
        connection.close()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate-live-database.py DATABASE", file=sys.stderr)
        return 2
    try:
        validate_database(sys.argv[1])
    except DatabaseValidationError as error:
        print(f"Live database validation refused: {error}", file=sys.stderr)
        return 1
    print("Root-reviewed SQLite invariants verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
