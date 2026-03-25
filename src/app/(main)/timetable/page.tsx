import { getTimetable } from "@/lib/neis";
import { parse } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { getUserGrade } from "@/lib/grade-utils";
import { TimetableControls } from "./timetable-controls";
import { Clock } from "lucide-react";
import { Metadata } from "next";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";
import { getKSTDate, getKSTDateKey } from "@/lib/date-utils";

export const metadata: Metadata = {
  title: "시간표",
  description: "경남과학고등학교 학급별 시간표 정보입니다.",
};

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ date?: string, grade?: string, classNum?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCoreMemberFeatures(user.role)) redirect("/");

  const dateStr = params.date || getKSTDateKey();
  
  let currentDate = getKSTDate();
  try {
    currentDate = parse(dateStr, "yyyyMMdd", new Date());
  } catch (e) {
    console.error(e);
    currentDate = getKSTDate();
  }

  // Default values (User's info)
  let defaultGrade = "1";
  let defaultClass = "1";

  const calculatedGrade = await getUserGrade(user.gisu ?? null);
  if (calculatedGrade) {
      defaultGrade = calculatedGrade;
  } else if (user.studentId && user.studentId.length >= 3) {
      defaultGrade = user.studentId.substring(0, 1);
  }

  if (user.studentId && user.studentId.length >= 3) {
      defaultClass = user.studentId.substring(1, 2);
  }

  // Use params if available, else default
  const grade = params.grade || defaultGrade;
  const classNum = params.classNum || defaultClass;
    
  const timetable = await getTimetable(dateStr, grade, classNum);

  return (
    <div className="mobile-page mobile-safe-bottom space-y-6">
       {/* Controls */}
       <TimetableControls 
          currentDate={currentDate} 
          currentGrade={grade} 
          currentClass={classNum} 
       />

       {/* List */}
       <div className="max-w-2xl mx-auto space-y-3">
          {timetable && timetable.length > 0 ? (
            timetable.map((t, i) => (
                <div key={i} className="glass p-4 rounded-2xl flex items-center gap-6 hover:scale-[1.01] transition-transform">
                    <div className="w-12 h-12 flex items-center justify-center rounded-2xl font-bold text-lg" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
                        {t.PERIO}
                    </div>
                    <div className="flex-1">
                        <div className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{t.ITRT_CNTNT}</div>
                    </div>
                    <Clock className="w-5 h-5" style={{ color: "var(--muted)" }} />
                </div>
            ))
          ) : (
             <div className="text-center py-12" style={{ color: "var(--muted)" }}>
                수업 정보가 없습니다. (주말 또는 휴일)
             </div>
          )}
       </div>
    </div>
  );
}
