import type { GradeMapping } from "@/lib/grade-mapping";

export function isValidStudentId(studentId: string) {
  if (!/^\d{4}$/.test(studentId)) {
    return false;
  }

  const grade = Number(studentId[0]);
  const classNum = Number(studentId[1]);

  if (grade < 1 || grade > 3) {
    return false;
  }

  if (grade === 3) {
    return classNum >= 1 && classNum <= 4;
  }

  return classNum >= 1 && classNum <= 5;
}

export function getGradeFromStudentId(studentId: string): keyof GradeMapping | null {
  if (!isValidStudentId(studentId)) {
    return null;
  }

  const grade = studentId[0];
  if (grade === "1" || grade === "2" || grade === "3") {
    return grade;
  }

  return null;
}
