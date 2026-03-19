"use client";

import { useActionState } from "react";
import { backupNow } from "./backup-actions";

const initialState = {
  ok: false,
  message: "",
};

export function BackupNowForm() {
  const [state, formAction, pending] = useActionState(backupNow, initialState);

  return (
    <form action={formAction} className="glass p-4 rounded-2xl space-y-3">
      <p className="font-semibold">Create backup now</p>
      <p className="text-xs text-slate-500">
        Capture the current database and attached files immediately.
      </p>
      <button disabled={pending} className="px-4 py-2 rounded-xl font-semibold">
        {pending ? "Backing up..." : "Run backup"}
      </button>
      {state.message && (
        <p className={`text-xs ${state.ok ? "text-emerald-500" : "text-rose-500"}`}>{state.message}</p>
      )}
    </form>
  );
}
