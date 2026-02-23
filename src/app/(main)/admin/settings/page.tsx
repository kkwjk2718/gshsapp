import { prisma } from "@/lib/db";
import { updateGradeMapping } from "./actions";
import { Settings, Save, Link, DatabaseBackup } from "lucide-react";
import { ICalForm } from "./ical-form";
import { backupNow, updateBackupInterval } from "./backup-actions";
import { listBackups, getBackupIntervalDays } from "@/lib/backup";
import { RestoreUploadForm } from "./restore-upload-form";

export default async function SettingsPage() {
  const gradeMappingSetting = await prisma.systemSetting.findUnique({ where: { key: "GRADE_MAPPING" } });
  const iCalUrlSetting = await prisma.systemSetting.findUnique({ where: { key: "ICAL_URL" } });

  let mapping = { "1": 42, "2": 41, "3": 40 };
  if (gradeMappingSetting) {
    try {
      mapping = JSON.parse(gradeMappingSetting.value);
    } catch {}
  }

  const iCalUrl = iCalUrlSetting?.value || "";
  const [backups, intervalDays] = await Promise.all([listBackups(), getBackupIntervalDays()]);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">시스템 설정</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass p-8 rounded-3xl">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            학년 - 기수 매핑 설정
          </h2>
          <p className="text-sm text-slate-500 mb-6">각 학년에 해당하는 기수를 입력하세요.</p>

          <form action={updateGradeMapping} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(mapping).map(([grade, gisu]) => (
                <div key={grade} className="space-y-2">
                  <label className="text-sm font-bold block">{grade}학년</label>
                  <div className="relative">
                    <input name={`grade${grade}`} type="number" defaultValue={gisu} required className="w-full px-4 py-3 rounded-xl text-center font-mono" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">기</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 mt-4">
              <Save className="w-4 h-4" />
              매핑 저장
            </button>
          </form>
        </div>

        <div className="glass p-8 rounded-3xl">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Link className="w-5 h-5" />
            학사일정 (iCal) 연동
          </h2>
          <p className="text-sm text-slate-500 mb-6">구글 캘린더 iCal URL을 입력하면 학사일정 페이지에 표시됩니다.</p>
          <ICalForm initialUrl={iCalUrl} />
        </div>
      </div>

      <div className="glass p-8 rounded-3xl space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <DatabaseBackup className="w-5 h-5" />
          데이터 백업/복원
        </h2>
        <p className="text-sm text-slate-500">
          백업은 외부 폴더 <code className="px-1 py-0.5 rounded bg-black/10">data_backup</code> 에 저장됩니다. (DB 기반 데이터: 링크/로그/공지/사용자 포함)
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <form action={updateBackupInterval} className="glass p-4 rounded-2xl space-y-3">
            <p className="font-semibold">정기 백업 주기</p>
            <div className="flex items-center gap-2">
              <input name="days" type="number" min={1} defaultValue={intervalDays} className="px-3 py-2 rounded-xl w-24" />
              <span className="text-sm">일마다</span>
            </div>
            <button className="px-4 py-2 rounded-xl font-semibold">주기 저장</button>
          </form>

          <form action={backupNow} className="glass p-4 rounded-2xl space-y-3">
            <p className="font-semibold">즉시 백업</p>
            <p className="text-xs text-slate-500">현재 DB를 즉시 백업 파일로 생성합니다.</p>
            <button className="px-4 py-2 rounded-xl font-semibold">지금 백업</button>
          </form>

          <RestoreUploadForm />
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">백업 파일 목록</h3>
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.file} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                <div className="text-sm">
                  <div className="font-mono">{b.file}</div>
                  <div className="text-xs text-slate-500">{b.createdAt.toLocaleString("ko-KR")} · {(b.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={`/admin/settings/backup-download/${encodeURIComponent(b.file)}`} className="px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    다운로드
                  </a>
                  {b.hasMeta && (
                    <a href={`/admin/settings/backup-download/${encodeURIComponent(`${b.file}.json`)}`} className="px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
                      메타 보기
                    </a>
                  )}
                </div>
              </div>
            ))}
            {backups.length === 0 && <p className="text-sm text-slate-500">백업 파일이 아직 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
