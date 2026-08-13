from __future__ import annotations

import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(__file__).with_name("validate-live-database.py")
SPEC = importlib.util.spec_from_file_location("validate_live_database", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def reviewed_database(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    for migration in (
        ROOT / "prisma" / "migrations" / "20260813000000_baseline" / "migration.sql",
        ROOT / "prisma" / "migrations" / "20260813001000_security_hardening" / "migration.sql",
    ):
        connection.executescript(migration.read_text(encoding="utf-8"))
    connection.execute(
        'INSERT INTO "User" (id,userId,passwordHash,name,email,role) VALUES (?,?,?,?,?,?)',
        ("admin-id", "admin", "$2b$10$" + "a" * 53, "Administrator", "admin@example.invalid", "ADMIN"),
    )
    connection.commit()
    return connection


class ValidateLiveDatabaseTests(unittest.TestCase):
    def test_accepts_only_the_reviewed_schema_with_an_admin(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "dev.db"
            connection = reviewed_database(database)
            connection.close()
            validator.validate_database(database)

    def test_rejects_executable_schema_and_missing_admin(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "dev.db"
            connection = reviewed_database(database)
            connection.execute('DELETE FROM "User"')
            connection.execute('CREATE VIEW leaked_users AS SELECT * FROM "User"')
            connection.commit()
            connection.close()
            with self.assertRaises(validator.DatabaseValidationError):
                validator.validate_database(database)

    def test_rejects_unused_legacy_plaintext_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "dev.db"
            connection = reviewed_database(database)
            connection.execute(
                'INSERT INTO "InviteToken" (id,token,targetRole,isUsed,createdBy,createdAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',
                ("legacy", "deadbeef", "TEACHER", 0, "admin-id"),
            )
            connection.commit()
            connection.close()
            with self.assertRaises(validator.DatabaseValidationError):
                validator.validate_database(database)


if __name__ == "__main__":
    unittest.main()
