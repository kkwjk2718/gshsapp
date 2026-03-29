"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getTodayNoticeDateInputValue } from "@/lib/notice-window";

type NoticePeriodPickerProps = {
  startDate: string;
  endDate: string;
  disabled?: boolean;
  disabledLabel?: string;
  onRangeChange: (startDate: string, endDate: string) => void;
};

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function isDateInput(value: string) {
  return DATE_INPUT_PATTERN.test(value);
}

function toCalendarDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDateLabel(value: string) {
  return format(toCalendarDate(value), "yyyy.MM.dd", { locale: ko });
}

function getCalendarDays(month: Date) {
  const firstVisibleDate = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const lastVisibleDate = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];

  for (let cursor = firstVisibleDate; cursor <= lastVisibleDate; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  return days;
}

function sortDateKeys(dateKeys: string[]) {
  return [...dateKeys].sort((left, right) => left.localeCompare(right));
}

function getPersistedEdgeDates(startDate: string, endDate: string) {
  if (!isDateInput(startDate) || !isDateInput(endDate)) {
    return [];
  }

  return startDate === endDate ? [startDate] : [startDate, endDate];
}

export function NoticePeriodPicker({
  startDate,
  endDate,
  disabled = false,
  disabledLabel,
  onRangeChange,
}: NoticePeriodPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minSelectableDate = getTodayNoticeDateInputValue();
  const fallbackVisibleDate = isDateInput(startDate) ? startDate : minSelectableDate;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(toCalendarDate(fallbackVisibleDate)));
  const [selectedDateQueue, setSelectedDateQueue] = useState<string[]>([]);
  const minVisibleMonth = startOfMonth(toCalendarDate(minSelectableDate));
  const persistedEdgeDates = useMemo(() => getPersistedEdgeDates(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    if (!open) {
      setSelectedDateQueue([]);
      return;
    }

    setSelectedDateQueue([]);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const [rangeStart, rangeEnd] = useMemo<[string | null, string | null]>(() => {
    if (selectedDateQueue.length > 0) {
      const sortedDateKeys = sortDateKeys(selectedDateQueue);
      return [sortedDateKeys[0] ?? null, sortedDateKeys[sortedDateKeys.length - 1] ?? null];
    }

    if (persistedEdgeDates.length === 0) {
      return [null, null];
    }

    return [persistedEdgeDates[0] ?? null, persistedEdgeDates[persistedEdgeDates.length - 1] ?? null];
  }, [persistedEdgeDates, selectedDateQueue]);

  const highlightedEdgeDates = useMemo(() => {
    if (selectedDateQueue.length > 0) {
      return selectedDateQueue;
    }

    return persistedEdgeDates;
  }, [persistedEdgeDates, selectedDateQueue]);

  const hasSelectedRange = rangeStart !== null && rangeEnd !== null;
  const triggerLabel = hasSelectedRange ? `${formatDateLabel(rangeStart)} ~ ${formatDateLabel(rangeEnd)}` : "기간을 선택하세요";
  const displayLabel = disabled && disabledLabel ? disabledLabel : triggerLabel;
  const previewLabel = hasSelectedRange ? `${formatDateLabel(rangeStart)} ~ ${formatDateLabel(rangeEnd)}` : "선택 안 됨";

  const handleDateClick = (dateKey: string) => {
    const currentQueue = selectedDateQueue.length > 0 ? selectedDateQueue : persistedEdgeDates;
    const isSelectedEdge = currentQueue.includes(dateKey);
    let nextQueue: string[];

    if (isSelectedEdge) {
      nextQueue = currentQueue.filter((selectedDate) => selectedDate !== dateKey);

      if (nextQueue.length === 0) {
        setSelectedDateQueue([]);
        onRangeChange("", "");
        return;
      }
    } else if (selectedDateQueue.length === 0 && persistedEdgeDates.length >= 2) {
      nextQueue = [dateKey];
    } else if (selectedDateQueue.length >= 2) {
      nextQueue = [selectedDateQueue[1], dateKey];
    } else {
      nextQueue = [...currentQueue, dateKey];
    }

    const sortedDateKeys = sortDateKeys(nextQueue);
    const nextStartDate = sortedDateKeys[0] ?? "";
    const nextEndDate = sortedDateKeys[sortedDateKeys.length - 1] ?? "";

    setSelectedDateQueue(nextQueue);
    onRangeChange(nextStartDate, nextEndDate);
  };

  const days = getCalendarDays(visibleMonth);
  const canGoToPreviousMonth = visibleMonth.getTime() > minVisibleMonth.getTime();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="relative h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:disabled:bg-slate-900"
      >
        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <span className="block truncate">{displayLabel}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-[24rem] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/30">
          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={!canGoToPreviousMonth}
                onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {format(visibleMonth, "yyyy년 M월", { locale: ko })}
              </div>

              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-center text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              선택 중 <span className="font-semibold">{previewLabel}</span>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              {WEEKDAY_LABELS.map((label) => (
                <span key={`${format(visibleMonth, "yyyy-MM")}-${label}`}>{label}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const isInMonth = isSameMonth(day, visibleMonth);
                const isDisabled = dayKey < minSelectableDate;
                const isSelected = highlightedEdgeDates.includes(dayKey);
                const isInRange = hasSelectedRange && dayKey > rangeStart && dayKey < rangeEnd;
                const selectionState = isSelected ? "edge" : isInRange ? "range" : "idle";

                return (
                  <button
                    key={dayKey}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDateClick(dayKey)}
                    data-selection-state={selectionState}
                    data-outside-month={!isInMonth}
                    className={[
                      "notice-period-day flex h-10 items-center justify-center rounded-xl border border-transparent text-sm font-medium transition-colors",
                      isDisabled
                        ? "cursor-not-allowed bg-slate-50 text-slate-300 dark:bg-slate-900 dark:text-slate-700"
                        : "",
                      !isSelected && !isInRange
                        ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        : "",
                      !isInMonth ? "opacity-35" : "",
                    ].join(" ")}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-slate-500">
              날짜를 눌러 기간을 선택하고, 이미 고른 날짜를 다시 누르면 선택이 해제됩니다.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
