"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Save } from "lucide-react";
import { type ActionResult, updateGoogleAnalyticsId } from "./actions";

const initialState: ActionResult = {
  success: undefined,
  error: undefined,
  value: undefined,
};

export function GoogleAnalyticsForm({ initialValue }: { initialValue: string }) {
  const [state, formAction, isPending] = useActionState(updateGoogleAnalyticsId, initialState);
  const lastBroadcastValue = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    if (lastBroadcastValue.current === state.value) {
      return;
    }

    lastBroadcastValue.current = state.value;
    window.dispatchEvent(
      new CustomEvent("google-analytics-setting-updated", {
        detail: {
          googleAnalyticsId: state.value ?? null,
        },
      }),
    );
  }, [state?.success, state?.value]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold block text-slate-700 dark:text-slate-300">
          Google Analytics Measurement ID
        </label>
        <input
          name="googleAnalyticsId"
          type="text"
          defaultValue={initialValue}
          placeholder="G-XXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-slate-500">
          Leave this blank to disable Google Analytics tracking.
        </p>
      </div>

      {state?.error && <p className="text-sm text-rose-500 font-medium">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-500 font-medium">{state.success}</p>}

      <button
        disabled={isPending}
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>
    </form>
  );
}
