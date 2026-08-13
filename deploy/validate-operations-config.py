#!/usr/bin/env python3
"""Strict parser for root-owned backup and deployment service policy files."""

from __future__ import annotations

import argparse
import datetime
import ipaddress
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
from collections.abc import Mapping


class ConfigError(ValueError):
    pass


_KEY_VALUE = re.compile(r"^([A-Z][A-Z0-9_]*)=([!-~]+)$")
_SAFE_PATH = re.compile(r"^/[A-Za-z0-9._@+/-]+$")
_SAFE_MOUNT_SOURCE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@:+,=-]{0,511}$")
_SAFE_FSTYPE = re.compile(r"^[a-z0-9][a-z0-9._+-]{0,31}$")
_SAFE_OPTION = re.compile(r"^[a-z0-9_][a-z0-9._=-]{0,127}$")
_SHA_TAG = re.compile(r"^sha-[0-9a-f]{40}$")
_IMAGE_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")

_OFFSITE_KEYS = {
    "OFFSITE_DIR",
    "OFFSITE_MOUNT_SOURCE",
    "OFFSITE_FSTYPE",
    "OFFSITE_REQUIRED_OPTIONS",
}
_BACKUP_OPTIONAL = {
    "MINIMUM_GENERATIONS",
    "MAXIMUM_GENERATIONS",
    "MAXIMUM_AGE_DAYS",
    "MAXIMUM_TOTAL_BYTES",
    "BACKUP_FRESHNESS_HOURS",
}
_DEPLOY_REQUIRED = _OFFSITE_KEYS | {
    "IMAGE_TAG",
    "IMAGE_DIGEST",
    "EXPECTED_APP_ORIGIN",
    "HOST_BIND_IP",
    "SSH_SOURCE_CIDR",
    "PROXY_SOURCE_CIDR",
    "PROTECTED_INTERNAL_CIDRS",
}
_DEPLOY_OPTIONAL = {
    "HOST_PORT",
    "BACKUP_MAX_AGE_HOURS",
    "SMOKE_TIMEOUT_SECONDS",
    "SMOKE_INTERVAL_SECONDS",
    "ALLOW_PUBLIC_BIND",
}

_CONTROL_ROOT = "/usr/local/lib/gshsapp-operations"
_CONFIG_ROOT = "/etc/gshsapp-operations"
_CANONICAL_TIMESTAMP = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$")


def _require_canonical_timestamp(value: object) -> datetime.datetime:
    if not isinstance(value, str) or _CANONICAL_TIMESTAMP.fullmatch(value) is None:
        raise ConfigError("lifecycle timestamp is malformed")
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ConfigError("lifecycle timestamp is invalid") from error
    if parsed.tzinfo != datetime.timezone.utc:
        raise ConfigError("lifecycle timestamp is not UTC")
    return parsed


def parse_terminal_lifecycle_phase_text(filename: str, text: str) -> None:
    if not text.endswith("\n") or text.count("\n") != 1 or "\r" in text:
        raise ConfigError("lifecycle phase is not canonical")
    try:
        value = json.loads(text)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ConfigError("lifecycle phase is malformed") from error
    if not isinstance(value, dict):
        raise ConfigError("lifecycle phase must be an object")
    _require_canonical_timestamp(value.get("updatedAt"))
    if filename == "backup-phase.json":
        if (
            set(value)
            != {
                "format",
                "version",
                "phase",
                "containerId",
                "imageId",
                "configImage",
                "restartPolicy",
                "containerName",
                "wasRunning",
                "updatedAt",
            }
            or value.get("format") != "gshsapp-backup-phase"
            or value.get("version") != 3
            or value.get("phase") != "healthy"
            or value.get("containerId") != ""
            or value.get("imageId") != ""
            or value.get("configImage") != ""
            or value.get("restartPolicy") != ""
            or value.get("containerName") != ""
            or value.get("wasRunning") is not False
        ):
            raise ConfigError("backup lifecycle still requires recovery")
        return
    if filename == "deployment-phase.json":
        if (
            set(value) != {"format", "version", "phase", "imageTag", "imageDigest", "updatedAt"}
            or value.get("format") != "gshsapp-deployment-phase"
            or value.get("version") != 1
            or value.get("phase") not in {"healthy", "pre-migration-rollback"}
            or _SHA_TAG.fullmatch(value.get("imageTag") or "") is None
            or _IMAGE_DIGEST.fullmatch(value.get("imageDigest") or "") is None
        ):
            raise ConfigError("deployment lifecycle still requires recovery")
        return
    raise ConfigError("unknown lifecycle phase file")


