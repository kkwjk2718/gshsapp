export const USER_ROLES = [
  "STUDENT",
  "TEACHER",
  "BROADCAST",
  "ADMIN",
  "GRADUATE",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: "학생",
  TEACHER: "교사",
  BROADCAST: "방송부",
  ADMIN: "관리자",
  GRADUATE: "졸업생",
};

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function canAccessAdmin(role: string | null | undefined) {
  return role === "ADMIN";
}

export function canAccessBroadcastStudio(role: string | null | undefined) {
  return role === "BROADCAST" || role === "ADMIN";
}

export function canEditLinks(role: string | null | undefined) {
  return role === "TEACHER" || role === "ADMIN";
}

export function canAccessCoreMemberFeatures(role: string | null | undefined) {
  return !!role && role !== "GRADUATE";
}

export function canChangeGisu(role: string | null | undefined) {
  return role === "STUDENT" || role === "BROADCAST" || role === "GRADUATE";
}

export function shouldHideRestrictedNav(role: string | null | undefined) {
  return role === "GRADUATE";
}

