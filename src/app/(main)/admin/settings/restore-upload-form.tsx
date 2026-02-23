"use client";

import { useActionState, useState } from "react";
import { restoreFromUpload } from "./backup-actions";

const initialState = { ok: false, message: "", summary: [] as string[] };

export function RestoreUploadForm() {
  const [fileName, setFileName] = useState<string>("");
  const [state, formAction, pending] = useActionState(restoreFromUpload, initialState);

  return (
    <form action={formAction} className="glass p-4 rounded-2xl space-y-3">
      <p className="font-semibold">업로드 파일로 복원</p>
      <p className="text-xs text-slate-500">복원 파일 선택 후, 아래 확인 문구를 입력해야 복원이 진행됩니다.</p>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          id="restore-file"
          type="file"
          name="dbfile"
          accept=".db,.tar.gz"
          required
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
        />
        <label htmlFor="restore-file" className="inline-flex px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: "var(--border)" }}>
          파일 업로드
        </label>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {fileName ? `선택됨: ${fileName}` : "선택된 파일 없음"}
        </span>
      </div>

      <div className="space-y-1">
        <label htmlFor="restore-confirm" className="text-xs text-slate-500">
          정말 복원하시겠습니까? 복원하려면 <span className="font-semibold">예</span> 를 입력하세요.
        </label>
        <input id="restore-confirm" name="confirmText" placeholder="예" required className="px-3 py-2 rounded-xl w-full" />
      </div>

      <button disabled={pending} className="px-4 py-2 rounded-xl font-semibold">
        {pending ? "복원 중..." : "복원 실행"}
      </button>

      {state.message && (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: state.ok ? "#22c55e" : "#ef4444", color: state.ok ? "#22c55e" : "#ef4444" }}>
          {state.message}
        </div>
      )}

      {state.ok && Array.isArray(state.summary) && state.summary.length > 0 && (
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>복원 전/후 요약</p>
          <ul className="text-xs space-y-1" style={{ color: "var(--foreground)" }}>
            {state.summary.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
