#!/usr/bin/env python3
"""Select exact connected host prefixes that containers must never reach."""

from __future__ import annotations

import ipaddress
import json
import re
import sys


_INTERFACE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,14}$")
_BASELINE = tuple(
    ipaddress.ip_network(item)
    for item in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.168.0.0/16",
    )
)


def validate_connected_routes(text: str, host_bind_ip: str, web_bridge: str) -> tuple[str, ...]:
    try:
        host = ipaddress.ip_address(host_bind_ip)
    except ValueError as error:
        raise ValueError("HOST_BIND_IP is malformed") from error
    if not isinstance(host, ipaddress.IPv4Address):
        raise ValueError("HOST_BIND_IP must be IPv4")
    try:
        routes = json.loads(text)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ValueError(f"host route inspection is malformed: {error}") from error
    if not isinstance(routes, list) or len(routes) > 4096:
        raise ValueError("host route inspection must be a bounded array")
    protected: set[ipaddress.IPv4Network] = set()
    host_route_found = False
    for route in routes:
        if not isinstance(route, dict):
            raise ValueError("host route entry must be an object")
        if route.get("scope") != "link" or route.get("protocol") != "kernel":
            continue
        destination = route.get("dst")
        interface = route.get("dev")
        preferred_source = route.get("prefsrc")
        if not isinstance(destination, str) or not isinstance(interface, str):
            raise ValueError("connected host route lacks destination or interface")
        if _INTERFACE.fullmatch(interface) is None:
            raise ValueError("connected host route interface is malformed")
        try:
            network = ipaddress.ip_network(destination, strict=True)
        except ValueError as error:
            raise ValueError("connected host route destination is non-canonical") from error
        if not isinstance(network, ipaddress.IPv4Network) or network.prefixlen == 0:
            raise ValueError("connected host route must be an explicit IPv4 prefix")
        if host in network:
            if preferred_source != str(host) or interface in {"lo", web_bridge}:
                raise ValueError("HOST_BIND_IP connected route identity is unsafe")
            host_route_found = True
        if interface in {"lo", web_bridge} or interface.startswith(("docker", "veth", "br-")):
            continue
        if any(network.subnet_of(baseline) for baseline in _BASELINE):
            continue
        protected.add(network)
    if not host_route_found:
        raise ValueError("HOST_BIND_IP has no exact kernel connected route")
    ordered = sorted(protected, key=lambda item: (int(item.network_address), item.prefixlen))
    for index, network in enumerate(ordered):
        if any(network.overlaps(other) for other in ordered[:index]):
            raise ValueError("connected host routes overlap")
    return tuple(str(network) for network in ordered)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: validate-host-routes.py HOST_BIND_IP WEB_BRIDGE", file=sys.stderr)
        return 2
    try:
        values = validate_connected_routes(sys.stdin.read(), argv[1], argv[2])
    except ValueError as error:
        print(f"Host routes refused: {error}", file=sys.stderr)
        return 1
    if values:
        sys.stdout.write("\n".join(values) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
