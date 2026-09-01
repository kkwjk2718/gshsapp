import { serializeCsv } from "@/lib/security/csv";

export type TokenCsvRow = Readonly<{
  token: string;
  targetRole: string;
  targetGisu: number | null;
  isUsed: boolean;
  usedBy?: Readonly<{ name: string; studentId: string | null; role: string }> | null;
}>;

export function serializeTokenCsv(tokens: readonly TokenCsvRow[]) {
  return serializeCsv([
    ["Token", "Role", "Gisu", "Status", "UsedByName", "UsedByStudentId", "UsedByRole"],
    ...tokens.map((token) => [
      token.token, token.targetRole, token.targetGisu, token.isUsed ? "Used" : "Available",
      token.usedBy?.name ?? "", token.usedBy?.studentId ?? "", token.usedBy?.role ?? "",
    ]),
  ], { includeUtf8Bom: true });
}
