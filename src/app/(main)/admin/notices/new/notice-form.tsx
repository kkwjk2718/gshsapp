"use client";

import { ArrowLeft, Calendar, Clock3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { NoticePeriodPicker } from "@/components/notice-period-picker";
import {
  getDetailedNoticeDateRangeFromDuration,
  getNoticeWindowPreview,
  getSimpleNoticeWindowPreview,
  getTodayNoticeDateInputValue,
} from "@/lib/notice-window";
import { createNotice } from "../actions";

interface Category {
  id: string;
  label: string;
  value: string;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="submit-notice-button"
      disabled={disabled || pending}
      className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
    >
      {pending ? "작성 중..." : "작성 완료"}
    </button>
  );
}

export function NoticeForm({
  categories,
  canCreateUnlimited,
}: {
  categories: Category[];
  canCreateUnlimited: boolean;
}) {
  const today = getTodayNoticeDateInputValue();
  const [category, setCategory] = useState(categories[0]?.value ?? "");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isDetailedPeriod, setIsDetailedPeriod] = useState(false);
  const [duration, setDuration] = useState("7");
  const [contentLength, setContentLength] = useState(0);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const maxLength = 1000;
  const hasPeriodSelection = startDate.length > 0 && endDate.length > 0;
  const canUseUnlimited = canCreateUnlimited;
  const showUnlimitedOption = canUseUnlimited;
  const effectiveUnlimited = canUseUnlimited && isUnlimited;
  const isPeriodInputDisabled = effectiveUnlimited;
  const hasValidPeriod = effectiveUnlimited || !isDetailedPeriod || hasPeriodSelection;
  const periodPreview = effectiveUnlimited
    ? "상시 공지"
    : isDetailedPeriod
      ? hasPeriodSelection
        ? getNoticeWindowPreview(startDate, endDate)
        : "날짜를 선택해 주세요."
      : getSimpleNoticeWindowPreview(duration);
  const periodDescription = effectiveUnlimited
    ? "상시 공지에서는 기간 입력이 비활성화됩니다."
    : isDetailedPeriod
      ? "선택한 시작일 19:00부터 종료일 다음날 05:00까지 공지가 노출됩니다."
      : "작성 시점부터 선택한 일수만큼 공지가 바로 노출됩니다.";

  const handleDetailedPeriodChange = (checked: boolean) => {
    setIsDetailedPeriod(checked);

    if (!checked) {
      return;
    }

    const nextRange = getDetailedNoticeDateRangeFromDuration(duration);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Link
          href="/notices"
          className="rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">새 공지 작성</h1>
      </div>

      <form
        action={createNotice}
        className="glass space-y-6 rounded-3xl border-2 border-slate-300/90 p-8 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] dark:border-slate-600/90"
      >
        <div className="space-y-2">
          <label className="text-sm font-semibold">제목</label>
          <input
            name="title"
            type="text"
            data-testid="notice-title-input"
            placeholder="공지 제목을 입력하세요"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-stretch">
          <div className="flex h-full flex-col rounded-2xl border-2 border-slate-300/90 bg-slate-50/80 p-5 shadow-sm dark:border-slate-600/90 dark:bg-slate-900/55">
            <div className="space-y-2">
              <label className="text-sm font-semibold">카테고리</label>
              <input type="hidden" name="category" value={category} data-testid="notice-category-select" />
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
                <label
                  className={`flex items-center gap-2 text-sm font-medium ${
                    isPeriodInputDisabled ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="detailedPeriod"
                    checked={isDetailedPeriod}
                    disabled={isPeriodInputDisabled}
                    onChange={(event) => handleDetailedPeriodChange(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>상세 기간</span>
                </label>
              </div>

              <input type="hidden" name="duration" value={duration} />
              <input type="hidden" name="startDate" value={startDate} />
              <input type="hidden" name="endDate" value={endDate} />

              {isDetailedPeriod ? (
                <NoticePeriodPicker
                  startDate={startDate}
                  endDate={endDate}
                  disabled={isPeriodInputDisabled}
                  disabledLabel="-"
                  onRangeChange={(nextStartDate, nextEndDate) => {
                    setStartDate(nextStartDate);
                    setEndDate(nextEndDate);
                  }}
                />
              ) : isPeriodInputDisabled ? (
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value="-"
                    disabled
                    readOnly
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 text-sm text-slate-400 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                  />
                </div>
              ) : (
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <select
                    name="durationVisible"
                    data-testid="notice-duration-select"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:disabled:bg-slate-900"
                  >
                    {Array.from({ length: 14 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}일
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex h-[104px] items-start gap-2 overflow-hidden rounded-xl bg-white px-3 py-3 text-sm text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                  <p className="truncate font-medium leading-5">{periodPreview}</p>
                  <p className="min-h-10 text-xs leading-5 text-slate-500">{periodDescription}</p>
                </div>
              </div>
            </div>

            {showUnlimitedOption ? (
              <label className="mt-auto flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <span>상시 공지</span>
                <input
                  type="checkbox"
                  name="unlimited"
                  id="unlimited"
                  checked={isUnlimited}
                  onChange={(event) => setIsUnlimited(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">내용</label>
            <span className={`text-xs ${contentLength >= maxLength ? "font-bold text-rose-500" : "text-slate-400"}`}>
              {contentLength} / {maxLength}자
            </span>
          </div>
          <textarea
            name="content"
            data-testid="notice-content-input"
            rows={10}
            maxLength={maxLength}
            placeholder="공지 내용을 입력하세요 (최대 1000자)"
            required
            onChange={(event) => setContentLength(event.target.value.length)}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div className="pt-4">
          <SubmitButton disabled={!hasValidPeriod} />
        </div>
      </form>
    </div>
  );
}
