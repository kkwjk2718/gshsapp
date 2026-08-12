"use client";

import { useState, useTransition } from "react";

import { downloadTextFile } from "@/lib/client-download";
import { createTokens } from "./actions";

export function BatchCreateForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setError(null);
      startTransition(async () => {
        try {
          const result = await createTokens(data);
          downloadTextFile(result.csv, {
            filename: `${String(data.get("title") || "invite-tokens")}_one-time.csv`,
            mimeType: "text/csv;charset=utf-8",
          });
          form.reset();
        } catch {
          setError("Unable to create this token batch. Check every field and try again.");
        }
      });
    }}>
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-500">Batch title</label>
        <input name="title" required maxLength={120} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-500">Memo</label>
        <input name="memo" maxLength={500} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Role</label>
          <select name="targetRole" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <option value="STUDENT">Student</option><option value="TEACHER">Teacher</option>
            <option value="BROADCAST">Broadcast</option><option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Cohort (students)</label>
          <input name="targetGisu" type="number" min={1} max={200} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-500">Count</label>
        <input name="count" type="number" defaultValue={10} min={1} max={100} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
      </div>
      <p className="text-xs text-amber-700">Secrets are downloaded once and are never stored in recoverable form.</p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white disabled:opacity-50">
        {pending ? "Creating…" : "Create and download once"}
      </button>
    </form>
  );
}