def assert_lifecycle_quiescent(deploy_root: pathlib.Path) -> None:
    if not deploy_root.is_absolute() or deploy_root != pathlib.Path("/opt/gshsapp"):
        raise ConfigError("lifecycle root must be exactly /opt/gshsapp")
    if not deploy_root.exists():
        return
    _assert_secure_ancestry(deploy_root)
    for pending in ("import-phase.json", "deployment-restart.json", "restore-drill-phase.json"):
        path = deploy_root / pending
        try:
            os.lstat(path)
        except FileNotFoundError:
            continue
        raise ConfigError(f"pending lifecycle state must be resolved before control update: {pending}")
    for phase in ("backup-phase.json", "deployment-phase.json"):
        path = deploy_root / phase
        try:
            text = _read_secure_root_file(path, 0o600, 16_384, parent_mode=0o755)
        except FileNotFoundError:
            continue
        parse_terminal_lifecycle_phase_text(phase, text)


def render_service(kind: str, offsite_dir: str) -> str:
    if kind not in {"backup", "deploy"}:
        raise ConfigError("unknown operations service kind")
    _validate_offsite_policy(
        {
            "OFFSITE_DIR": offsite_dir,
            "OFFSITE_MOUNT_SOURCE": "validated-source",
            "OFFSITE_FSTYPE": "validated",
            "OFFSITE_REQUIRED_OPTIONS": "rw,nodev,nosuid,noexec",
        }
    )
    is_backup = kind == "backup"
    title = (
        "GSHS complete offline backup and offsite verification"
        if is_backup
        else "GSHS root-console deployment transaction"
    )
    config_file = f"{_CONFIG_ROOT}/{'backup' if is_backup else 'deploy'}.env"
    installer = f"install-{'backup-timer' if is_backup else 'deploy-service'}.sh"
    executable = "run-scheduled-backup.sh" if is_backup else "deploy.sh"
    recovery = "recover-backup-writer.sh" if is_backup else "recover-deployment-writer.sh"
    timeout = "45min" if is_backup else "60min"
    unit_lines = [
        "[Unit]",
        f"Description={title}",
        "BindsTo=docker.service",
        "PartOf=docker.service",
        (
            "After=docker.service network-online.target gshsapp-writer-recovery.service"
            if is_backup
            else "After=docker.service network-online.target gshsapp-writer-recovery.service gshsapp-docker-user-firewall.service"
        ),
        (
            "Requires=docker.service gshsapp-writer-recovery.service"
            if is_backup
            else "Requires=docker.service gshsapp-writer-recovery.service gshsapp-docker-user-firewall.service"
        ),
    ]
    if is_backup:
        unit_lines.extend(("StartLimitIntervalSec=1h", "StartLimitBurst=4"))
    else:
        unit_lines.extend((
            f"RequiresMountsFor={offsite_dir}",
            f"ConditionPathIsMountPoint={offsite_dir}",
        ))
    service_lines = [
        "",
        "[Service]",
        "Type=oneshot",
        f"EnvironmentFile={config_file}",
        "Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "Environment=LC_ALL=C",
        f"Environment=CONTROL_ROOT={_CONTROL_ROOT}",
        "Environment=DEPLOY_ROOT=/opt/gshsapp",
        "Environment=GSHSAPP_OFFSITE_PINNED=systemd",
        f"ExecStartPre=/bin/bash {_CONTROL_ROOT}/{installer} --verify-config",
        f"ExecStartPre=/bin/bash {_CONTROL_ROOT}/{installer} --verify-unit",
        *(
            [f"ExecStartPre=/bin/bash {_CONTROL_ROOT}/docker-user-firewall.sh --verify"]
            if not is_backup
            else []
        ),
        f"ExecStart=/bin/bash {_CONTROL_ROOT}/{executable}",
        f"ExecStopPost=/bin/bash {_CONTROL_ROOT}/{recovery}",
        "User=root",
        "Group=root",
        "UMask=0077",
        "PrivateTmp=true",
        "PrivateDevices=true",
        "PrivateMounts=true",
        "MountFlags=private",
        f"BindPaths={offsite_dir}",
        "ProtectHome=true",
        "ProtectSystem=strict",
        "ProtectKernelTunables=true",
        "ProtectKernelModules=true",
        "ProtectKernelLogs=true",
        "ProtectControlGroups=true",
        "ProtectClock=true",
        "ProtectHostname=true",
        f"ReadOnlyPaths={_CONTROL_ROOT} {_CONFIG_ROOT} /var/run/docker.sock",
        f"ReadWritePaths=/opt/gshsapp /run/lock/gshsapp {offsite_dir}",
        "NoNewPrivileges=true",
        (
            "CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_SETGID CAP_SETUID"
            if is_backup
            else "CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_NET_ADMIN CAP_SETGID CAP_SETUID"
        ),
        "AmbientCapabilities=",
        "RestrictSUIDSGID=true",
        "RestrictNamespaces=true",
        (
            "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6"
            if is_backup
            else "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK"
        ),
        "LockPersonality=true",
        "RestrictRealtime=true",
        "MemoryDenyWriteExecute=true",
        "SystemCallArchitectures=native",
        f"TimeoutStartSec={timeout}",
        "TimeoutStopSec=45s",
    ]
    if is_backup:
        service_lines.extend(("Restart=on-failure", "RestartSec=15min"))
    return "\n".join(unit_lines + service_lines) + "\n"


