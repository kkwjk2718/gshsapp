import { User, Mail, MapPin } from "lucide-react";
import { getTeacherDirectory } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const teachers = await getTeacherDirectory();

  return (
    <div className="mobile-page mobile-safe-bottom space-y-6">
       <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full text-emerald-600">
             <User className="w-6 h-6" />
          </div>
          <div>
             <h1 className="text-2xl font-bold">선생님 소개</h1>
             <p className="text-slate-500">선생님들의 정보를 확인하세요.</p>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teachers.length > 0 ? teachers.map((teacher) => (
             <div key={teacher.id} className="glass p-6 rounded-3xl flex flex-col items-center text-center gap-4 hover:scale-[1.02] transition-transform">
                <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-4xl">
                   👨‍🏫
                </div>
                <div>
                   <h2 className="text-xl font-bold">{teacher.name} 선생님</h2>
                   <p className="text-slate-500">{teacher.teacherProfile?.subject || "과목 정보 없음"}</p>
                </div>
                
                <div className="w-full space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800 text-sm">
                    <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
                        <MapPin className="w-4 h-4" />
                        <span>{teacher.teacherProfile?.location || "본교무실"}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="w-4 h-4" />
                        <span className="break-all">{teacher.email}</span>
                    </div>
                </div>
                
                {teacher.teacherProfile?.message && (
                    <p className="text-sm text-slate-500 italic">"{teacher.teacherProfile.message}"</p>
                )}
             </div>
          )) : (
              <div className="col-span-full py-12 text-center text-slate-500 glass rounded-3xl">
                  등록된 선생님 정보가 없습니다.
              </div>
          )}
       </div>
    </div>
  )
}
