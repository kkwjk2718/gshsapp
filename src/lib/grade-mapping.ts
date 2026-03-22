export const DEFAULT_GRADE_MAPPING = {
  "1": 42,
  "2": 41,
  "3": 40,
} as const;

export type GradeMapping = Record<keyof typeof DEFAULT_GRADE_MAPPING, number>;

function isValidGradeValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseGradeMapping(rawValue: string | null | undefined): GradeMapping {
  if (!rawValue) {
    return { ...DEFAULT_GRADE_MAPPING };
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;

    return {
      "1": isValidGradeValue(parsedValue["1"]) ? parsedValue["1"] : DEFAULT_GRADE_MAPPING["1"],
      "2": isValidGradeValue(parsedValue["2"]) ? parsedValue["2"] : DEFAULT_GRADE_MAPPING["2"],
      "3": isValidGradeValue(parsedValue["3"]) ? parsedValue["3"] : DEFAULT_GRADE_MAPPING["3"],
    };
  } catch {
    return { ...DEFAULT_GRADE_MAPPING };
  }
}