def render_backup_timer() -> str:
    return """[Unit]
Description=Daily GSHS complete backup

[Timer]
OnCalendar=*-*-* 03:17:00 Asia/Seoul
OnBootSec=15min
OnUnitInactiveSec=1h
RandomizedDelaySec=10m
Persistent=true
AccuracySec=1min
Unit=gshsapp-backup.service

[Install]
WantedBy=timers.target
"""


def _parse_positive_integer(value: str, key: str, minimum: int, maximum: int) -> int:
    if re.fullmatch(r"[1-9][0-9]*", value) is None:
        raise ConfigError(f"{key} must be a canonical positive integer")
    number = int(value)
    if not minimum <= number <= maximum:
        raise ConfigError(f"{key} is outside its reviewed range")
    return number


def _validate_offsite_policy(values: Mapping[str, str]) -> None:
    offsite_dir = values["OFFSITE_DIR"]
    if (
        len(offsite_dir) > 512
        or _SAFE_PATH.fullmatch(offsite_dir) is None
        or offsite_dir == "/"
        or "//" in offsite_dir
        or any(part in {"", ".", ".."} for part in offsite_dir.split("/")[1:])
        or pathlib.PurePosixPath(offsite_dir).as_posix() != offsite_dir
    ):
        raise ConfigError("OFFSITE_DIR must be a canonical injection-safe absolute path")

    if _SAFE_MOUNT_SOURCE.fullmatch(values["OFFSITE_MOUNT_SOURCE"]) is None:
        raise ConfigError("OFFSITE_MOUNT_SOURCE is malformed")
    if values["OFFSITE_MOUNT_SOURCE"].startswith("UUID=") and re.fullmatch(
        r"UUID=[A-Fa-f0-9][A-Fa-f0-9-]{3,127}", values["OFFSITE_MOUNT_SOURCE"]
    ) is None:
        raise ConfigError("OFFSITE_MOUNT_SOURCE UUID is malformed")
    if _SAFE_FSTYPE.fullmatch(values["OFFSITE_FSTYPE"]) is None:
        raise ConfigError("OFFSITE_FSTYPE is malformed")

    options = values["OFFSITE_REQUIRED_OPTIONS"].split(",")
    if any(_SAFE_OPTION.fullmatch(option) is None for option in options):
        raise ConfigError("OFFSITE_REQUIRED_OPTIONS is malformed")
    if len(options) != len(set(options)):
        raise ConfigError("OFFSITE_REQUIRED_OPTIONS contains duplicates")
    required = {"rw", "nodev", "nosuid", "noexec"}
    if not required.issubset(options) or "ro" in options:
        raise ConfigError("OFFSITE_REQUIRED_OPTIONS lacks the reviewed write mount hardening")


