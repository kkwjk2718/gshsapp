import { describe, expect, it } from "vitest";
import { getGradeFromStudentId, isValidStudentId } from "./student-id";

describe("student-id", () => {
  it("accepts valid student ids", () => {
    expect(isValidStudentId("1304")).toBe(true);
    expect(isValidStudentId("2401")).toBe(true);
    expect(isValidStudentId("3412")).toBe(true);
  });

  it("rejects invalid student ids", () => {
    expect(isValidStudentId("0000")).toBe(false);
    expect(isValidStudentId("3601")).toBe(false);
    expect(isValidStudentId("12")).toBe(false);
  });

  it("extracts the grade from a valid student id", () => {
    expect(getGradeFromStudentId("1304")).toBe("1");
    expect(getGradeFromStudentId("2304")).toBe("2");
    expect(getGradeFromStudentId("3401")).toBe("3");
  });

  it("returns null for invalid student ids", () => {
    expect(getGradeFromStudentId("9999")).toBeNull();
  });
});
