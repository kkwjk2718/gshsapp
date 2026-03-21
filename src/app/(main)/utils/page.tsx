"use client";

import Link from "next/link";
import {
  Armchair,
  ArrowRight,
  Calculator,
  Clock3,
  Dices,
  Timer,
  Wrench,
} from "lucide-react";

const tools = [
  {
    name: "학교부 바이트 계산기",
    description: "학교생활기록부와 NEIS 입력 기준에 맞춰 바이트 수를 계산합니다.",
    icon: Calculator,
    href: "/utils/byte-calculator",
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  {
    name: "랜덤 숫자 뽑기",
    description: "원하는 범위 안에서 무작위 숫자를 뽑고 중복 여부도 설정할 수 있습니다.",
    icon: Dices,
    href: "/utils/random-number",
    color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  },
  {
    name: "자리 배치",
    description: "교실 좌석을 무작위로 배치하고 빈 자리는 제외해 저장할 수 있습니다.",
    icon: Armchair,
    href: "/utils/seat-arrangement",
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  {
    name: "타이머",
    description: "분과 초를 설정해 집중 시간이나 활동 시간을 카운트다운합니다.",
    icon: Timer,
    href: "/utils/timer",
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    name: "스톱워치",
    description: "경과 시간을 재고 랩을 기록해 발표나 실험 시간을 빠르게 확인합니다.",
    icon: Clock3,
    href: "/utils/stopwatch",
    color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  },
];

export default function UtilsPage() {
  return (
    <div className="mobile-page mobile-safe-bottom space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-900/30">
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">도구 모음</h1>
          <p className="text-slate-500 dark:text-slate-400">
            학교 생활에서 자주 쓰는 유틸리티를 한곳에 모았습니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="glass group block rounded-3xl border border-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/30 hover:shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`rounded-2xl p-3 ${tool.color}`}>
                <tool.icon className="h-6 w-6" />
              </div>
              <div className="rounded-full bg-slate-100 p-2 text-slate-400 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-500 dark:bg-slate-800 dark:group-hover:bg-indigo-900/30">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            <h3 className="mb-2 text-lg font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
              {tool.name}
            </h3>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
