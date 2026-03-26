"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { updateSongStatus } from "./actions";

interface ApproveSongButtonProps {
  songId: string;
  songTitle: string;
  approved?: boolean;
  variant?: "icon" | "full";
}

export function ApproveSongButton({
  songId,
  songTitle,
  approved = false,
  variant = "icon",
}: ApproveSongButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (approved || isPending) {
      return;
    }

    startTransition(async () => {
      try {
        await updateSongStatus(songId, "APPROVED");
        toast.success(`'${songTitle}' 곡을 승인했습니다.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "승인 처리 중 오류가 발생했습니다.");
      }
    });
  };

  const backgroundColor = approved ? "#16a34a" : "var(--surface-2)";
  const foregroundColor = approved ? "#f8fafc" : "var(--accent)";

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={approved || isPending}
        className="w-full rounded-lg py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
        style={{ backgroundColor, color: foregroundColor, opacity: isPending ? 0.7 : 1 }}
      >
        {approved ? "승인됨" : isPending ? "처리 중..." : "승인"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={approved || isPending}
      title={approved ? "승인됨" : "승인"}
      className="rounded-lg p-2 transition-colors disabled:cursor-not-allowed"
      style={{ backgroundColor, color: foregroundColor, opacity: isPending ? 0.7 : 1 }}
    >
      <Check className="h-4 w-4" />
    </button>
  );
}
