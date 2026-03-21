import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <a
      href="/logout?next=/login"
      className={cn("w-full flex items-center gap-3 px-4 py-2 text-xs rounded-lg transition-colors cursor-pointer", className)}
      style={{ color: "var(--foreground)" }}
    >
      <LogOut className="w-3 h-3" />
      로그아웃
    </a>
  );
}
