"use client";

import { ArrowLeft, Calendar, Clock3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NoticePeriodPicker } from "@/components/notice-period-picker";
import { formatNoticeWindowLabel, getNoticeFormDateRange, getNoticeWindowPreview } from "@/lib/notice-window";
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
  startsAt: Date | string | null;
  expiresAt: Date | string | null;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
    >
      {pending ? "수정 중..." : "수정 완료"}
    </button>
  );
}

export function EditNoticeForm({
  notice,
  categories,
  canCreateUnlimited,
}: {
  notice: Notice;
  categories: Category[];
  canCreateUnlimited: boolean;
}) {
  const initialRange = getNoticeFormDateRange({
    startsAt: notice.startsAt,
    expiresAt: notice.expiresAt,
  });
  const periodEditingDisabled = true;
  const [title, setTitle] = useState(notice.title);
  const [category, setCategory] = useState(notice.category);
  const [content, setContent] = useState(notice.content);
  const isUnlimited = initialRange.unlimited;
  const isDetailedPeriod = initialRange.detailedPeriod;
  const startDate = initialRange.startDate;
  const endDate = initialRange.endDate;
  const maxLength = 1000;
  const hasPeriodSelection = startDate.length > 0 && endDate.length > 0;
  const periodPreview = isUnlimited
    ? "상시 공지"
    : isDetailedPeriod
      ? hasPeriodSelection
        ? getNoticeWindowPreview(startDate, endDate)
        : "날짜를 선택해 주세요."
      : formatNoticeWindowLabel({
          startsAt: notice.startsAt,
          expiresAt: notice.expiresAt,
        });
  const periodDescription = isDetailedPeriod
    ? "선택한 시작일 19:00부터 종료일 다음날 05:00까지 공지가 노출됩니다."
    : "작성 즉시 노출되는 기본 기간 형식입니다.";
  const hasChanges =
    title !== notice.title ||
    category !== notice.category ||
    content !== notice.content;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Link
          href={`/notices/${notice.id}`}
          className="rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">공지 수정</h1>
      </div>

      <form
        action={updateNotice}
        className="glass space-y-6 rounded-3xl border-2 border-slate-300/90 p-8 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] dark:border-slate-600/90"
      >
        <input type="hidden" name="id" value={notice.id} />

        <div className="space-y-2">
          <label className="text-sm font-semibold">제목</label>
          <input
            name="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="공지 제목을 입력하세요"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-stretch">
          <div className="flex h-full flex-col rounded-2xl border-2 border-slate-300/90 bg-slate-50/80 p-5 shadow-sm dark:border-slate-600/90 dark:bg-slate-900/55">
            <div className="space-y-2">
              <label className="text-sm font-semibold">카테고리</label>
              <input type="hidden" name="category" value={category} />
              <div className="space-y-2">
                {categories.map((item) => {
                  const selected = item.value === category;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      data-selected={selected}
                      onClick={() => setCategory(item.value)}
                      className={`notice-category-button flex min-h-12 w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                        selected
                          ? "text-slate-900 dark:text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className={`text-xs ${selected ? "text-indigo-600 dark:text-indigo-300" : "text-slate-400 dark:text-slate-500"}`}>
                        {selected ? "선택됨" : "선택"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col rounded-2xl border-2 border-slate-300/90 bg-slate-50/80 p-5 shadow-sm dark:border-slate-600/90 dark:bg-slate-900/55">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold">공지 기간</label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isDetailedPeriod}
                    disabled
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>상세 기간</span>
                </label>
              </div>

              {isDetailedPeriod ? (
                <NoticePeriodPicker
                  startDate={startDate}
                  endDate={endDate}
                  disabled={periodEditingDisabled || isUnlimited}
                  onRangeChange={() => {}}
                />
              ) : (
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value="일수 선택 방식"
                    disabled
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:disabled:bg-slate-900"
                  />
                </div>
              )}

              <div className="flex h-[128px] items-start gap-2 overflow-hidden rounded-xl bg-white px-3 py-3 text-sm text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                  <p className="truncate font-medium leading-5">{periodPreview}</p>
                  <p className="min-h-10 text-xs leading-5 text-slate-500">{periodDescription}</p>
                  <p className="text-xs leading-5 text-slate-500">기간 수정은 현재 비활성화되어 있습니다.</p>
                </div>
              </div>
            </div>

            {canCreateUnlimited ? (
              <label className="mt-auto flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <span>상시 공지</span>
                <input
                  type="checkbox"
                  checked={isUnlimited}
                  disabled={periodEditingDisabled}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">내용</label>
            <span className={`text-xs ${content.length >= maxLength ? "font-bold text-rose-500" : "text-slate-400"}`}>
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
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="space-y-2 pt-4">
          <SubmitButton disabled={!hasChanges} />
          <p className="text-center text-xs text-slate-500">
            {hasChanges ? "변경 사항이 있습니다." : "변경 사항이 있을 때만 저장할 수 있습니다."}
          </p>
        </div>
      </form>
    </div>
  );
}
