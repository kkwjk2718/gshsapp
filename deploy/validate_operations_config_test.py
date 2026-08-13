from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).with_name("validate-operations-config.py")
SPEC = importlib.util.spec_from_file_location("validate_operations_config", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
CONFIG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONFIG)


BACKUP_CONFIG = """\
OFFSITE_DIR=/mnt/immutable/gshsapp
OFFSITE_MOUNT_SOURCE=UUID=0123-ABCD
OFFSITE_FSTYPE=ext4
OFFSITE_REQUIRED_OPTIONS=rw,nodev,nosuid,noexec
MINIMUM_GENERATIONS=3
MAXIMUM_GENERATIONS=14
MAXIMUM_AGE_DAYS=30
MAXIMUM_TOTAL_BYTES=21474836480
BACKUP_FRESHNESS_HOURS=23
"""

DEPLOY_CONFIG = """\
IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567
IMAGE_DIGEST=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
EXPECTED_APP_ORIGIN=https://gshs.app
HOST_BIND_IP=172.16.10.34
SSH_SOURCE_CIDR=10.20.0.0/24
PROXY_SOURCE_CIDR=10.30.0.9/32
PROTECTED_INTERNAL_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
OFFSITE_DIR=/mnt/immutable/gshsapp
OFFSITE_MOUNT_SOURCE=backup.example:/srv/gshsapp
OFFSITE_FSTYPE=nfs4
OFFSITE_REQUIRED_OPTIONS=rw,nodev,nosuid,noexec
HOST_PORT=1234
BACKUP_MAX_AGE_HOURS=24
SMOKE_TIMEOUT_SECONDS=90
SMOKE_INTERVAL_SECONDS=3
"""


