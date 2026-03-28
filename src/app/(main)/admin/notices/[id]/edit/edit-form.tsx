"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Calendar } from "lucide-react";
import { formatKST } from "@/lib/date-utils";
import { updateNotice } from "../../actions";

interface Category {
  id: string;
  label: string;
  value: string;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  category: string;
  expiresAt: Date | string | null;
}

function toDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

export function EditNoticeForm({ notice, categories }: { notice: Notice; categories: Category[] }) {
  const [title, setTitle] = useState(notice.title);
  const [category, setCategory] = useState(notice.category);
  const [content, setContent] = useState(notice.content);
  const maxLength = 1000;
  const expiresAt = toDate(notice.expiresAt);
  const hasChanges = title !== notice.title || category !== notice.category || content !== notice.content;
  const periodLabel = expiresAt ? `${formatKST(expiresAt, "yyyy.MM.dd")}까지` : "상시 공지";

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href={`/notices/${notice.id}`}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">공지 수정</h1>
      </div>

      <form action={updateNotice} className="glass p-8 rounded-3xl space-y-6">
        <input type="hidden" name="id" value={notice.id} />

        <div className="space-y-2">
          <label className="font-semibold text-sm">제목</label>
          <input
            name="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="공지 제목을 입력하세요"
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="font-semibold text-sm">카테고리</label>
            <select
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map((item) => (
                <option key={item.id} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-sm">게시 기간</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={periodLabel}
                disabled
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-slate-500">기간 수정은 현재 비활성화되어 있습니다.</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="font-semibold text-sm">내용</label>
            <span className={`text-xs ${content.length >= maxLength ? "text-rose-500 font-bold" : "text-slate-400"}`}>
              {content.length} / {maxLength}자
            </span>
          </div>
          <textarea
            name="content"
            rows={10}
            maxLength={maxLength}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="공지 내용을 입력하세요 (최대 1000자)"
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="pt-4 space-y-2">
          <button
            type="submit"
            disabled={!hasChanges}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            수정 완료
          </button>
          <p className="text-xs text-slate-500 text-center">
            {hasChanges ? "변경 사항을 저장할 수 있습니다." : "변경 사항이 있을 때만 저장할 수 있습니다."}
          </p>
        </div>
      </form>
    </div>
  );
}
