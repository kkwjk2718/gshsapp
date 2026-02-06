"use client"

import { useState } from "react";
import { ExternalLink, Trash2, Edit2, Save, X } from "lucide-react";
import { updateLink, deleteLink } from "./actions";

interface LinkItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
  category: string;
}

export function LinkCard({ link, canEdit }: { link: LinkItem, canEdit: boolean }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <form 
        action={async (formData) => {
            await updateLink(formData);
            setIsEditing(false);
        }}
        className="glass p-6 rounded-3xl border-2 border-indigo-500 flex flex-col gap-3 relative z-10"
      >
        <input type="hidden" name="id" value={link.id} />
        <input name="title" defaultValue={link.title} placeholder="제목" required className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold" />
        <input name="url" defaultValue={link.url} placeholder="URL" required className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
        {/* Hidden category input with default value */}
        <input type="hidden" name="category" value="GENERAL" />
        <input name="description" defaultValue={link.description || ""} placeholder="설명" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" />
        
        <div className="flex items-center justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
            </button>
            <button type="submit" className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <Save className="w-4 h-4" />
            </button>
        </div>
      </form>
    )
  }

  return (
    <div className="glass p-6 rounded-3xl hover:scale-[1.02] transition-transform group relative flex flex-col justify-between min-h-[150px]">
        <div className="relative z-10 pointer-events-none">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
                {link.title}
                <ExternalLink className="w-4 h-4 text-slate-400" />
            </h3>
            <p className="text-sm text-slate-500 line-clamp-2">{link.description}</p>
        </div>
        
        {/* Clickable area for the link */}
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-0 rounded-3xl" aria-label={link.title} />

        {/* Admin Controls - Higher z-index to be clickable */}
        {canEdit && (
            <div className="relative z-20 flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                >
                    <Edit2 className="w-4 h-4" />
                </button>
                <form action={deleteLink}>
                    <input type="hidden" name="id" value={link.id} />
                    <button type="submit" className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </form>
            </div>
        )}
    </div>
  )
}