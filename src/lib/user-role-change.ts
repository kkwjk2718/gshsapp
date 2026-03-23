import type { GradeMapping } from "@/lib/grade-mapping";
import { getGradeFromStudentId, isValidStudentId } from "@/lib/student-id";

export const USER_ROLES = ["STUDENT", "TEACHER", "BROADCAST", "ADMIN"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export class UserRoleChangeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ROLE"
      | "STUDENT_ID_REQUIRED"
      | "INVALID_STUDENT_ID"
      | "GRADE_MAPPING_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "UserRoleChangeError";
  }
}

type ResolveUserRoleChangeInput = {
  currentStudentId: string | null;
  currentGisu: number | null;
  targetRole: string;
  studentIdInput?: string | null;
  gradeMapping?: GradeMapping;
};

export type ResolvedUserRoleChange = {
  role: UserRole;
  studentId: string | null;
  gisu: number | null;
};

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function resolveUserRoleChange({
  currentStudentId,
  currentGisu,
  targetRole,
  studentIdInput,
  gradeMapping,
}: ResolveUserRoleChangeInput): ResolvedUserRoleChange {
  if (!isUserRole(targetRole)) {
    throw new UserRoleChangeError("INVALID_ROLE", "지원하지 않는 권한입니다.");
  }

  if (targetRole === "ADMIN") {
    return {
      role: "ADMIN",
      studentId: currentStudentId,
      gisu: null,
    };
  }

  if (targetRole === "BROADCAST") {
    return {
      role: "BROADCAST",
      studentId: currentStudentId,
      gisu: currentGisu,
    };
  }

  if (targetRole === "TEACHER") {
    return {
      role: "TEACHER",
      studentId: null,
      gisu: null,
    };
  }

  const normalizedStudentId = (studentIdInput ?? "").trim();
  if (!normalizedStudentId) {
    throw new UserRoleChangeError("STUDENT_ID_REQUIRED", "학생 권한에는 학생번호가 필요합니다.");
  }

  if (!isValidStudentId(normalizedStudentId)) {
    throw new UserRoleChangeError("INVALID_STUDENT_ID", "학생번호 형식이 올바르지 않습니다.");
  }

  const grade = getGradeFromStudentId(normalizedStudentId);
  const nextGisu = grade ? gradeMapping?.[grade] : null;

  if (!nextGisu) {
    throw new UserRoleChangeError("GRADE_MAPPING_MISSING", "학년-기수 매핑을 찾을 수 없습니다.");
  }

  return {
    role: "STUDENT",
    studentId: normalizedStudentId,
    gisu: nextGisu,
  };
}