def validate_mount_identity(
    values: Mapping[str, str],
    *,
    actual_source: str,
    actual_uuid: str,
    actual_fstype: str,
    actual_options: str,
    offsite_device: int,
    backup_device: int,
) -> None:
    expected_source = values["OFFSITE_MOUNT_SOURCE"]
    if expected_source.startswith("UUID="):
        if actual_uuid.casefold() != expected_source[5:].casefold():
            raise ConfigError("offsite mount UUID does not match the reviewed identity")
    elif actual_source != expected_source:
        raise ConfigError("offsite mount source does not match the reviewed identity")
    if actual_fstype != values["OFFSITE_FSTYPE"]:
        raise ConfigError("offsite filesystem type does not match the reviewed identity")
    options = actual_options.split(",")
    if any(_SAFE_OPTION.fullmatch(option) is None for option in options):
        raise ConfigError("active offsite mount options are malformed")
    required = set(values["OFFSITE_REQUIRED_OPTIONS"].split(","))
    if not required.issubset(options):
        raise ConfigError("active offsite mount lacks a required hardening option")
    if offsite_device == backup_device:
        raise ConfigError("offsite target must use a separate filesystem")


def offsite_receipt_dir(values: Mapping[str, str]) -> pathlib.Path:
    return pathlib.Path(values["OFFSITE_DIR"]) / ".gshsapp-receipts"


def offsite_policy_lines(values: Mapping[str, str]) -> tuple[str, ...]:
    return tuple(values[key] for key in (
        "OFFSITE_DIR",
        "OFFSITE_MOUNT_SOURCE",
        "OFFSITE_FSTYPE",
        "OFFSITE_REQUIRED_OPTIONS",
    ))


def manual_operation_policy_lines(values: Mapping[str, str], kind: str) -> tuple[str, ...]:
    common = offsite_policy_lines(values)
    if kind == "backup":
        return common
    if kind != "deploy":
        raise ConfigError("unknown manual operation policy kind")
    return common + (
        values["IMAGE_TAG"],
        values["IMAGE_DIGEST"],
        values.get("BACKUP_MAX_AGE_HOURS", "24"),
        values.get("SMOKE_TIMEOUT_SECONDS", "90"),
    )


def firewall_policy_lines(values: Mapping[str, str]) -> tuple[str, ...]:
    return (
        values["HOST_BIND_IP"],
        values.get("HOST_PORT", "1234"),
        values["PROXY_SOURCE_CIDR"],
        *values["PROTECTED_INTERNAL_CIDRS"].split(","),
    )


