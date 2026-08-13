from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-ufw-rules.py")
REPORT_HEADER = "Added user rules (see 'ufw status' for running firewall):"
BASE_ARGS = [
    "--ssh-source",
    "10.20.0.0/24",
    "--proxy-source",
    "10.30.0.0/24",
    "--destination",
    "10.40.0.12",
    "--app-port",
    "1234",
]


def validate(
    report: str, *, allow_empty: bool = True
) -> subprocess.CompletedProcess[str]:
    args = [*BASE_ARGS, *(["--allow-empty"] if allow_empty else [])]
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=report,
        text=True,
        capture_output=True,
        check=False,
    )


class UfwRulePolicyTests(unittest.TestCase):
    def test_accepts_exact_ssh_and_reverse_proxy_rules(self) -> None:
        result = validate(
            """Added user rules (see 'ufw status' for running firewall):
ufw allow proto tcp from 10.30.0.0/24 to 10.40.0.12 port 1234 comment 'gshsapp reverse proxy'
ufw allow from 10.20.0.0/24 to 10.40.0.12 port 22 proto tcp comment 'gshsapp ssh admin'
"""
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "2\n")

    def test_accepts_exact_security_boundary_without_comments(self) -> None:
        result = validate(
            """Added user rules (see 'ufw status' for running firewall):
ufw allow from 10.20.0.0/24 to 10.40.0.12 port 22 proto tcp
ufw allow from 10.30.0.0/24 to 10.40.0.12 port 1234 proto tcp
"""
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "2\n")

    def test_rejects_empty_rule_set_after_apply(self) -> None:
        result = validate(
            "Added user rules (see 'ufw status' for running firewall):\n",
            allow_empty=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exactly two", result.stderr)

    def test_rejects_preexisting_broad_ssh_allow_rule(self) -> None:
        result = validate(
            """Added user rules (see 'ufw status' for running firewall):
ufw allow 22/tcp
"""
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unexpected UFW rule", result.stderr)

    def test_rejects_route_ipv6_and_other_extra_allow_rules(self) -> None:
        intended = """Added user rules (see 'ufw status' for running firewall):
ufw allow from 10.20.0.0/24 to 10.40.0.12 port 22 proto tcp comment 'gshsapp ssh admin'
ufw allow from 10.30.0.0/24 to 10.40.0.12 port 1234 proto tcp comment 'gshsapp reverse proxy'
"""
        extras = {
            "route": (
                "ufw route allow proto tcp from 10.0.0.0/8 to any port 443",
                "unexpected UFW rule",
            ),
            "IPv6": (
                "ufw allow proto tcp from 2001:db8::/32 to any port 22",
                "IPv6 UFW rules are not permitted",
            ),
            "different allow": (
                "ufw allow from 10.50.0.0/24 to 10.40.0.12 port 443 proto tcp",
                "exactly two",
            ),
        }

        for label, (extra, reason) in extras.items():
            with self.subTest(label=label):
                result = validate(f"{intended}{extra}\n")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(reason, result.stderr)

    def test_rejects_rules_with_wrong_boundary_fields(self) -> None:
        ssh_rule = (
            "ufw allow from 10.20.0.0/24 to 10.40.0.12 port 22 proto tcp "
            "comment 'gshsapp ssh admin'"
        )
        proxy_rule = (
            "ufw allow from 10.30.0.0/24 to 10.40.0.12 port 1234 proto tcp "
            "comment 'gshsapp reverse proxy'"
        )
        mutations = {
            "source": ssh_rule.replace("10.20.0.0/24", "10.21.0.0/24"),
            "destination": ssh_rule.replace("10.40.0.12", "10.40.0.13"),
            "port": ssh_rule.replace("port 22", "port 2222"),
            "protocol": ssh_rule.replace("proto tcp", "proto udp"),
        }

        for label, mutated_ssh_rule in mutations.items():
            with self.subTest(label=label):
                result = validate(
                    f"{REPORT_HEADER}\n{mutated_ssh_rule}\n{proxy_rule}\n"
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("exactly two", result.stderr)

    def test_rejects_duplicate_or_partial_intended_rule_sets(self) -> None:
        ssh_rule = (
            "ufw allow from 10.20.0.0/24 to 10.40.0.12 port 22 proto tcp "
            "comment 'gshsapp ssh admin'"
        )
        proxy_rule = (
            "ufw allow from 10.30.0.0/24 to 10.40.0.12 port 1234 proto tcp "
            "comment 'gshsapp reverse proxy'"
        )
        reports = {
            "duplicate": f"{REPORT_HEADER}\n{ssh_rule}\n{ssh_rule}\n{proxy_rule}\n",
            "partial": f"{REPORT_HEADER}\n{ssh_rule}\n",
        }

        for label, report in reports.items():
            with self.subTest(label=label):
                result = validate(report)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("exactly two", result.stderr)


if __name__ == "__main__":
    unittest.main()
