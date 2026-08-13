from __future__ import annotations

import errno
import datetime as dt
import gzip
import importlib.util
import sqlite3
import shutil
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).with_name("bootstrap-backup.py")
SPEC = importlib.util.spec_from_file_location("gshsapp_bootstrap_backup", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
bootstrap_backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap_backup)


class BootstrapBackupDurabilityTests(unittest.TestCase):
    def test_exclusive_publication_has_no_hardlink_crash_window(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            partial = root / ".generation.partial"
            target = root / "generation"
            partial.write_bytes(b"complete")
            bootstrap_backup.publish_exclusive(partial, target)
            self.assertFalse(partial.exists())
            self.assertEqual(target.read_bytes(), b"complete")
            self.assertEqual(target.stat().st_nlink, 1)

            replacement = root / ".replacement.partial"
            replacement.write_bytes(b"replacement")
            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.publish_exclusive(replacement, target)
            self.assertEqual(target.read_bytes(), b"complete")
            self.assertEqual(replacement.read_bytes(), b"replacement")

    def test_giant_declared_member_is_rejected_before_payload_is_scanned(self) -> None:
        class GiantArchive:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def __iter__(self):
                member = tarfile.TarInfo("manifest.json")
                member.size = bootstrap_backup.MAX_MANIFEST_BYTES + 1
                yield member
                raise AssertionError("validator advanced into the oversized payload")

        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "giant-member.tar.gz"
            archive.write_bytes(b"bounded fixture")
            with mock.patch.object(bootstrap_backup.tarfile, "open", return_value=GiantArchive()):
                with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                    bootstrap_backup.validate_archive(archive)

    def test_giant_pax_payload_is_rejected_before_tarfile_parser(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "pax-bomb.tar.gz"
            member = tarfile.TarInfo("pax-header")
            member.type = tarfile.XHDTYPE
            member.size = bootstrap_backup.MAX_PAX_HEADER_BYTES + 1
            header = member.tobuf(format=tarfile.USTAR_FORMAT)
            with gzip.open(archive, "wb") as output:
                output.write(header)
            with mock.patch.object(bootstrap_backup.tarfile, "open") as tar_open:
                with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                    bootstrap_backup.validate_archive(archive)
            tar_open.assert_not_called()

    def test_archive_size_is_bounded_before_tar_parser_runs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "oversized.tar.gz"
            with archive.open("wb") as output:
                output.truncate(bootstrap_backup.MAX_COMPRESSED_ARCHIVE_BYTES + 1)
            with mock.patch.object(bootstrap_backup.tarfile, "open") as tar_open:
                with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                    bootstrap_backup.validate_archive(archive)
            tar_open.assert_not_called()

    def test_archive_member_iteration_stops_at_the_entry_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "too-many.tar.gz"
            with tarfile.open(archive, "w:gz") as bundle:
                for index in range(bootstrap_backup.MAX_ARCHIVE_ENTRIES + 1):
                    member = tarfile.TarInfo(f"directory-{index:05d}")
                    member.type = tarfile.DIRTYPE
                    member.mode = 0o700
                    bundle.addfile(member)
            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.validate_archive(archive)

    def test_directory_sync_failure_aborts_and_removes_published_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            data.mkdir(mode=0o700)
            backup.mkdir(mode=0o700)
            database = data / "dev.db"
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            connection.commit()
            connection.close()

            with mock.patch.object(
                bootstrap_backup.os,
                "open",
                side_effect=OSError(errno.EIO, "simulated directory sync failure"),
            ):
                with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                    bootstrap_backup.create_backup(str(database), str(data), str(backup))

            self.assertEqual(list(backup.iterdir()), [])

    def test_full_generation_captures_only_allowlisted_content_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            data.mkdir(mode=0o700)
            backup.mkdir(mode=0o700)
            database = data / "dev.db"
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            connection.commit()
            connection.close()
            (data / "uploads").mkdir()
            (data / "uploads" / "photo.bin").write_bytes(b"photo")
            (data / "storage").mkdir()
            (data / "storage" / "nested").mkdir()
            (data / "storage" / "nested" / "document.txt").write_text("document", encoding="utf-8")
            (data / "unmanaged").mkdir()
            (data / "unmanaged" / "secret.txt").write_text("not included", encoding="utf-8")

            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            archive = backup / name
            with tarfile.open(archive, "r:gz") as bundle:
                names = [member.name.rstrip("/") for member in bundle.getmembers()]

            self.assertIn("content/uploads/photo.bin", names)
            self.assertIn("content/storage/nested/document.txt", names)
            self.assertNotIn("content/unmanaged/secret.txt", names)
            bootstrap_backup.verify_pair(str(backup), name)

    @unittest.skipIf(not hasattr(Path, "symlink_to"), "symlinks unavailable")
    def test_unsafe_content_link_aborts_without_publishing_a_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            data.mkdir(mode=0o700)
            backup.mkdir(mode=0o700)
            database = data / "dev.db"
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            connection.commit()
            connection.close()
            outside = root / "outside.txt"
            outside.write_text("outside", encoding="utf-8")
            (data / "uploads").mkdir()
            try:
                (data / "uploads" / "escape").symlink_to(outside)
            except OSError:
                self.skipTest("symlink creation is unavailable")

            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.create_backup(str(database), str(data), str(backup))

            self.assertEqual(list(backup.iterdir()), [])

    def test_offsite_export_receipt_and_extract_are_generation_bound(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            output = root / "restored"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT)")
            connection.execute("INSERT INTO example(value) VALUES ('preserved')")
            connection.commit()
            connection.close()
            (data / "uploads").mkdir()
            (data / "uploads" / "photo.bin").write_bytes(b"photo")

            name = bootstrap_backup.create_backup(
                str(database), str(data), str(backup), reason="scheduled"
            )
            receipt = bootstrap_backup.export_offsite_pair(
                str(backup), name, str(offsite), str(receipts)
            )
            self.assertTrue(receipt.name.endswith(".receipt.json"))
            bootstrap_backup.verify_offsite_receipt(
                str(offsite), str(receipts), name
            )
            bootstrap_backup.extract_pair(str(offsite), name, str(output))

            restored = sqlite3.connect(output / "database" / "dev.db")
            try:
                self.assertEqual(restored.execute("SELECT value FROM example").fetchone(), ("preserved",))
            finally:
                restored.close()
            self.assertEqual((output / "content" / "uploads" / "photo.bin").read_bytes(), b"photo")

            with (offsite / name).open("ab") as stream:
                stream.write(b"tamper")
            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.verify_offsite_receipt(str(offsite), str(receipts), name)

    def test_freshness_requires_the_complete_offsite_only_pair_to_verify(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(
                str(database), str(data), str(backup), reason="scheduled"
            )
            bootstrap_backup.export_offsite_pair(
                str(backup), name, str(offsite), str(receipts)
            )

            # The local generation may already have been pruned. Freshness is
            # therefore proved only from the immutable offsite pair+receipt.
            (backup / name).unlink()
            (backup / f"{name}.json").unlink()
            self.assertTrue(
                bootstrap_backup.has_fresh_verified_offsite_receipt(
                    str(offsite),
                    str(receipts),
                    freshness_hours=23,
                    now=dt.datetime.now(dt.timezone.utc),
                )
            )

            (offsite / f"{name}.json").unlink()
            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.has_fresh_verified_offsite_receipt(
                    str(offsite),
                    str(receipts),
                    freshness_hours=23,
                    now=dt.datetime.now(dt.timezone.utc),
                )

    def test_tampered_offsite_archive_cannot_suppress_a_scheduled_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(
                str(database), str(data), str(backup), reason="scheduled"
            )
            bootstrap_backup.export_offsite_pair(
                str(backup), name, str(offsite), str(receipts)
            )
            (backup / name).unlink()
            (backup / f"{name}.json").unlink()
            with (offsite / name).open("ab") as archive:
                archive.write(b"tampered")

            with self.assertRaises(bootstrap_backup.BootstrapBackupError):
                bootstrap_backup.has_fresh_verified_offsite_receipt(
                    str(offsite),
                    str(receipts),
                    freshness_hours=23,
                    now=dt.datetime.now(dt.timezone.utc),
                )

    def test_recent_export_of_an_old_generation_is_not_fresh(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            now = dt.datetime.now(dt.timezone.utc)
            old = now - dt.timedelta(days=4)
            old_timestamp = old.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            with mock.patch.object(
                bootstrap_backup,
                "utc_timestamp",
                return_value=(old_timestamp, old.strftime("%Y%m%d-%H%M%S")),
            ):
                name = bootstrap_backup.create_backup(
                    str(database), str(data), str(backup), reason="scheduled"
                )

            # This models a failed offsite export followed by reconcile days
            # later. exportedAt is recent, but the database snapshot is old.
            bootstrap_backup.export_offsite_pair(
                str(backup), name, str(offsite), str(receipts)
            )
            self.assertFalse(
                bootstrap_backup.has_fresh_verified_offsite_receipt(
                    str(offsite),
                    str(receipts),
                    freshness_hours=23,
                    now=now,
                )
            )

    def test_retention_deletes_only_offsite_confirmed_old_generations(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            connection = sqlite3.connect(database)
            connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            connection.commit()
            connection.close()

            names = []
            for _ in range(4):
                name = bootstrap_backup.create_backup(
                    str(database), str(data), str(backup), reason="scheduled"
                )
                bootstrap_backup.export_offsite_pair(
                    str(backup), name, str(offsite), str(receipts)
                )
                names.append(name)

            removed = bootstrap_backup.prune_confirmed_generations(
                str(backup),
                str(offsite),
                str(receipts),
                minimum_generations=1,
                maximum_generations=2,
                maximum_age_days=36500,
                maximum_total_bytes=10 * 1024 * 1024,
            )
            remaining = sorted(path.name for path in backup.glob("backup-*.tar.gz"))
            self.assertEqual(len(removed), 2)
            self.assertEqual(len(remaining), 2)
            self.assertEqual(set(removed).intersection(remaining), set())
            self.assertEqual(
                bootstrap_backup.reconcile_backup_state(
                    str(backup), str(offsite), str(receipts)
                ),
                [],
            )

            unconfirmed = bootstrap_backup.create_backup(
                str(database), str(data), str(backup), reason="scheduled"
            )
            bootstrap_backup.prune_confirmed_generations(
                str(backup),
                str(offsite),
                str(receipts),
                minimum_generations=1,
                maximum_generations=1,
                maximum_age_days=36500,
                maximum_total_bytes=10 * 1024 * 1024,
            )
            self.assertTrue((backup / unconfirmed).exists())

    def test_offsite_export_recovers_strict_regular_partial_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            (offsite / f".{name}.partial").write_bytes(b"interrupted")
            (offsite / f".{name}.json.partial").write_bytes(b"interrupted")
            (receipts / f".{name}.receipt.partial").write_bytes(b"interrupted")

            bootstrap_backup.export_offsite_pair(str(backup), name, str(offsite), str(receipts))

            self.assertFalse((offsite / f".{name}.partial").exists())
            self.assertFalse((offsite / f".{name}.json.partial").exists())
            self.assertFalse((receipts / f".{name}.receipt.partial").exists())
            bootstrap_backup.verify_offsite_receipt(str(offsite), str(receipts), name)

    def test_offsite_export_recovers_exact_metadata_only_crash_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            metadata = backup / f"{name}.json"
            offsite_metadata = offsite / metadata.name
            shutil.copyfile(metadata, offsite_metadata)
            offsite_metadata.chmod(0o600)

            bootstrap_backup.export_offsite_pair(str(backup), name, str(offsite), str(receipts))

            bootstrap_backup.verify_offsite_receipt(str(offsite), str(receipts), name)

    def test_offsite_archive_dirent_is_fsynced_before_metadata_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            events: list[tuple[str, str]] = []
            publish = bootstrap_backup.publish_exclusive
            fsync = bootstrap_backup.fsync_directory

            def recording_publish(partial: Path, target: Path) -> None:
                publish(partial, target)
                events.append(("publish", target.name))

            def recording_fsync(directory: Path) -> None:
                fsync(directory)
                events.append(("fsync", str(directory)))

            with (
                mock.patch.object(bootstrap_backup, "publish_exclusive", recording_publish),
                mock.patch.object(bootstrap_backup, "fsync_directory", recording_fsync),
            ):
                bootstrap_backup.export_offsite_pair(
                    str(backup), name, str(offsite), str(receipts)
                )

            archive_publish = events.index(("publish", name))
            metadata_publish = events.index(("publish", f"{name}.json"))
            self.assertTrue(
                any(event == "fsync" for event, _path in events[archive_publish + 1 : metadata_publish])
            )

    def test_receipt_commit_preserves_pair_across_postcommit_verify_fault(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            with mock.patch.object(
                bootstrap_backup,
                "verify_offsite_receipt",
                side_effect=OSError("simulated post-receipt read fault"),
            ):
                with self.assertRaises(OSError):
                    bootstrap_backup.export_offsite_pair(
                        str(backup), name, str(offsite), str(receipts)
                    )
            self.assertTrue((offsite / name).is_file())
            self.assertTrue((offsite / f"{name}.json").is_file())
            self.assertTrue((receipts / f"{name}.receipt.json").is_file())

            # A later reconcile re-verifies the already committed tuple and
            # does not leave a permanent receipt-only or pair-only wedge.
            self.assertEqual(
                bootstrap_backup.reconcile_backup_state(
                    str(backup), str(offsite), str(receipts)
                ),
                [],
            )

    def test_reconcile_repairs_a_valid_receipt_with_missing_offsite_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            bootstrap_backup.export_offsite_pair(
                str(backup), name, str(offsite), str(receipts)
            )
            (offsite / name).unlink()
            (offsite / f"{name}.json").unlink()

            self.assertEqual(
                bootstrap_backup.reconcile_backup_state(
                    str(backup), str(offsite), str(receipts)
                ),
                [name],
            )
            bootstrap_backup.verify_offsite_receipt(str(offsite), str(receipts), name)

    def test_create_recovers_crash_debris_before_capacity_preflight(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            data.mkdir(mode=0o700)
            backup.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            orphan = bootstrap_backup.create_backup(str(database), str(data), str(backup))
            (backup / f"{orphan}.json").unlink()
            work = backup / ".create-deadbeef"
            work.mkdir(mode=0o700)
            (work / "staging.bin").write_bytes(b"crash")
            (backup / f".{orphan}.partial").write_bytes(b"partial")
            (backup / f".{orphan}.json.partial").write_bytes(b"partial")

            real_disk_usage = shutil.disk_usage

            def checked_disk_usage(path):
                self.assertFalse(work.exists())
                self.assertFalse((backup / orphan).exists())
                self.assertFalse((backup / f".{orphan}.partial").exists())
                self.assertFalse((backup / f".{orphan}.json.partial").exists())
                return real_disk_usage(path)

            with mock.patch.object(bootstrap_backup.shutil, "disk_usage", side_effect=checked_disk_usage):
                recovered = bootstrap_backup.create_backup(str(database), str(data), str(backup))

            bootstrap_backup.verify_pair(str(backup), recovered)

    def test_reconcile_retries_unexported_generation_and_cleans_global_partials(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "data"
            backup = root / "backup"
            offsite = root / "offsite"
            receipts = root / "receipts"
            for directory in (data, backup, offsite, receipts):
                directory.mkdir(mode=0o700)
            database = data / "dev.db"
            sqlite3.connect(database).close()
            name = bootstrap_backup.create_backup(
                str(database), str(data), str(backup), reason="scheduled"
            )
            (offsite / f".{name}.partial").write_bytes(b"interrupted-current")

            exported = bootstrap_backup.reconcile_backup_state(
                str(backup), str(offsite), str(receipts)
            )

            self.assertEqual(exported, [name])
            self.assertEqual(bootstrap_backup.reconcile_backup_state(
                str(backup), str(offsite), str(receipts)
            ), [])
            self.assertFalse((offsite / f".{name}.partial").exists())
            bootstrap_backup.verify_offsite_receipt(str(offsite), str(receipts), name)

            # Immutable offsite history is not globally enumerated or rehashed
            # by reconciliation; hundreds of older receipted generations must
            # not block the next local export.
            for index in range(600):
                (receipts / f"historic-{index:04d}.receipt").write_bytes(b"immutable history")
            self.assertEqual(
                bootstrap_backup.reconcile_backup_state(
                    str(backup), str(offsite), str(receipts)
                ),
                [],
            )


if __name__ == "__main__":
    unittest.main()
