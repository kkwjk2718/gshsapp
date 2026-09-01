export type CsvScalar = string | number | boolean | null | undefined;

export type SerializeCsvOptions = Readonly<{
  includeUtf8Bom?: boolean;
  includeFinalCrLf?: boolean;
}>;

const FORMULA_PREFIX = /^[\s\u0000-\u001f\u007f-\u009f\ufeff]*[=+@-]/u;

export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function encodeCsvCell(value: CsvScalar): string {
  const text = value == null
    ? ""
    : typeof value === "string"
      ? neutralizeSpreadsheetFormula(value)
      : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeCsv(
  rows: readonly (readonly CsvScalar[])[],
  options: SerializeCsvOptions = {},
): string {
  const bom = options.includeUtf8Bom ? "\ufeff" : "";
  if (rows.length === 0) return bom;
  const body = rows.map((row) => row.map(encodeCsvCell).join(",")).join("\r\n");
  return `${bom}${body}${options.includeFinalCrLf === false ? "" : "\r\n"}`;
}
