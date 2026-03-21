import type { MouseEventHandler } from "react";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  className?: string;
  next?: string;
  testId?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function LogoutButton({
  className,
  next = "/login",
  testId,
  onClick,
}: LogoutButtonProps) {
  return (
    <a
      href={`/logout?next=${encodeURIComponent(next)}`}
      data-testid={testId}
      onClick={onClick}
      className={cn("w-full flex items-center gap-3 px-4 py-2 text-xs rounded-lg transition-colors cursor-pointer", className)}
      style={{ color: "var(--foreground)" }}
    >
      <LogOut className="w-3 h-3" />
      로그아웃
    </a>
  );
}