def _findmnt_column(offsite_dir: pathlib.Path, column: str) -> str:
    result = subprocess.run(
        [
            "/usr/bin/findmnt",
            "--noheadings",
            "--raw",
            f"--output={column}",
            "--mountpoint",
            str(offsite_dir),
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
    )
    if result.returncode != 0 or len(result.stdout) > 4096:
        raise ConfigError("offsite target is not mounted with a readable identity")
    try:
        output = result.stdout.decode("ascii", "strict")
    except UnicodeDecodeError as error:
        raise ConfigError("offsite mount identity is not ASCII") from error
    if not output.endswith("\n") or output.count("\n") != 1 or "\r" in output or "\x00" in output:
        raise ConfigError("offsite mount identity output is not canonical")
    return output[:-1]


def verify_mounted_offsite(
    values: Mapping[str, str],
    *,
    require_receipt_dir: bool = True,
    backup_dir: pathlib.Path = pathlib.Path("/opt/gshsapp/root-backup"),
) -> None:
    offsite_dir = pathlib.Path(values["OFFSITE_DIR"])
    if offsite_dir.as_posix() != values["OFFSITE_DIR"] or pathlib.Path(os.path.realpath(offsite_dir)) != offsite_dir:
        raise ConfigError("OFFSITE_DIR must remain one canonical non-symlink path")
    _assert_secure_ancestry(offsite_dir)
    metadata = os.lstat(offsite_dir)
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o700
    ):
        raise ConfigError("OFFSITE_DIR must be root:root mode 0700")
    backup = backup_dir
    _assert_secure_ancestry(backup.parent)
    backup_metadata = os.lstat(backup)
    if (
        not stat.S_ISDIR(backup_metadata.st_mode)
        or backup_metadata.st_uid != 0
        or backup_metadata.st_gid != 0
        or stat.S_IMODE(backup_metadata.st_mode) != 0o700
    ):
        raise ConfigError("local backup directory has an unsafe identity")
    validate_mount_identity(
        values,
        actual_source=_findmnt_column(offsite_dir, "SOURCE"),
        actual_uuid=(
            _findmnt_column(offsite_dir, "UUID")
            if values["OFFSITE_MOUNT_SOURCE"].startswith("UUID=")
            else ""
        ),
        actual_fstype=_findmnt_column(offsite_dir, "FSTYPE"),
        actual_options=_findmnt_column(offsite_dir, "OPTIONS"),
        offsite_device=os.stat(offsite_dir, follow_symlinks=False).st_dev,
        backup_device=os.stat(backup, follow_symlinks=False).st_dev,
    )
    if not require_receipt_dir:
        return
    receipt_dir = offsite_receipt_dir(values)
    if receipt_dir.parent != offsite_dir or receipt_dir.name != ".gshsapp-receipts":
        raise ConfigError("offsite receipt directory is not the fixed direct child")
    receipt_metadata = os.lstat(receipt_dir)
    if (
        not stat.S_ISDIR(receipt_metadata.st_mode)
        or receipt_metadata.st_uid != 0
        or receipt_metadata.st_gid != 0
        or stat.S_IMODE(receipt_metadata.st_mode) != 0o700
        or receipt_metadata.st_dev != metadata.st_dev
    ):
        raise ConfigError("offsite receipt directory must be root-private on the reviewed mount")


def _exact_mountinfo_layers(mountpoint: pathlib.Path) -> list[tuple[str, str]]:
    try:
        payload = pathlib.Path("/proc/self/mountinfo").read_bytes()
    except OSError as error:
        raise ConfigError("mount namespace identity is unavailable") from error
    if len(payload) > 4 * 1024 * 1024 or b"\x00" in payload:
        raise ConfigError("mount namespace identity is oversized or malformed")
    try:
        lines = payload.decode("ascii", "strict").splitlines()
    except UnicodeDecodeError as error:
        raise ConfigError("mount namespace identity is not ASCII") from error
    expected = str(mountpoint)
    layers: list[tuple[str, str]] = []
    for line in lines:
        fields = line.split()
        if len(fields) < 10 or "-" not in fields:
            raise ConfigError("mount namespace identity is malformed")
        # OFFSITE_DIR excludes whitespace and backslashes, so its mountinfo
        # spelling is exact and never requires octal escape decoding.
        if fields[4] == expected:
            layers.append((fields[2], fields[3]))
    return layers


def verify_pinned_offsite(
    values: Mapping[str, str],
    *,
    backup_dir: pathlib.Path = pathlib.Path("/opt/gshsapp/root-backup"),
) -> None:
    marker = os.environ.get("GSHSAPP_OFFSITE_PINNED")
    if marker not in {"systemd", "manual"}:
        raise ConfigError("offsite operations require an authenticated private mount namespace")
    try:
        current_namespace = os.stat("/proc/self/ns/mnt")
        host_namespace = os.stat("/proc/1/ns/mnt")
    except OSError as error:
        raise ConfigError("mount namespace identity is unavailable") from error
    if (current_namespace.st_dev, current_namespace.st_ino) == (
        host_namespace.st_dev,
        host_namespace.st_ino,
    ):
        raise ConfigError("offsite operations must not run in the host mount namespace")
    verify_mounted_offsite(values, backup_dir=backup_dir)
    offsite_dir = pathlib.Path(values["OFFSITE_DIR"])
    layers = _exact_mountinfo_layers(offsite_dir)
    if len(layers) < 2 or layers[-1] != layers[-2]:
        raise ConfigError("OFFSITE_DIR is not pinned by an exact same-filesystem bind mount")
    active_device = os.stat(offsite_dir, follow_symlinks=False).st_dev
    expected_device = f"{os.major(active_device)}:{os.minor(active_device)}"
    if layers[-1][0] != expected_device:
        raise ConfigError("pinned offsite mount device changed during verification")


