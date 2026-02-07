import { prisma } from "@/lib/db";
import { updateGradeMapping } from "./actions";
import { Settings, Save, Link } from "lucide-react";
import { ICalForm } from "./ical-form";

export default async function SettingsPage() {
  const gradeMappingSetting = await prisma.systemSetting.findUnique({
      where: { key: "GRADE_MAPPING" }
  });
  const iCalUrlSetting = await prisma.systemSetting.findUnique({
      where: { key: "ICAL_URL" }
  });

  let mapping = { "1": 42, "2": 41, "3": 40 };
  if (gradeMappingSetting) {
      try {
          mapping = JSON.parse(gradeMappingSetting.value);
      } catch (e) {}
  }

  const iCalUrl = iCalUrlSetting?.value || "";

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">시스템 설정</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Grade Mapping */}
          <div className="glass p-8 rounded-3xl">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                 <Settings className="w-5 h-5" />
                 학년 - 기수 매핑 설정
             </h2>
             <p className="text-sm text-slate-500 mb-6">
                 각 학년에 해당하는 기수를 입력하세요. 해가 바뀌면 진급 처리를 위해 이 설정을 변경해야 합니다.
             </p>

             <form action={updateGradeMapping} className="space-y-4">
                 <div className="grid grid-cols-3 gap-4">
                    {/* Grade Inputs */}
                    {Object.entries(mapping).map(([grade, gisu]) => (
                        <div key={grade} className="space-y-2">
                             <label className="text-sm font-bold block">{grade}학년</label>
                             <div className="relative">
                                <input name={`grade${grade}`} type="number" defaultValue={gisu} required className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center font-mono" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">기</span>
                             </div>
                         </div>
                    ))}
                 </div>

                 <button className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mt-4">
                     <Save className="w-4 h-4" />
                     매핑 저장
                 </button>
             </form>
          </div>
          
          {/* iCal URL Sync */}
          <div className="glass p-8 rounded-3xl">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                 <Link className="w-5 h-5" />
                 학사일정 (iCal) 연동
             </h2>
             <p className="text-sm text-slate-500 mb-6">
                 구글 캘린더의 'iCal 형식의 공개 URL'을 입력하면 학사일정 페이지에 자동으로 표시됩니다. (읽기 전용)
             </p>
             <ICalForm initialUrl={iCalUrl} />
          </div>
      </div>
    </div>
  );
}