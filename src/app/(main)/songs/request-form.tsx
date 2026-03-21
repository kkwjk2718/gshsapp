"use client"

import { requestSong } from "./actions";
import { Search, Plus, Clock, AlertCircle } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";

interface SongRequestFormProps {
  isAllowedGrade: boolean;
}

export function SongRequestForm({ isAllowedGrade }: SongRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isBreakTime, setIsBreakTime] = useState(false);

  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const hours = now.getHours();
      // 05:00 ~ 07:00
      if (hours >= 5 && hours < 7) {
        setIsBreakTime(true);
      } else {
        setIsBreakTime(false);
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const isSubmitDisabled = isBreakTime || !isAllowedGrade;
  const isFormBlocked = isSubmitDisabled;

  return (
    <div className="space-y-4">
      {/* 안내 문구 */}
      <div className="p-4 rounded-2xl flex items-start gap-3 text-sm" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
        <Clock className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        <div className="space-y-1">
          <p className="font-semibold">기상곡 신청 안내</p>
          <ul className="list-disc list-inside space-y-0.5 opacity-80">
            <li>신청 가능 시간: <span className="font-bold">금일 07:00 ~ 익일 05:00</span></li>
            <li>05:00 ~ 07:00 사이에는 신청이 제한됩니다.</li>
            <li>어제 신청 승인된 곡은 오늘 아침에, 오늘 신청한 곡은 내일 아침에 방송됩니다.</li>
            <li>3학년은 일ㆍ월ㆍ수ㆍ금, 2학년은 화ㆍ목, 1학년은 토요일에 신청이 가능합니다.</li>
          </ul>
        </div>
      </div>

      {isBreakTime && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />
            지금은 기상곡 신청 시간이 아닙니다. (07:00부터 신청 가능)
          </div>
        )}

        {!isAllowedGrade && !isBreakTime && (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="w-4 h-4" />
            오늘 신청 가능한 학년이 아닙니다.
          </div>
        )}

      <form
        action={async (formData) => {
          try {
            await requestSong(formData);
            formRef.current?.reset();
            toast.success("기상곡 신청이 완료되었습니다!");
          } catch (error: any) {
            toast.error(error.message || "신청 중 오류가 발생했습니다.");
          }
        }}
        ref={formRef}
        className={`glass p-4 rounded-2xl flex flex-col gap-4 md:flex-row md:items-center ${isFormBlocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}
      >
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted)" }} />
          <input
            name="youtubeUrl"
            type="url"
            placeholder="YouTube URL을 입력하세요..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border focus:outline-none"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
            required
            disabled={isFormBlocked}
          />
        </div>
        <div className="flex-1 md:max-w-xs">
          <input
            name="videoTitle"
            type="text"
            placeholder="노래 제목 (선택)"
            className="w-full px-4 py-2 rounded-xl border focus:outline-none"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
            disabled={isFormBlocked}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isAnonymous"
            name="isAnonymous"
            className="w-4 h-4 rounded"
            disabled={isFormBlocked}
          />
          <label htmlFor="isAnonymous" className="text-sm select-none cursor-pointer" style={{ color: "var(--muted)" }}>
            내 정보 가리기
          </label>
        </div>
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="flex items-center justify-center gap-2 px-6 py-2 rounded-xl font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
          style={{
          backgroundColor: isSubmitDisabled ? "var(--border)" : "var(--accent)",
          color: isSubmitDisabled ? "var(--foreground)" : "var(--brand-sub)",
          opacity: isSubmitDisabled ? 0.6 : 1,
        }}
        >
          <Plus className="w-4 h-4" />
          <span>신청하기</span>
        </button>
      </form>
    </div>
  )
}
