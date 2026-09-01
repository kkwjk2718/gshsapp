import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "deploy", "host-hardening.sh"), "utf8");

describe("host hardening operator boundary", () => {
  it("is a dry-run by default and requires explicit topology before apply", () => {
    expect(script).toContain('local mode="${1:---dry-run}"');
    for (const required of ["PROXY_SOURCE_CIDR", "SSH_SOURCE_CIDR", "SSH_ADMIN_USER", "HOST_BIND_IP"]) {
      expect(script).toContain(`${required}:?`);
    }
    expect(script).toContain('[[ "$EUID" -eq 0 ]]');
    expect(script).toContain("HOST_BIND_IP is not assigned to this host");
  });

  it("never authorizes broad ingress and makes SSH key-only before enabling UFW", () => {
    expect(script).toContain("Broad /0 firewall sources are forbidden");
    expect(script).toContain("PasswordAuthentication no");
    expect(script).toContain("AuthenticationMethods publickey");
    expect(script).toContain('ufw default deny incoming');
    expect(script).toContain('ufw allow from "$PROXY_SOURCE_CIDR" to "$HOST_BIND_IP" port "$APP_PORT"');
    expect(script).not.toMatch(/ufw allow (?:1234|OpenSSH)/u);
  });
});
