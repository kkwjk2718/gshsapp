from __future__ import annotations

import importlib.util
import json
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("validate-docker-network.py")
SPEC = importlib.util.spec_from_file_location("validate_docker_network", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


def network_fixture() -> dict[str, object]:
    return {
        "Name": "gshsapp-web",
        "Id": "0123456789abcdef" * 4,
        "Driver": "bridge",
        "Scope": "local",
        "EnableIPv6": False,
        "IPAM": {
            "Driver": "default",
            "Options": {},
            "Config": [{"Subnet": "172.30.0.0/16", "Gateway": "172.30.0.1"}],
        },
        "Internal": False,
        "Attachable": False,
        "Ingress": False,
        "ConfigOnly": False,
        "Options": {"com.docker.network.bridge.name": "gshsapp0"},
        "Labels": {"app.gshsapp.security-boundary": "web-v1"},
        "Containers": {},
    }


class DockerNetworkValidatorTests(unittest.TestCase):
    def validate(self, value: object) -> tuple[str, str, str]:
        return VALIDATOR.validate_network(
            json.dumps([value], separators=(",", ":")),
            "gshsapp-web",
            "gshsapp0",
            "app.gshsapp.security-boundary",
            "web-v1",
        )

    def test_accepts_exact_dynamically_allocated_private_bridge(self) -> None:
        self.assertEqual(
            self.validate(network_fixture()),
            ("172.30.0.0/16", "172.30.0.1", "0123456789abcdef" * 4),
        )

    def test_rejects_wrong_identity_driver_or_host_interface(self) -> None:
        for key, value in (
            ("Name", "default"),
            ("Driver", "host"),
            ("Internal", True),
            ("Attachable", True),
            ("EnableIPv6", True),
            ("Labels", {}),
            ("Options", {"com.docker.network.bridge.name": "docker0"}),
        ):
            fixture = network_fixture()
            fixture[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.validate(fixture)

    def test_rejects_public_overbroad_or_noncanonical_ipam(self) -> None:
        for config in (
            {"Subnet": "8.8.0.0/16", "Gateway": "8.8.0.1"},
            {"Subnet": "10.0.0.0/8", "Gateway": "10.0.0.1"},
            {"Subnet": "172.30.0.0/16", "Gateway": "172.30.0.2"},
            {"Subnet": "172.30.0.1/16", "Gateway": "172.30.0.1"},
            {"Subnet": "172.30.0.0/16", "Gateway": "172.30.0.1", "IPRange": "172.30.1.0/24"},
        ):
            fixture = network_fixture()
            fixture["IPAM"] = {"Driver": "default", "Options": {}, "Config": [config]}
            with self.subTest(config=config), self.assertRaises(ValueError):
                self.validate(fixture)


if __name__ == "__main__":
    unittest.main()