class OperationsConfigTests(unittest.TestCase):
    def test_accepts_canonical_backup_policy(self) -> None:
        parsed = CONFIG.parse_config_text(BACKUP_CONFIG, "backup")
        self.assertEqual(parsed["OFFSITE_DIR"], "/mnt/immutable/gshsapp")
        self.assertEqual(parsed["MAXIMUM_GENERATIONS"], "14")
        self.assertEqual(
            CONFIG.offsite_receipt_dir(parsed),
            pathlib.Path("/mnt/immutable/gshsapp/.gshsapp-receipts"),
        )

    def test_backup_generation_limit_preserves_next_publication_headroom(self) -> None:
        CONFIG.parse_config_text(
            BACKUP_CONFIG.replace("MAXIMUM_GENERATIONS=14", "MAXIMUM_GENERATIONS=250"),
            "backup",
        )
        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_config_text(
                BACKUP_CONFIG.replace("MAXIMUM_GENERATIONS=14", "MAXIMUM_GENERATIONS=251"),
                "backup",
            )

    def test_rejects_environment_and_systemd_injection_syntax(self) -> None:
        attacks = (
            BACKUP_CONFIG.replace(
                "OFFSITE_DIR=/mnt/immutable/gshsapp",
                "OFFSITE_DIR=/mnt/good|/etc/shadow",
            ),
            BACKUP_CONFIG + "BASH_ENV=/root/attacker\n",
            BACKUP_CONFIG.replace("OFFSITE_FSTYPE=ext4", 'OFFSITE_FSTYPE="ext4"'),
            BACKUP_CONFIG.replace("OFFSITE_MOUNT_SOURCE=UUID=0123-ABCD", "OFFSITE_MOUNT_SOURCE=x\nPATH=/tmp"),
        )
        for attack in attacks:
            with self.subTest(attack=attack):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(attack, "backup")

    def test_rejects_duplicate_missing_and_noncanonical_lines(self) -> None:
        attacks = (
            BACKUP_CONFIG + "OFFSITE_DIR=/mnt/second\n",
            BACKUP_CONFIG.replace("OFFSITE_FSTYPE=ext4\n", ""),
            BACKUP_CONFIG.replace("\n", "\r\n"),
            BACKUP_CONFIG.rstrip("\n"),
            "\n" + BACKUP_CONFIG,
        )
        for attack in attacks:
            with self.subTest(attack=repr(attack[:40])):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(attack, "backup")

    def test_requires_independent_read_only_hardening_options(self) -> None:
        for options in ("rw,nodev,nosuid", "ro,nodev,nosuid,noexec", "rw,nodev,nodev,nosuid,noexec"):
            attack = BACKUP_CONFIG.replace(
                "rw,nodev,nosuid,noexec",
                options,
            )
            with self.subTest(options=options):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(attack, "backup")

    def test_mount_identity_requires_exact_source_type_options_and_separate_device(self) -> None:
        values = CONFIG.parse_config_text(BACKUP_CONFIG, "backup")
        CONFIG.validate_mount_identity(
            values,
            actual_source="/dev/sdb1",
            actual_uuid="0123-ABCD",
            actual_fstype="ext4",
            actual_options="rw,relatime,nodev,nosuid,noexec",
            offsite_device=2,
            backup_device=1,
        )

    def test_uuid_policy_uses_findmnt_uuid_not_device_source(self) -> None:
        values = CONFIG.parse_config_text(BACKUP_CONFIG, "backup")
        outputs = {
            "SOURCE": b"/dev/sdb1\n",
            "UUID": b"0123-ABCD\n",
            "FSTYPE": b"ext4\n",
            "OPTIONS": b"rw,nodev,nosuid,noexec\n",
        }

        def run(command: list[str], **_kwargs: object) -> subprocess.CompletedProcess[bytes]:
            column = next(item.split("=", 1)[1] for item in command if item.startswith("--output="))
            return subprocess.CompletedProcess(command, 0, stdout=outputs[column], stderr=b"")

        with mock.patch.object(CONFIG.subprocess, "run", run):
            self.assertEqual(CONFIG._findmnt_column(pathlib.Path("/mnt/immutable/gshsapp"), "SOURCE"), "/dev/sdb1")
            self.assertEqual(CONFIG._findmnt_column(pathlib.Path("/mnt/immutable/gshsapp"), "UUID"), "0123-ABCD")
        CONFIG.validate_mount_identity(
            values,
            actual_source="/dev/sdb1",
            actual_uuid="0123-ABCD",
            actual_fstype="ext4",
            actual_options="rw,nodev,nosuid,noexec",
            offsite_device=2,
            backup_device=1,
        )

        for replacement in (
            {"actual_uuid": "9999-FFFF"},
            {"actual_fstype": "xfs"},
            {"actual_options": "rw,relatime,nodev,nosuid"},
            {"offsite_device": 1},
        ):
            arguments = {
                "actual_source": "/dev/sdb1",
                "actual_uuid": "0123-ABCD",
                "actual_fstype": "ext4",
                "actual_options": "rw,relatime,nodev,nosuid,noexec",
                "offsite_device": 2,
                "backup_device": 1,
            }
            arguments.update(replacement)
            with self.subTest(replacement=replacement), self.assertRaises(CONFIG.ConfigError):
                CONFIG.validate_mount_identity(values, **arguments)

        network = CONFIG.parse_config_text(
            BACKUP_CONFIG
            .replace("OFFSITE_MOUNT_SOURCE=UUID=0123-ABCD", "OFFSITE_MOUNT_SOURCE=backup.example:/srv/gshsapp")
            .replace("OFFSITE_FSTYPE=ext4", "OFFSITE_FSTYPE=nfs4"),
            "backup",
        )
        CONFIG.validate_mount_identity(
            network,
            actual_source="backup.example:/srv/gshsapp",
            actual_uuid="",
            actual_fstype="nfs4",
            actual_options="rw,nodev,nosuid,noexec,vers=4.2",
            offsite_device=2,
            backup_device=1,
        )

    def test_shape_only_receipt_freshness_api_is_not_exposed(self) -> None:
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertFalse(hasattr(CONFIG, "backup_needed"))
        self.assertNotIn("--backup-needed", source)

    def test_binds_deploy_origin_to_immutable_host_role(self) -> None:
        parsed = CONFIG.parse_config_text(DEPLOY_CONFIG, "deploy", host_role="prod")
        self.assertEqual(parsed["IMAGE_TAG"], "sha-0123456789abcdef0123456789abcdef01234567")

        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_config_text(DEPLOY_CONFIG, "deploy", host_role="test")

    def test_rejects_ambiguous_deploy_identity_and_wildcard_bind(self) -> None:
        attacks = (
            DEPLOY_CONFIG.replace("IMAGE_TAG=sha-", "IMAGE_TAG=latest-"),
            DEPLOY_CONFIG.replace("IMAGE_DIGEST=sha256:", "IMAGE_DIGEST=sha512:"),
            DEPLOY_CONFIG.replace("HOST_BIND_IP=172.16.10.34", "HOST_BIND_IP=0.0.0.0"),
            DEPLOY_CONFIG.replace("HOST_PORT=1234", "HOST_PORT=22"),
        )
        for attack in attacks:
            with self.subTest(attack=attack.splitlines()[0]):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(attack, "deploy", host_role="prod")

    def test_non_rfc1918_bind_requires_explicit_reviewed_override(self) -> None:
        public = DEPLOY_CONFIG.replace("172.16.10.34", "172.15.10.34").replace(
            "PROTECTED_INTERNAL_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
            "PROTECTED_INTERNAL_CIDRS=10.0.0.0/8,172.15.0.0/16,172.16.0.0/12,192.168.0.0/16",
        )
        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_config_text(public, "deploy", host_role="prod")
        parsed = CONFIG.parse_config_text(
            public + "ALLOW_PUBLIC_BIND=true\n",
            "deploy",
            host_role="prod",
        )
        self.assertEqual(parsed["HOST_BIND_IP"], "172.15.10.34")
        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_config_text(
                public + "ALLOW_PUBLIC_BIND=TRUE\n",
                "deploy",
                host_role="prod",
            )

        test_public = public.replace("https://gshs.app", "https://test.gshs.app")
        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_config_text(test_public, "deploy", host_role="test")
        CONFIG.parse_config_text(
            test_public + "ALLOW_PUBLIC_BIND=true\n",
            "deploy",
            host_role="test",
        )

    def test_deploy_policy_rejects_implementation_path_overrides(self) -> None:
        for override in (
            "CONTROL_ROOT=/tmp/controls",
            "DEPLOY_ROOT=/tmp/deploy",
            "PYTHON_BIN=/tmp/python",
            "COMPOSE_FILE=/tmp/compose.yml",
            "DOCKER_IMAGE=attacker/image",
            "HEALTHCHECK_URL=https://attacker.example",
            "BASH_ENV=/tmp/profile",
            "PATH=/tmp",
        ):
            with self.subTest(override=override):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(
                        DEPLOY_CONFIG + override + "\n",
                        "deploy",
                        host_role="prod",
                    )

    def test_firewall_sources_are_required_canonical_ipv4_nonzero_prefixes(self) -> None:
        for attack in (
            DEPLOY_CONFIG.replace("SSH_SOURCE_CIDR=10.20.0.0/24\n", ""),
            DEPLOY_CONFIG.replace("PROXY_SOURCE_CIDR=10.30.0.9/32", "PROXY_SOURCE_CIDR=0.0.0.0/0"),
            DEPLOY_CONFIG.replace("PROXY_SOURCE_CIDR=10.30.0.9/32", "PROXY_SOURCE_CIDR=10.30.0.0/24"),
            DEPLOY_CONFIG.replace("SSH_SOURCE_CIDR=10.20.0.0/24", "SSH_SOURCE_CIDR=10.20.0.1/24"),
            DEPLOY_CONFIG.replace("PROXY_SOURCE_CIDR=10.30.0.9/32", "PROXY_SOURCE_CIDR=2001:db8::/64"),
        ):
            with self.subTest(attack=attack):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_config_text(attack, "deploy", host_role="prod")

    def test_firewall_policy_output_is_exact_and_minimal(self) -> None:
        values = CONFIG.parse_config_text(DEPLOY_CONFIG, "deploy", host_role="prod")
        self.assertEqual(
            CONFIG.firewall_policy_lines(values),
            (
                "172.16.10.34",
                "1234",
                "10.30.0.9/32",
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.168.0.0/16",
            ),
        )

    def test_offsite_policy_output_is_exact_and_complete(self) -> None:
        values = CONFIG.parse_config_text(DEPLOY_CONFIG, "deploy", host_role="prod")
        self.assertEqual(
            CONFIG.offsite_policy_lines(values),
            (
                "/mnt/immutable/gshsapp",
                "backup.example:/srv/gshsapp",
                "nfs4",
                "rw,nodev,nosuid,noexec",
            ),
        )
        self.assertEqual(
            CONFIG.manual_operation_policy_lines(values, "deploy"),
            (
                "/mnt/immutable/gshsapp",
                "backup.example:/srv/gshsapp",
                "nfs4",
                "rw,nodev,nosuid,noexec",
                "sha-0123456789abcdef0123456789abcdef01234567",
                "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "24",
                "90",
            ),
        )

    def test_protected_internal_cidrs_are_required_canonical_and_cover_bind(self) -> None:
        for attack in (
            DEPLOY_CONFIG.replace(
                "PROTECTED_INTERNAL_CIDRS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16\n", ""
            ),
            DEPLOY_CONFIG.replace(
                "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "10.0.0.0/8,10.20.0.0/16"
            ),
            DEPLOY_CONFIG.replace(
                "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "172.16.0.1/12"
            ),
            DEPLOY_CONFIG.replace(
                "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "192.168.0.0/16,10.0.0.0/8"
            ),
            DEPLOY_CONFIG.replace(
                "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "10.0.0.0/8,192.168.0.0/16"
            ),
            DEPLOY_CONFIG.replace(
                "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "0.0.0.0/0"
            ),
        ):
            with self.subTest(attack=attack), self.assertRaises(CONFIG.ConfigError):
                CONFIG.parse_config_text(attack, "deploy", host_role="prod")

    def test_host_role_is_exact_and_newline_terminated(self) -> None:
        self.assertEqual(CONFIG.parse_host_role_text("test\n"), "test")
        self.assertEqual(CONFIG.parse_host_role_text("prod\n"), "prod")
        for invalid in ("prod", "production\n", "prod\r\n", "prod\nextra\n"):
            with self.subTest(invalid=repr(invalid)):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_host_role_text(invalid)

    def test_backup_unit_requires_exact_mount_and_retries_failed_backup(self) -> None:
        service = CONFIG.render_service("backup", "/mnt/immutable/gshsapp")
        timer = CONFIG.render_backup_timer()
        self.assertIn("BindsTo=docker.service\nPartOf=docker.service\n", service)
        self.assertNotIn("RequiresMountsFor=", service)
        self.assertNotIn("ConditionPathIsMountPoint=", service)
        self.assertIn("After=docker.service network-online.target gshsapp-writer-recovery.service\n", service)
        self.assertIn("Requires=docker.service gshsapp-writer-recovery.service\n", service)
        self.assertIn("Restart=on-failure\nRestartSec=15min\n", service)
        self.assertIn("TimeoutStopSec=45s\n", service)
        self.assertIn("PrivateMounts=true\n", service)
        self.assertIn("MountFlags=private\n", service)
        self.assertIn("BindPaths=/mnt/immutable/gshsapp\n", service)
        self.assertIn("Environment=GSHSAPP_OFFSITE_PINNED=systemd\n", service)
        self.assertNotIn("ExecCondition=", service)
        self.assertIn("ExecStart=/bin/bash /usr/local/lib/gshsapp-operations/run-scheduled-backup.sh\n", service)
        self.assertIn("ExecStartPre=/bin/bash /usr/local/lib/gshsapp-operations/install-backup-timer.sh --verify-unit\n", service)
        self.assertIn("ExecStopPost=/bin/bash /usr/local/lib/gshsapp-operations/recover-backup-writer.sh\n", service)
        self.assertIn("OnBootSec=15min\n", timer)
        self.assertIn("OnUnitInactiveSec=1h\n", timer)
        self.assertIn("OnCalendar=*-*-* 03:17:00 Asia/Seoul\n", timer)
        self.assertIn("Persistent=true\nAccuracySec=1min\n", timer)

    def test_deploy_unit_requires_exact_mount_without_automatic_retry(self) -> None:
        service = CONFIG.render_service("deploy", "/mnt/immutable/gshsapp")
        self.assertIn("BindsTo=docker.service\nPartOf=docker.service\n", service)
        self.assertIn("TimeoutStopSec=45s\n", service)
        self.assertIn("PrivateMounts=true\n", service)
        self.assertIn("MountFlags=private\n", service)
        self.assertIn("BindPaths=/mnt/immutable/gshsapp\n", service)
        self.assertIn("Environment=GSHSAPP_OFFSITE_PINNED=systemd\n", service)
        self.assertIn("EnvironmentFile=/etc/gshsapp-operations/deploy.env\n", service)
        self.assertIn("RequiresMountsFor=/mnt/immutable/gshsapp\n", service)
        self.assertIn("ConditionPathIsMountPoint=/mnt/immutable/gshsapp\n", service)
        self.assertIn("ExecStartPre=/bin/bash /usr/local/lib/gshsapp-operations/install-deploy-service.sh --verify-config\n", service)
        self.assertIn("ExecStartPre=/bin/bash /usr/local/lib/gshsapp-operations/install-deploy-service.sh --verify-unit\n", service)
        self.assertIn("ExecStartPre=/bin/bash /usr/local/lib/gshsapp-operations/docker-user-firewall.sh --verify\n", service)
        self.assertIn("After=docker.service network-online.target gshsapp-writer-recovery.service gshsapp-docker-user-firewall.service\n", service)
        self.assertIn("Requires=docker.service gshsapp-writer-recovery.service gshsapp-docker-user-firewall.service\n", service)
        self.assertIn("ExecStopPost=/bin/bash /usr/local/lib/gshsapp-operations/recover-deployment-writer.sh\n", service)
        self.assertIn("CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_NET_ADMIN CAP_SETGID CAP_SETUID\n", service)
        self.assertIn("RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK\n", service)
        self.assertNotIn("Restart=", service)

        backup = CONFIG.render_service("backup", "/mnt/immutable/gshsapp")
        self.assertNotIn("CAP_NET_ADMIN", backup)
        self.assertNotIn("AF_NETLINK", backup)

    def test_lifecycle_phase_parser_accepts_only_terminal_states(self) -> None:
        backup = json.dumps(
            {
                "format": "gshsapp-backup-phase",
                "version": 3,
                "phase": "healthy",
                "containerId": "",
                "imageId": "",
                "configImage": "",
                "restartPolicy": "",
                "containerName": "",
                "wasRunning": False,
                "updatedAt": "2026-08-13T01:02:03.000Z",
            },
            separators=(",", ":"),
        ) + "\n"
        deployment = json.dumps(
            {
                "format": "gshsapp-deployment-phase",
                "version": 1,
                "phase": "pre-migration-rollback",
                "imageTag": "sha-0123456789abcdef0123456789abcdef01234567",
                "imageDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "updatedAt": "2026-08-13T01:02:03.000Z",
            },
            separators=(",", ":"),
        ) + "\n"
        CONFIG.parse_terminal_lifecycle_phase_text("backup-phase.json", backup)
        CONFIG.parse_terminal_lifecycle_phase_text("deployment-phase.json", deployment)

        for filename, text, old, new in (
            ("backup-phase.json", backup, '"healthy"', '"restart-required"'),
            ("deployment-phase.json", deployment, '"pre-migration-rollback"', '"schema-transition"'),
        ):
            with self.subTest(filename=filename):
                with self.assertRaises(CONFIG.ConfigError):
                    CONFIG.parse_terminal_lifecycle_phase_text(filename, text.replace(old, new))

    def test_lifecycle_phase_parser_rejects_noncanonical_or_extra_state(self) -> None:
        value = {
            "format": "gshsapp-backup-phase",
            "version": 3,
            "phase": "healthy",
            "containerId": "",
            "imageId": "",
            "configImage": "",
            "restartPolicy": "",
            "containerName": "",
            "wasRunning": False,
            "updatedAt": "2026-08-13T01:02:03.000Z",
            "extra": True,
        }
        with self.assertRaises(CONFIG.ConfigError):
            CONFIG.parse_terminal_lifecycle_phase_text(
                "backup-phase.json",
                json.dumps(value, separators=(",", ":")) + "\n",
            )

    def test_control_update_refuses_pending_restore_drill_phase(self) -> None:
        source = MODULE_PATH.read_text(encoding="utf-8")
        function = source.split("def assert_lifecycle_quiescent", 1)[1].split("\ndef ", 1)[0]
        self.assertIn(
            '("import-phase.json", "deployment-restart.json", "restore-drill-phase.json")',
            function,
        )
        self.assertIn("os.lstat(path)", function)
        self.assertIn("pending lifecycle state must be resolved before control update", function)

if __name__ == "__main__":
    unittest.main()
