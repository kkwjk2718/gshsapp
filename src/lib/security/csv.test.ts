import { describe, expect, it } from "vitest";

import { encodeCsvCell, neutralizeSpreadsheetFormula, serializeCsv } from "./csv";

describe("CSV security", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)"])(
    "neutralizes formula marker %j",
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`),
  );

  it.each([
    " =1", "\t=1", "\r\n=1", "\u0000=1", "\u001f@x", "\u007f+1",
    "\u0085-1", "\u00a0=1", "\ufeff=1", "\ufeff \t\u0000=1",
  ])("neutralizes ignorable-prefix bypass %j", (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
  });

  it.each(["'=-safe", "text=1", "", "https://gshs.app", "   "])(
    "preserves safe string %j",
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe(value),
  );

  it("quotes every cell and distinguishes string and numeric negatives", () => {
    expect(encodeCsvCell("-42")).toBe("\"'-42\"");
    expect(encodeCsvCell(-42)).toBe('"-42"');
    expect(encodeCsvCell('a,"b"\r\nc')).toBe('"a,""b""\r\nc"');
  });

  it("serializes exact BOM-prefixed RFC rows", () => {
    expect(serializeCsv([["A", "B"], ["=1", null]], { includeUtf8Bom: true }))
      .toBe('\ufeff"A","B"\r\n"\'=1",""\r\n');
    expect(serializeCsv([], { includeUtf8Bom: true })).toBe("\ufeff");
  });
});
