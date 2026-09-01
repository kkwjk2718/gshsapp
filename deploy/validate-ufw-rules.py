#!/usr/bin/env python3
"""Fail-closed validation for the UFW rules managed by host-hardening.sh."""

from __future__ import annotations

import argparse
import ipaddress
import shlex
import sys
from collections import Counter
from dataclasses import dataclass


REPORT_HEADER = "Added user rules (see 'ufw status' for running firewall):"
MAX_REPORT_LINES = 64
MAX_LINE_LENGTH = 4096


class RulePolicyError(ValueError):
    pass


@dataclass(frozen=True)
class IngressRule:
    source: ipaddress.IPv4Network
    destination: ipaddress.IPv4Network
    port: int
    protocol: str


def ipv4_network(value: str, *, host_only: bool = False) -> ipaddress.IPv4Network:
    try:
        network = ipaddress.ip_network(value, strict=False)
    except ValueError as error:
        raise RulePolicyError(f"invalid IPv4 address or network: {value!r}") from error
    if not isinstance(network, ipaddress.IPv4Network):
        raise RulePolicyError("IPv6 UFW rules are not permitted")
    if host_only and network.prefixlen != network.max_prefixlen:
        raise RulePolicyError("UFW destination must be one explicit IPv4 host")
    return network


def parse_rule(line: str) -> IngressRule:
    try:
        tokens = shlex.split(line, posix=True)
    except ValueError as error:
        raise RulePolicyError("unexpected UFW rule with invalid quoting") from error
    if tokens[:2] != ["ufw", "allow"]:
        raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")

    values: dict[str, str] = {}
    direction_seen = False
    last_endpoint: str | None = None
    index = 2
    while index < len(tokens):
        token = tokens[index]
        if token == "in":
            if direction_seen:
                raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")
            direction_seen = True
            index += 1
            continue
        if token not in {"proto", "from", "to", "port", "comment"}:
            raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")
        if index + 1 >= len(tokens) or token in values:
            raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")
        value = tokens[index + 1]
        if token in {"from", "to"}:
            last_endpoint = token
        elif token == "port" and last_endpoint != "to":
            raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")
        values[token] = value
        index += 2

    required_fields = {"proto", "from", "to", "port"}
    if not required_fields.issubset(values) or not set(values).issubset(
        required_fields | {"comment"}
    ):
        raise RulePolicyError(f"unexpected UFW rule: {line[:200]}")
    try:
        port = int(values["port"])
    except ValueError as error:
        raise RulePolicyError(f"unexpected UFW rule: {line[:200]}") from error

    return IngressRule(
        source=ipv4_network(values["from"]),
        destination=ipv4_network(values["to"], host_only=True),
        port=port,
        protocol=values["proto"],
    )


def parse_report(report: str) -> list[IngressRule]:
    lines = report.splitlines()
    if len(lines) > MAX_REPORT_LINES or any(
        len(line) > MAX_LINE_LENGTH for line in lines
    ):
        raise RulePolicyError("UFW report exceeds the validation limit")

    header_seen = False
    rules: list[IngressRule] = []
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        if line == REPORT_HEADER and not header_seen:
            header_seen = True
            continue
        if line == REPORT_HEADER or not header_seen:
            raise RulePolicyError(f"unexpected UFW report line: {line[:200]}")
        rules.append(parse_rule(line))
    if not header_seen:
        raise RulePolicyError("UFW report header is missing")
    return rules


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ssh-source", required=True)
    parser.add_argument("--proxy-source", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--app-port", required=True, type=int)
    parser.add_argument("--allow-empty", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        ssh_source = ipv4_network(args.ssh_source)
        proxy_source = ipv4_network(args.proxy_source)
        destination = ipv4_network(args.destination, host_only=True)
        rules = parse_report(sys.stdin.read())
        expected = Counter(
            {
                IngressRule(
                    ssh_source,
                    destination,
                    22,
                    "tcp",
                ): 1,
                IngressRule(
                    proxy_source,
                    destination,
                    args.app_port,
                    "tcp",
                ): 1,
            }
        )
        actual = Counter(rules)
        if not actual and args.allow_empty:
            print("0")
            return 0
        if actual != expected:
            raise RulePolicyError(
                "UFW must contain exactly two intended ingress rules "
                "(SSH admin and reverse proxy)"
            )
    except RulePolicyError as error:
        print(f"UFW rule policy rejected the report: {error}", file=sys.stderr)
        return 1

    print("2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
