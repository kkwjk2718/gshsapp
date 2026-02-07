import { getLogStats, getLogSettings } from "./actions";
import { LogSettingsForm, DownloadButton } from "./client";
import { LogViewer } from "./log-viewer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "시스템 로그 관리",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LogsPage() {
  const stats = await getLogStats();
  const retentionDays = await getLogSettings();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">시스템 로그 관리</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 통계 카드 */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
          <h3 className="text-sm font-medium text-slate-400">총 로그 수</h3>
          <p className="text-3xl font-bold text-slate-100 mt-2">{stats.totalCount.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
          <h3 className="text-sm font-medium text-slate-400">오늘 생성된 로그</h3>
          <p className="text-3xl font-bold text-indigo-400 mt-2">{stats.todayCount.toLocaleString()}</p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-100">최근 로그 기록</h2>
          <LogViewer />
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-slate-100 border-b border-slate-700 pb-2">로그 설정 및 다운로드</h2>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <LogSettingsForm initialDays={retentionDays} />
          </div>
          <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-8">
            <h3 className="text-sm font-medium text-slate-200 mb-2">로그 데이터 내보내기</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              최근 10,000건의 시스템 로그를 CSV 파일로 다운로드합니다.<br />
              다운로드한 파일은 엑셀 등에서 열어 분석할 수 있습니다.
            </p>
            <DownloadButton />
          </div>
        </div>
      </div>
    </div>
  );
}
