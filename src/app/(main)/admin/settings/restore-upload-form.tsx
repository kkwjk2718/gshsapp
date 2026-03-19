"use client";

import { useActionState, useState } from "react";
import { restoreFromUpload } from "./backup-actions";
import { RESTORE_CONFIRM_TEXT } from "./backup-action-helpers";

const initialState = { ok: false, message: "", summary: [] as string[] };

export function RestoreUploadForm() {
  const [fileName, setFileName] = useState("");
  const [state, formAction, pending] = useActionState(restoreFromUpload, initialState);

  return (
    <form action={formAction} className="glass p-4 rounded-2xl space-y-3">
      <p className="font-semibold">Restore from upload</p>
      <p className="text-xs text-slate-500">
        Choose a backup file and type the confirmation text before restoring.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          id="restore-file"
          type="file"
          name="dbfile"
          accept=".db,.tar.gz"
          required
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
        />
        <label
          htmlFor="restore-file"
          className="inline-flex px-3 py-2 rounded-lg border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Choose file
        </label>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {fileName ? `Selected: ${fileName}` : "No file selected"}
        </span>
      </div>

      <div className="space-y-1">
        <label htmlFor="restore-confirm" className="text-xs text-slate-500">
          Type <span className="font-semibold">{RESTORE_CONFIRM_TEXT}</span> to confirm the restore.
        </label>
        <input
          id="restore-confirm"
          name="confirmText"
          placeholder={RESTORE_CONFIRM_TEXT}
          required
          className="px-3 py-2 rounded-xl w-full"
        />
      </div>

      <button disabled={pending} className="px-4 py-2 rounded-xl font-semibold">
        {pending ? "Restoring..." : "Run restore"}
      </button>

      {state.message && (
        <div
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: state.ok ? "#22c55e" : "#ef4444",
            color: state.ok ? "#22c55e" : "#ef4444",
          }}
        >
          {state.message}
        </div>
      )}

      {state.ok && Array.isArray(state.summary) && state.summary.length > 0 && (
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
            Restore summary
          </p>
          <ul className="text-xs space-y-1" style={{ color: "var(--foreground)" }}>
            {state.summary.map((line) => (
              <li key={line}>- {line}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
