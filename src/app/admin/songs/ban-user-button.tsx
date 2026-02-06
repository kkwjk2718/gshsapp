"use client";

import { useState, useTransition } from "react";
import { banUser } from "@/app/admin/users/actions";
import { UserX, X } from "lucide-react";

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
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-500 transition-colors"
        title="신청 제한"
      >
        <UserX className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-900 rounded-3xl p-8 max-w-sm w-full relative shadow-2xl border border-slate-800">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold mb-2">신청 제한</h2>
            <p className="text-sm text-slate-500 mb-6">
              <span className="font-bold text-rose-500">{userName}</span>님의
              기상곡 신청을 특정 날짜까지 제한합니다.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "처리 중..." : "신청 제한하기"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
