import { Metadata } from "next";
import { TestRunner } from "./test-runner";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "시스템 진단",
  description: "서버 기능 및 외부 연동 상태를 진단합니다.",
  robots: { index: false, follow: false },
};

export default function SystemTestPage() {
  return (
    <div className="p-6 md:p-12 max-w-3xl mx-auto space-y-10">
        <div className="text-center">
            <div className="inline-flex p-5 rounded-full bg-slate-100 dark:bg-slate-800 mb-6">
                <ShieldCheck className="w-12 h-12 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">시스템 기능 진단</h1>
            <p className="text-slate-500 mt-3 text-lg leading-relaxed">
                데이터베이스 연결, 외부 API 연동, 로그 시스템 등<br className="hidden md:block"/>
                서버의 핵심 기능이 정상적으로 작동하는지 확인합니다.
            </p>
        </div>

        <TestRunner />
        
        <div className="text-center text-xs text-slate-400 pt-8 border-t border-slate-200 dark:border-slate-800">
            이 도구는 유지보수 및 장애 진단 목적으로 사용됩니다. <br/>
            테스트 수행 시 실제 데이터베이스 읽기/쓰기가 발생할 수 있습니다.
        </div>
    </div>
  );
}
