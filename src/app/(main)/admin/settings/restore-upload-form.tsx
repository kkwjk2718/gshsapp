"use client";

import { useState, type FormEvent } from "react";

import { RESTORE_CONFIRM_TEXT } from "./backup-action-helpers";

type RestoreResult = Readonly<{
  ok: boolean;
  code?: string;
  message?: string;
  restoreId?: string;
}>;

export function RestoreUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || confirmText !== RESTORE_CONFIRM_TEXT) {
      setResult({ ok: false, message: `Type ${RESTORE_CONFIRM_TEXT} exactly and choose a backup.` });
      return;
    }

    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/admin/settings/restore-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-GSHS-Restore-Confirm": confirmText,
          "X-GSHS-Restore-Filename": file.name,
        },
        body: file,
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json() as RestoreResult;
      setResult(response.ok ? payload : { ok: false, message: "The restore could not be staged.", code: payload.code });
    } catch {
      setResult({ ok: false, message: "The restore upload failed before it could be staged." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass p-4 rounded-2xl space-y-3">
      <p className="font-semibold">Stage restore upload</p>
      <p className="text-xs text-slate-500">
        The file is validated and placed in private staging. It never replaces the live database from this page.
        Automatic apply remains disabled; an operator-reviewed offline restore is required.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          id="restore-file"
          type="file"
          accept=".db,.tar.gz"
          required
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <label
          htmlFor="restore-file"
          className="inline-flex px-3 py-2 rounded-lg border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Choose file
        </label>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {file ? `Selected: ${file.name}` : "No file selected"}
        </span>
      </div>

      <label htmlFor="restore-confirm" className="block text-xs text-slate-500">
        Type <span className="font-semibold">{RESTORE_CONFIRM_TEXT}</span> to stage the restore.
      </label>
      <input
        id="restore-confirm"
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        placeholder={RESTORE_CONFIRM_TEXT}
        required
        autoComplete="off"
        className="px-3 py-2 rounded-xl w-full"
      />

      <button disabled={pending} className="px-4 py-2 rounded-xl font-semibold">
        {pending ? "Validating..." : "Validate and stage"}
      </button>

      {result && (
        <div
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: result.ok ? "#22c55e" : "#ef4444", color: result.ok ? "#22c55e" : "#ef4444" }}
        >
          {result.message ?? (result.ok
            ? `Restore ${result.restoreId ?? ""} is staged. Contact an operator for the offline procedure.`
            : "The restore could not be staged.")}
        </div>
      )}
    </form>
  );
}
