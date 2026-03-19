"use client";

import { useActionState } from "react";
import { updateBackupInterval } from "./backup-actions";

const initialState = {
  ok: false,
  message: "",
};

export function BackupIntervalForm({ intervalDays }: { intervalDays: number }) {
  const [state, formAction, pending] = useActionState(updateBackupInterval, initialState);

  return (
    <form action={formAction} className="glass p-4 rounded-2xl space-y-3">
      <p className="font-semibold">Scheduled backup interval</p>
      <div className="flex items-center gap-2">
        <input
          name="days"
          type="number"
          min={1}
          step={1}
          defaultValue={intervalDays}
          className="px-3 py-2 rounded-xl w-24"
        />
        <span className="text-sm">day(s)</span>
      </div>
      <button disabled={pending} className="px-4 py-2 rounded-xl font-semibold">
        {pending ? "Saving..." : "Save interval"}
      </button>
      {state.message && (
        <p className={`text-xs ${state.ok ? "text-emerald-500" : "text-rose-500"}`}>{state.message}</p>
      )}
    </form>
  );
}
