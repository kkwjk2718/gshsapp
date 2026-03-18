"use client";

import { useState, useTransition } from "react";
import { updateSongStatus } from "./actions";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RejectSongButtonProps {
  songId: string;
  songTitle: string;
  variant?: "icon" | "full";
}

export function RejectSongButton({ songId, songTitle, variant = "icon" }: RejectSongButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const reason = formData.get("reason") as string;

    startTransition(async () => {
      await updateSongStatus(songId, "REJECTED", reason || undefined);
      setIsOpen(false);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <button
            className="p-2 rounded-lg"
            title="반려"
            style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            className="w-full py-2 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)" }}
          >
            반려
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>신청곡 반려</DialogTitle>
          <DialogDescription>
            <span className="font-bold">&apos;{songTitle}&apos;</span> 곡을 반려합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              반려 사유 <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              placeholder="예: 부적절한 가사, 저작권 문제 등"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 py-3 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "반려하기"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
