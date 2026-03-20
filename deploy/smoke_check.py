#!/usr/bin/env python3
import json
import sys
import urllib.request


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: smoke_check.py <base_url> <expected_version>", file=sys.stderr)
        return 1

    base_url = sys.argv[1].rstrip("/")
    expected_version = sys.argv[2]
    paths = ["/api/health", "/", "/menu", "/notices"]

    for path in paths:
        request = urllib.request.Request(
            base_url + path,
            headers={"User-Agent": "gshsapp-ci-smoke-check"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            final_url = response.geturl()
            body = response.read()

        if not final_url.startswith(base_url):
            raise SystemExit(f"Unexpected redirect for {path}: {final_url}")

        if path == "/api/health":
            payload = json.loads(body.decode("utf-8"))
            if payload.get("ok") is not True:
                raise SystemExit(f"Health endpoint returned unhealthy payload: {payload}")
            if payload.get("service") != "gshsapp":
                raise SystemExit(f"Unexpected service name: {payload}")
            if payload.get("version") != expected_version:
                raise SystemExit(
                    f"Health endpoint version mismatch: expected {expected_version}, got {payload.get('version')}"
                )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
