export const SONG_RULE_DAYS = [
  { dayOfWeek: 0, label: "일" },
  { dayOfWeek: 1, label: "월" },
  { dayOfWeek: 2, label: "화" },
  { dayOfWeek: 3, label: "수" },
  { dayOfWeek: 4, label: "목" },
  { dayOfWeek: 5, label: "금" },
  { dayOfWeek: 6, label: "토" },
] as const;

export function normalizeAllowedGrade(rawValue: string | null | undefined) {
  const normalized = rawValue?.trim().toUpperCase() ?? "";
  return normalized || "ALL";
}

export function parseAllowedGrades(rawValue: string | null | undefined) {
  const normalized = normalizeAllowedGrade(rawValue);

  if (normalized === "ALL") {
    return [];
  }

  return normalized
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function formatAllowedGradeLabel(rawValue: string | null | undefined) {
  const grades = parseAllowedGrades(rawValue);

  if (grades.length === 0) {
    return "전체 학년";
  }

  return grades.map((grade) => `${grade}학년`).join(", ");
}
