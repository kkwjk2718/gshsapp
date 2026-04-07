"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  MEMBER_SERVICE_SUSPENDED,
  MEMBER_SERVICE_SUSPENSION_NOTICE_STORAGE_KEY,
  MEMBER_SERVICE_SUSPENSION_PARAGRAPHS,
  MEMBER_SERVICE_SUSPENSION_TITLE,
} from "@/lib/member-service-suspension";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MemberServiceSuspensionModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!MEMBER_SERVICE_SUSPENDED) {
      return;
    }

    try {
      const isDismissed = window.localStorage.getItem(
        MEMBER_SERVICE_SUSPENSION_NOTICE_STORAGE_KEY,
      );

      if (!isDismissed) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const closeNotice = () => {
    try {
      window.localStorage.setItem(
        MEMBER_SERVICE_SUSPENSION_NOTICE_STORAGE_KEY,
        "dismissed",
      );
    } catch {
      // localStorage를 사용할 수 없으면 현재 세션에서만 닫습니다.
    }

    setOpen(false);
  };

  if (!MEMBER_SERVICE_SUSPENDED) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeNotice())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-[1.75rem] border border-amber-200 bg-white p-0 dark:border-amber-500/20 dark:bg-slate-950">
        <div className="border-b border-amber-200/80 bg-amber-50/80 px-6 py-5 dark:border-amber-500/10 dark:bg-amber-500/10">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl text-amber-900 dark:text-amber-100">
              {MEMBER_SERVICE_SUSPENSION_TITLE}
            </DialogTitle>
            <DialogDescription className="text-sm text-amber-900/80 dark:text-amber-100/80">
              로그인 기능과 회원 전용 기능이 학교 검토 완료 시점까지 일시 중지됩니다.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-6 text-sm leading-7 text-slate-700 dark:text-slate-200">
          {MEMBER_SERVICE_SUSPENSION_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900/70">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              자세한 내용은 공지사항에서 다시 확인할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/notices"
                onClick={closeNotice}
                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                공지사항으로 이동
              </Link>
              <a
                href="mailto:admin@gshs.app"
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                admin@gshs.app
              </a>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 border-t border-slate-200 px-6 py-5 dark:border-slate-800">
          <button
            type="button"
            onClick={closeNotice}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={closeNotice}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
