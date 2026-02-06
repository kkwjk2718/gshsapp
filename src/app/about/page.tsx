import Image from "next/image";
import { Info, Code, Heart, ShieldCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-12">
      {/* Header */}
      <div className="text-center space-y-4 py-8">
         <h1 className="text-4xl md:text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">GSHS.app</h1>
         <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            경남과학고등학교 학생들을 위한<br className="md:hidden" /> 올인원 스마트 플랫폼
         </p>
      </div>

      {/* Mission */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="glass p-6 rounded-3xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600">
               <Info className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold">편리한 정보 접근</h3>
            <p className="text-sm text-slate-500">
               급식, 시간표, 공지사항 등 학교 생활에 필수적인 정보를 한 곳에서 쉽고 빠르게 확인하세요.
            </p>
         </div>
         <div className="glass p-6 rounded-3xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600">
               <Heart className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold">학생 중심 서비스</h3>
            <p className="text-sm text-slate-500">
               기상곡 신청, 바로가기 모음 등 학생들이 실제로 필요로 하는 기능을 중심으로 개발되었습니다.
            </p>
         </div>
         <div className="glass p-6 rounded-3xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600">
               <Code className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold">지속적인 발전</h3>
            <p className="text-sm text-slate-500">
               정보부와 개발자의 노력으로 피드백을 반영하며 꾸준히 업데이트됩니다.
            </p>
         </div>
      </div>

      {/* Team */}
      <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">만든 사람들</h2>
          
          <div className="glass p-8 rounded-3xl flex flex-col md:flex-row items-center gap-8">
             <div className="w-32 h-32 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-4xl font-bold text-indigo-600">
                K
             </div>
             <div className="text-center md:text-left space-y-2">
                <div className="flex items-center justify-center md:justify-start gap-2">
                    <h3 className="text-xl font-bold">김건우</h3>
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-600 rounded-md text-xs font-bold">Lead Developer</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                   "학교 생활을 더 편하게 만들고 싶어서 개발을 시작했습니다. 
                   풀스택 개발을 담당하며, 프론트엔드 UI/UX부터 백엔드 서버 구축, DB 설계까지 총괄하고 있습니다."
                </p>
                <div className="flex gap-2 justify-center md:justify-start text-sm text-slate-500">
                   <span>Next.js</span> &middot; <span>TypeScript</span> &middot; <span>Prisma</span> &middot; <span>Docker</span>
                </div>
             </div>
          </div>

          <div className="glass p-8 rounded-3xl text-center">
             <h3 className="text-lg font-bold mb-2 flex items-center justify-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-500" />
                운영 및 관리: 경남과학고등학교 정보부
             </h3>
             <p className="text-slate-500 text-sm">
                서버 운영, 콘텐츠 관리(공지사항, 기상곡 승인), 그리고 개인정보 보호를 책임지고 있습니다.
             </p>
          </div>
      </div>

      {/* Open Source / Contact */}
      <div className="text-center text-slate-500 text-sm space-y-2">
         <p>본 서비스는 오픈소스 프로젝트로 진행될 수 있습니다.</p>
         <p>문의: <a href="mailto:info@gshs.kr" className="text-indigo-500 hover:underline">info@gshs.kr</a> (가상 이메일)</p>
      </div>
    </div>
  );
}