def parse_host_role_text(text: str) -> str:
    if text not in {"test\n", "prod\n"}:
        raise ConfigError("host role must be exactly test or prod")
    return text[:-1]


def parse_config_text(text: str, kind: str, *, host_role: str | None = None) -> dict[str, str]:
    if kind not in {"backup", "deploy"}:
        raise ConfigError("unknown operations configuration kind")
    try:
        text.encode("ascii", "strict")
    except UnicodeEncodeError as error:
        raise ConfigError("configuration must contain ASCII only") from error
    if not text.endswith("\n") or "\r" in text or "\x00" in text:
        raise ConfigError("configuration must use canonical LF-terminated lines")

    values: dict[str, str] = {}
    for line in text[:-1].split("\n"):
        match = _KEY_VALUE.fullmatch(line)
        if match is None:
            raise ConfigError("configuration contains a blank or malformed line")
        key, value = match.groups()
        if key in values:
            raise ConfigError(f"configuration duplicates {key}")
        values[key] = value

    required = _OFFSITE_KEYS if kind == "backup" else _DEPLOY_REQUIRED
    allowed = required | (_BACKUP_OPTIONAL if kind == "backup" else _DEPLOY_OPTIONAL)
    if set(values) - allowed:
        raise ConfigError("configuration contains an unreviewed environment key")
    if required - set(values):
        raise ConfigError("configuration is missing a required environment key")
    _validate_offsite_policy(values)

    if kind == "backup":
        minimum = _parse_positive_integer(values.get("MINIMUM_GENERATIONS", "3"), "MINIMUM_GENERATIONS", 1, 30)
        # Every generation consumes two strict local directory entries. Keep
        # enough headroom below bootstrap-backup.py's 512-entry scan bound for
        # the next pair plus crash partials and one create staging directory.
        maximum = _parse_positive_integer(values.get("MAXIMUM_GENERATIONS", "14"), "MAXIMUM_GENERATIONS", 1, 250)
        if maximum < minimum:
            raise ConfigError("MAXIMUM_GENERATIONS must not be below MINIMUM_GENERATIONS")
        _parse_positive_integer(values.get("MAXIMUM_AGE_DAYS", "30"), "MAXIMUM_AGE_DAYS", 1, 3650)
        _parse_positive_integer(
            values.get("MAXIMUM_TOTAL_BYTES", "21474836480"),
            "MAXIMUM_TOTAL_BYTES",
            1_048_576,
            1_125_899_906_842_624,
        )
        _parse_positive_integer(values.get("BACKUP_FRESHNESS_HOURS", "23"), "BACKUP_FRESHNESS_HOURS", 1, 24)
        if host_role is not None:
            raise ConfigError("backup configuration must not select a host role")
        return values

    if host_role not in {"test", "prod"}:
        raise ConfigError("deploy configuration requires the immutable host role")
    if _SHA_TAG.fullmatch(values["IMAGE_TAG"]) is None:
        raise ConfigError("IMAGE_TAG must identify one exact commit")
    if _IMAGE_DIGEST.fullmatch(values["IMAGE_DIGEST"]) is None:
        raise ConfigError("IMAGE_DIGEST must be one exact sha256 digest")
    expected_origin = "https://test.gshs.app" if host_role == "test" else "https://gshs.app"
    if values["EXPECTED_APP_ORIGIN"] != expected_origin:
        raise ConfigError("EXPECTED_APP_ORIGIN does not match the immutable host role")
    try:
        bind_address = ipaddress.ip_address(values["HOST_BIND_IP"])
    except ValueError as error:
        raise ConfigError("HOST_BIND_IP is malformed") from error
    if not isinstance(bind_address, ipaddress.IPv4Address) or bind_address.is_unspecified or bind_address.is_multicast:
        raise ConfigError("HOST_BIND_IP must be one exact IPv4 interface address")
    for key in ("SSH_SOURCE_CIDR", "PROXY_SOURCE_CIDR"):
        try:
            network = ipaddress.ip_network(values[key], strict=True)
        except ValueError as error:
            raise ConfigError(f"{key} must be one canonical network") from error
        if not isinstance(network, ipaddress.IPv4Network) or network.prefixlen == 0:
            raise ConfigError(f"{key} must be an explicit non-/0 IPv4 network")
        if key == "PROXY_SOURCE_CIDR" and network.prefixlen != 32:
            raise ConfigError("PROXY_SOURCE_CIDR must identify the one reviewed reverse proxy as an IPv4 /32")
    protected_text = values["PROTECTED_INTERNAL_CIDRS"]
    protected_parts = protected_text.split(",")
    if not 1 <= len(protected_parts) <= 32 or any(not part for part in protected_parts):
        raise ConfigError("PROTECTED_INTERNAL_CIDRS must contain 1-32 exact comma-separated networks")
    protected_networks: list[ipaddress.IPv4Network] = []
    for part in protected_parts:
        try:
            network = ipaddress.ip_network(part, strict=True)
        except ValueError as error:
            raise ConfigError("PROTECTED_INTERNAL_CIDRS contains a malformed or non-canonical network") from error
        if not isinstance(network, ipaddress.IPv4Network) or network.prefixlen == 0:
            raise ConfigError("PROTECTED_INTERNAL_CIDRS must contain explicit non-/0 IPv4 networks")
        if any(network.overlaps(existing) for existing in protected_networks):
            raise ConfigError("PROTECTED_INTERNAL_CIDRS must not duplicate or overlap")
        protected_networks.append(network)
    if protected_networks != sorted(protected_networks, key=lambda item: (int(item.network_address), item.prefixlen)):
        raise ConfigError("PROTECTED_INTERNAL_CIDRS must be sorted canonically")
    if not any(bind_address in network for network in protected_networks):
        raise ConfigError("PROTECTED_INTERNAL_CIDRS must contain HOST_BIND_IP")
    allow_public = values.get("ALLOW_PUBLIC_BIND")
    if allow_public is not None and allow_public != "true":
        raise ConfigError("ALLOW_PUBLIC_BIND, when present, must be exactly true")
    rfc1918 = any(
        bind_address in network
        for network in (
            ipaddress.ip_network("10.0.0.0/8"),
            ipaddress.ip_network("172.16.0.0/12"),
            ipaddress.ip_network("192.168.0.0/16"),
        )
    )
    if not (rfc1918 or bind_address.is_loopback) and allow_public != "true":
        raise ConfigError("non-RFC1918 HOST_BIND_IP requires ALLOW_PUBLIC_BIND=true")
    _parse_positive_integer(values.get("HOST_PORT", "1234"), "HOST_PORT", 1024, 65535)
    _parse_positive_integer(values.get("BACKUP_MAX_AGE_HOURS", "24"), "BACKUP_MAX_AGE_HOURS", 1, 168)
    _parse_positive_integer(values.get("SMOKE_TIMEOUT_SECONDS", "90"), "SMOKE_TIMEOUT_SECONDS", 10, 900)
    _parse_positive_integer(values.get("SMOKE_INTERVAL_SECONDS", "3"), "SMOKE_INTERVAL_SECONDS", 1, 30)
    return values


