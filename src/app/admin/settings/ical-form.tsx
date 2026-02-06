"use client"

import { useActionState } from "react";
import { updateICalUrl, type ActionResult } from "./actions";
import { Save, Loader2 } from "lucide-react";

const initialState: ActionResult = {
  success: undefined,
  error: undefined
};

export function ICalForm({ initialUrl }: { initialUrl: string }) {
  const [state, formAction, isPending] = useActionState(updateICalUrl, initialState);

  return (
    <form action={formAction} className="space-y-4">
        <div>
            <label className="text-sm font-bold block mb-2 text-slate-700 dark:text-slate-300">iCal 공개 URL</label>
            <input 
                name="icalUrl" 
                type="url" 
                defaultValue={initialUrl} 
                placeholder="https://calendar.google.com/calendar/ical/..." 
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
            />
        </div>
        
        {state?.error && <p className="text-sm text-rose-500 font-medium">{state.error}</p>}
        {state?.success && <p className="text-sm text-emerald-500 font-medium">{state.success}</p>}

        <button disabled={isPending} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            저장
        </button>
    </form>
  );
}
