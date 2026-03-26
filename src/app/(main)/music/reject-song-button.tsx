"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { updateSongStatus } from "./actions";
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

export function RejectSongButton({
  songId,
  songTitle,
  variant = "icon",
}: RejectSongButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const reason = formData.get("reason") as string;

    startTransition(async () => {
      try {
        await updateSongStatus(songId, "REJECTED", reason || undefined);
        setIsOpen(false);
        toast.success("신청곡을 반려했습니다.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "반려 처리 중 오류가 발생했습니다.");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <button
            className="rounded-lg p-2"
            title="반려"
            style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            className="w-full rounded-lg py-2 text-sm font-semibold"
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
            <label htmlFor="reason" className="mb-1 block text-sm font-medium">
              반려 사유 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              placeholder="예: 부적절한 가사, 중복 신청, 운영상 제외"
              className="w-full resize-none rounded-xl border border-transparent bg-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-slate-800"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 font-bold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-rose-600 py-3 font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "반려하기"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
