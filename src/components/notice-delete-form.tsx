"use client";

import type { FormEvent, ReactNode } from "react";
import { deleteNotice } from "@/app/(main)/admin/notices/actions";

type NoticeDeleteFormProps = {
  noticeId: string;
  redirectTo?: string;
  confirmMessage?: string;
  buttonClassName: string;
  buttonType?: "button" | "submit";
  ariaLabel?: string;
  children: ReactNode;
};

export function NoticeDeleteForm({
  noticeId,
  redirectTo,
  confirmMessage = "이 공지를 삭제하시겠습니까?",
  buttonClassName,
  buttonType = "submit",
  ariaLabel,
  children,
}: NoticeDeleteFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!confirm(confirmMessage)) {
      event.preventDefault();
    }
  };

  return (
    <form action={deleteNotice} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={noticeId} />
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <button type={buttonType} aria-label={ariaLabel} className={buttonClassName}>
        {children}
      </button>
    </form>
  );
}