def _assert_secure_ancestry(directory: pathlib.Path) -> None:
    if not directory.is_absolute():
        raise ConfigError("configuration path must be absolute")
    current = pathlib.Path(directory.anchor)
    for component in directory.parts[1:]:
        current /= component
        metadata = os.lstat(current)
        if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
            raise ConfigError(f"unsafe root configuration ancestor: {current}")


def _read_secure_root_file(
    path: pathlib.Path,
    expected_mode: int,
    maximum_bytes: int = 65_536,
    *,
    parent_mode: int = 0o700,
) -> str:
    _assert_secure_ancestry(path.parent)
    parent_metadata = os.lstat(path.parent)
    if stat.S_IMODE(parent_metadata.st_mode) != parent_mode or parent_metadata.st_gid != 0:
        raise ConfigError("root configuration directory has an unexpected owner or mode")
    flags = (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )
    descriptor = os.open(path, flags)
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) != expected_mode
            or metadata.st_nlink != 1
        ):
            raise ConfigError(f"unsafe root configuration file: {path}")
        raw = os.read(descriptor, maximum_bytes + 1)
        if len(raw) > maximum_bytes or os.read(descriptor, 1):
            raise ConfigError("configuration file is too large")
    finally:
        os.close(descriptor)
    try:
        return raw.decode("ascii", "strict")
    except UnicodeDecodeError as error:
        raise ConfigError("configuration must contain ASCII only") from error


