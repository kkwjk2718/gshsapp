"use client";

import { useState, useTransition } from "react";
import { banUser } from "@/app/admin/users/actions";
import { UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface BanUserButtonProps {
  userId: string;
  userName: string;
}

export function BanUserButton({ userId, userName }: BanUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirm(`${userName}님을 정말로 밴하시겠습니까?`)) return;

    const formData = new FormData(event.currentTarget);
    formData.append("userId", userId);

    startTransition(async () => {
      const result = await banUser(formData);
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        alert(`${userName}님을 밴 처리했습니다.`);
        setIsOpen(false);
      }
    });
  };

  const today = new Date();
  today.setDate(today.getDate() + 1); // Ban at least until tomorrow
  const minDate = today.toISOString().split("T")[0];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className="p-2 bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-500 rounded-lg transition-colors"
          title="신청 제한"
        >
          <UserX className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>신청 제한</DialogTitle>
          <DialogDescription>
            <span className="font-bold text-rose-500">{userName}</span>님의
            기상곡 신청을 제한합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label
              htmlFor="banUntil"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              제한 만료일
            </label>
            <input
              type="date"
              id="banUntil"
              name="banUntil"
              min={minDate}
              required
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              제한 사유
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              placeholder="예: 과도한 도배 신청, 부적절한 곡 신청 등"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "신청 제한하기"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
