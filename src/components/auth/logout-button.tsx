"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.assign("/login");
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-4 py-2 text-xs rounded-lg transition-colors"
      style={{ color: "var(--foreground)" }}
    >
      <LogOut className="w-3 h-3" />
      로그아웃
    </button>
  );
}
