"use client";

import { useActionState, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { type ActionResult, replaceStudentRoster } from "./actions";

const initialState: ActionResult = {};

export function StudentRosterImportForm({ activeCount, claimedCount }: { activeCount: number; claimedCount: number }) {
  const [state, formAction, pending] = useActionState(replaceStudentRoster, initialState);
  const [fileName, setFileName] = useState("");
  return (
    <div className="space-y-4 rounded-3xl border border-dashed p-5" style={{ borderColor: "var(--border)" }}>
      <div>
        <h3 className="font-bold">Authoritative student roster</h3>
        <p className="mt-1 text-sm text-slate-500">
          Active: {activeCount} · Enrolled: {claimedCount}. The portal matches student ID, exact name, and school-controlled email.
        </p>
      </div>
      <form action={formAction} className="space-y-3">
        <p className="text-xs text-amber-600 dark:text-amber-400">
          CSV header must be exactly <code>academicYear,gisu,studentId,name,email</code>. One file contains one school year; older generations remain inactive audit evidence while student numbers may be safely reused.
        </p>
        <input
          id="student-roster-file"
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="student-roster-file" className="cursor-pointer rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            Choose CSV
          </label>
          <span className="text-xs text-slate-500">{fileName || "No file selected"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="confirmText"
            required
            autoComplete="off"
            placeholder="REPLACE ROSTER"
            className="rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          />
          <button disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Replace roster
          </button>
        </div>
      </form>
      {state.error && <p className="text-sm text-rose-500">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600">{state.success}</p>}
    </div>
  );
}
