"use client";

import { useActionState, useState } from "react";
import { importUsersBackup } from "./actions";

const initialState = { error: "" };

export function UserBackupTools() {
  const [fileName, setFileName] = useState("");
  const [state, formAction, pending] = useActionState(importUsersBackup, initialState);

  return (
    <div className="glass p-4 rounded-2xl space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="font-semibold">사용자 데이터 백업</p>
          <p className="text-xs text-slate-500">사용자 데이터만 별도 JSON으로 다운로드/복원합니다.</p>
        </div>
        <a href="/admin/users/export-users" className="px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          사용자 내보내기
        </a>
      </div>

      <form action={formAction} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input id="users-backup-file" type="file" name="file" accept=".json" required className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />
          <label htmlFor="users-backup-file" className="inline-flex px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)" }}>
            사용자 파일 업로드
          </label>
          <span className="text-xs text-slate-500">{fileName ? `선택됨: ${fileName}` : "선택된 파일 없음"}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input name="confirmText" placeholder="복원하려면 예 입력" required className="px-3 py-2 rounded-lg" />
          <button disabled={pending} className="px-3 py-2 rounded-lg">{pending ? "복원 중..." : "사용자 가져오기"}</button>
        </div>
      </form>

      {("success" in state) && state.success && <p className="text-xs" style={{ color: "#22c55e" }}>{state.success}</p>}
      {("error" in state) && state.error && <p className="text-xs" style={{ color: "#ef4444" }}>{state.error}</p>}
    </div>
  );
}
