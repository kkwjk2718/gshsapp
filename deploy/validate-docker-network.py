#!/usr/bin/env python3
"""Validate the immutable Docker bridge identity used by root firewall policy."""

from __future__ import annotations

import ipaddress
import json
import sys


def validate_network(
    text: str,
    name: str,
    bridge: str,
    label_key: str,
    label_value: str,
) -> tuple[str, str, str]:
    try:
        value = json.loads(text)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ValueError(f"malformed Docker network inspection: {error}") from error
    if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], dict):
        raise ValueError("Docker network inspection must contain exactly one object")
    network = value[0]
    expected_scalars = {
        "Name": name,
        "Driver": "bridge",
        "Scope": "local",
        "Internal": False,
        "Attachable": False,
        "Ingress": False,
        "ConfigOnly": False,
        "EnableIPv6": False,
    }
    for key, expected in expected_scalars.items():
        if network.get(key) != expected:
            raise ValueError(f"unsafe Docker network property: {key}")
    identifier = network.get("Id")
    if (
        not isinstance(identifier, str)
        or len(identifier) != 64
        or any(character not in "0123456789abcdef" for character in identifier)
    ):
        raise ValueError("Docker network identity is malformed")
    if network.get("Labels") != {label_key: label_value}:
        raise ValueError("Docker network labels are not exact")
    if network.get("Options") != {"com.docker.network.bridge.name": bridge}:
        raise ValueError("Docker bridge interface option is not exact")
    ipam = network.get("IPAM")
    if (
        not isinstance(ipam, dict)
        or ipam.get("Driver") != "default"
        or ipam.get("Options") not in (None, {})
    ):
        raise ValueError("Docker network IPAM driver/options are not exact")
    configs = ipam.get("Config")
    if not isinstance(configs, list) or len(configs) != 1 or not isinstance(configs[0], dict):
        raise ValueError("Docker network must have exactly one IPv4 IPAM configuration")
    config = configs[0]
    if set(config) != {"Subnet", "Gateway"}:
        raise ValueError("Docker network IPAM configuration has unexpected fields")
    try:
        subnet = ipaddress.ip_network(config["Subnet"], strict=True)
        gateway = ipaddress.ip_address(config["Gateway"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"Docker network addressing is malformed: {error}") from error
    rfc1918 = tuple(
        ipaddress.ip_network(item)
        for item in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    )
    if (
        not isinstance(subnet, ipaddress.IPv4Network)
        or not any(subnet.subnet_of(parent) for parent in rfc1918)
        or not 16 <= subnet.prefixlen <= 28
        or gateway != subnet.network_address + 1
    ):
        raise ValueError(
            "Docker network must use one canonical RFC1918 /16-/28 with its first address as gateway"
        )
    return str(subnet), str(gateway), identifier


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print("usage: validate-docker-network.py NAME BRIDGE LABEL_KEY LABEL_VALUE", file=sys.stderr)
        return 2
    try:
        values = validate_network(sys.stdin.read(), *argv[1:])
    except ValueError as error:
        print(f"Docker network refused: {error}", file=sys.stderr)
        return 1
    sys.stdout.write("\n".join(values) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
