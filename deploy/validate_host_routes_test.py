from __future__ import annotations

import importlib.util
import json
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("validate-host-routes.py")
SPEC = importlib.util.spec_from_file_location("validate_host_routes", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


ROUTES = [
    {"dst": "default", "gateway": "172.15.10.1", "dev": "ens18", "protocol": "static"},
    {
        "dst": "172.15.10.0/24",
        "dev": "ens18",
        "protocol": "kernel",
        "scope": "link",
        "prefsrc": "172.15.10.34",
    },
    {
        "dst": "10.20.0.0/24",
        "dev": "ens19",
        "protocol": "kernel",
        "scope": "link",
        "prefsrc": "10.20.0.2",
    },
    {
        "dst": "172.30.0.0/16",
        "dev": "gshsapp0",
        "protocol": "kernel",
        "scope": "link",
        "prefsrc": "172.30.0.1",
    },
]


class HostRouteValidatorTests(unittest.TestCase):
    def validate(self, routes: object = ROUTES, bind: str = "172.15.10.34") -> tuple[str, ...]:
        return VALIDATOR.validate_connected_routes(
            json.dumps(routes, separators=(",", ":")), bind, "gshsapp0"
        )

    def test_protects_non_rfc1918_connected_lan_without_blocking_default_route(self) -> None:
        self.assertEqual(self.validate(), ("172.15.10.0/24",))

    def test_private_connected_lan_is_already_covered_by_baseline_policy(self) -> None:
        private = [
            {
                "dst": "172.20.0.0/16",
                "dev": "ens18",
                "protocol": "kernel",
                "scope": "link",
                "prefsrc": "172.20.0.34",
            }
        ]
        self.assertEqual(self.validate(private, "172.20.0.34"), ())

    def test_rejects_missing_or_spoofed_host_connected_route(self) -> None:
        for mutation in (
            [],
            [{**ROUTES[1], "prefsrc": "172.15.10.35"}],
            [{**ROUTES[1], "protocol": "static"}],
            [{**ROUTES[1], "dev": "gshsapp0"}],
            [{**ROUTES[1], "dst": "172.15.10.1/24"}],
        ):
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.validate(mutation)


if __name__ == "__main__":
    unittest.main()
