type NoticePermissionUser = {
  id?: string | null;
  role?: string | null;
} | null | undefined;

export function canCreateNotice(user: NoticePermissionUser) {
  return user?.role === "ADMIN" || user?.role === "TEACHER";
}

export function canCreateUnlimitedNotice(user: NoticePermissionUser) {
  return user?.role === "ADMIN";
}

export function canManageNotice(user: NoticePermissionUser, writerId: string | null | undefined) {
  if (!user?.id) {
    return false;
  }

  return user.role === "ADMIN" || user.id === writerId;
}
