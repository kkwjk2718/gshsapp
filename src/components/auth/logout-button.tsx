import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <a
      href="/logout?next=/login"
      className="w-full flex items-center gap-3 px-4 py-2 text-xs rounded-lg transition-colors cursor-pointer"
      style={{ color: "var(--foreground)" }}
    >
      <LogOut className="w-3 h-3" />
      로그아웃
    </a>
  );
}