def main(argv: list[str] | None = None) -> int:
    effective_argv = sys.argv[1:] if argv is None else argv
    if effective_argv and effective_argv[0] == "assert-lifecycle-quiescent":
        if effective_argv != ["assert-lifecycle-quiescent", "/opt/gshsapp"]:
            print("Operations configuration refused: lifecycle check requires exactly /opt/gshsapp", file=sys.stderr)
            return 1
        try:
            assert_lifecycle_quiescent(pathlib.Path(effective_argv[1]))
        except (ConfigError, OSError) as error:
            print(f"Operations configuration refused: {error}", file=sys.stderr)
            return 1
        return 0
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("backup", "deploy"))
    parser.add_argument("config_file", type=pathlib.Path)
    parser.add_argument("--host-role-file", type=pathlib.Path)
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--print-offsite-dir", action="store_true")
    output.add_argument("--print-offsite-policy", action="store_true")
    output.add_argument("--print-manual-operation-policy", action="store_true")
    output.add_argument("--print-receipt-dir", action="store_true")
    output.add_argument("--print-firewall-policy", action="store_true")
    output.add_argument("--render-service", action="store_true")
    output.add_argument("--render-timer", action="store_true")
    output.add_argument("--verify-mounted-offsite-base", action="store_true")
    output.add_argument("--verify-mounted-offsite", action="store_true")
    output.add_argument("--verify-pinned-offsite", action="store_true")
    arguments = parser.parse_args(effective_argv)
    try:
        role = None
        if arguments.kind == "deploy":
            if arguments.host_role_file is None:
                raise ConfigError("deploy validation requires --host-role-file")
            role = parse_host_role_text(_read_secure_root_file(arguments.host_role_file, 0o400, 32))
        elif arguments.host_role_file is not None:
            raise ConfigError("backup validation does not accept --host-role-file")
        values = parse_config_text(
            _read_secure_root_file(arguments.config_file, 0o600),
            arguments.kind,
            host_role=role,
        )
        if arguments.verify_mounted_offsite_base:
            verify_mounted_offsite(values, require_receipt_dir=False)
        elif arguments.verify_mounted_offsite:
            verify_mounted_offsite(values)
        elif arguments.verify_pinned_offsite:
            verify_pinned_offsite(values)
    except (ConfigError, OSError) as error:
        print(f"Operations configuration refused: {error}", file=sys.stderr)
        return 1
    if arguments.print_offsite_dir:
        print(values["OFFSITE_DIR"])
    elif arguments.print_offsite_policy:
        sys.stdout.write("\n".join(offsite_policy_lines(values)) + "\n")
    elif arguments.print_manual_operation_policy:
        sys.stdout.write("\n".join(manual_operation_policy_lines(values, arguments.kind)) + "\n")
    elif arguments.print_receipt_dir:
        print(offsite_receipt_dir(values))
    elif arguments.print_firewall_policy:
        if arguments.kind != "deploy":
            print("Operations configuration refused: backup has no ingress firewall policy", file=sys.stderr)
            return 1
        sys.stdout.write("\n".join(firewall_policy_lines(values)) + "\n")
    elif arguments.render_service:
        sys.stdout.write(render_service(arguments.kind, values["OFFSITE_DIR"]))
    elif arguments.render_timer:
        if arguments.kind != "backup":
            print("Operations configuration refused: deployment has no timer", file=sys.stderr)
            return 1
        sys.stdout.write(render_backup_timer())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
