"use client"

import { useState } from "react";
import { Edit2, Save, X, User as UserIcon, Mail, CreditCard } from "lucide-react";
import { updateProfile } from "./actions";

interface UserProfile {
  name: string;
  email: string | null;
  studentId: string | null;
  role: string;
  gisu: number | null;
}

export function ProfileCard({ user }: { user: UserProfile }) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
      return (
          <form 
            action={async (formData) => {
                await updateProfile(formData);
                setIsEditing(false);
            }}
            className="glass p-6 rounded-3xl flex flex-col gap-4 border-2 border-indigo-500 relative"
          >
              <button 
                type="button" 
                onClick={() => setIsEditing(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600"
              >
                  <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 mb-2">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl font-bold">
                      {user.name?.[0] || "U"}
                  </div>
                  <div>
                      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">정보 수정</h2>
                      <p className="text-xs text-slate-500">변경할 정보를 입력하세요.</p>
                  </div>
              </div>

              <div className="space-y-3">
                  <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">이름</label>
                      <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input name="name" defaultValue={user.name} required className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">학번</label>
                      <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input name="studentId" defaultValue={user.studentId || ""} required className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">이메일</label>
                      <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input name="email" type="email" defaultValue={user.email || ""} required className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                  </div>
              </div>

              <button className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors mt-2">
                  <Save className="w-4 h-4" />
                  저장하기
              </button>
          </form>
      )
  }

  return (
    <div className="glass p-6 rounded-3xl flex items-center gap-6 relative group">
       <button 
         onClick={() => setIsEditing(true)}
         className="absolute top-4 right-4 p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
         title="정보 수정"
       >
           <Edit2 className="w-5 h-5" />
       </button>

       <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-3xl font-bold shadow-inner flex-shrink-0">
          {user.name?.[0] || "U"}
       </div>
       <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{user.name}</h2>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
              <span>{user.gisu ? `${user.gisu}기` : ""}</span>
              <span className="w-px h-3 bg-slate-300 dark:bg-slate-700" />
              <span>{user.studentId}</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
             <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                {user.role}
             </span>
             <span className="text-xs text-slate-400 truncate">{user.email}</span>
          </div>
       </div>
    </div>
  )
}
