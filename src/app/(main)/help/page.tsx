"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  AlertCircle,
  HelpCircle,
  BookOpen,
  Compass,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "아이디나 비밀번호를 잊어버렸어요.",
    answer:
      "계정 정보 분실 시에는 학교 정보부 또는 관리자에게 문의해 주세요. 비밀번호는 시스템에서 평문으로 확인할 수 없으므로, 본인 확인 후 초기화 방식으로만 처리됩니다.",
  },
  {
    question: "기상곡 신청은 언제 열리나요?",
    answer:
      "기상곡 신청은 요일별 학년 제한과 방송부 운영 규칙에 따라 열립니다. 신청 화면에서 현재 신청 가능 여부가 안내되며, 승인과 반려 결과는 알림 센터에서 확인할 수 있습니다.",
  },
  {
    question: "급식이나 시간표가 비어 보여요.",
    answer:
      "급식과 일부 학교 정보는 외부 교육 API를 통해 불러옵니다. 원본 시스템 응답이 지연되거나 일시적으로 비어 있으면 화면에도 늦게 반영될 수 있습니다. 잠시 후 다시 확인해 보시고, 문제가 계속되면 오류 신고를 남겨 주세요.",
  },
  {
    question: "교내 사이트 페이지가 로그인 후에만 보이는 이유가 무엇인가요?",
    answer:
      "교내 사이트는 학교 내부에서만 활용하는 링크가 포함될 수 있어 로그인한 사용자에게만 제공합니다. 공개 페이지에서 바로 접근할 수 없도록 보호되어 있습니다.",
  },
  {
    question: "모바일에서도 모든 기능을 사용할 수 있나요?",
    answer:
      "대부분의 핵심 기능은 모바일에서도 동일하게 사용할 수 있습니다. 다만 일부 관리 기능은 데스크톱 화면에서 더 편하게 사용할 수 있으며, 알림·기상곡·도구 화면은 모바일 우선으로 최적화되어 있습니다.",
  },
];

const guideSections = [
  {
    title: "시작하기",
    icon: Compass,
    items: [
      "로그인 후 홈 화면에서 급식, 시간표, 공지, 개인 D-Day를 한 번에 확인할 수 있습니다.",
      "모바일에서는 하단 네비게이션으로 자주 쓰는 메뉴에 빠르게 이동할 수 있습니다.",
      "데스크톱에서는 상단 메뉴와 드로어 메뉴를 통해 모든 기능에 접근할 수 있습니다.",
    ],
  },
  {
    title: "주요 기능 사용법",
    icon: BookOpen,
    items: [
      "공지사항: 학교 공지와 행사 안내를 카테고리별로 확인할 수 있고, 관리자 권한이 있으면 작성과 수정이 가능합니다.",
      "급식/학사일정: 외부 학교 정보 API를 바탕으로 오늘의 급식과 예정된 일정을 빠르게 확인합니다.",
      "링크모음/교내 사이트: 자주 쓰는 학습 링크와 학교 관련 사이트를 분리해 제공하며, 교내 사이트는 로그인 후 접근할 수 있습니다.",
      "기상곡: 신청 가능한 요일에만 곡을 제출할 수 있고, 진행 상태는 알림과 방송부 화면에서 확인됩니다.",
      "도구: 계산기, 타이머, 스톱워치 등 학교 생활에 자주 쓰는 보조 기능을 제공합니다.",
    ],
  },
  {
    title: "문제 해결과 안전",
    icon: ShieldCheck,
    items: [
      "이상한 동작이 보이면 먼저 새로고침 후 다시 시도해 보세요.",
      "로그인 문제, 데이터 누락, 승인 오류 등은 오류 신고 화면에서 바로 접수할 수 있습니다.",
      "개인정보가 포함된 계정 문제는 공개 채널보다 이메일 문의를 우선 권장합니다.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-4xl space-y-12">
      <header className="space-y-4 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
          <HelpCircle className="h-8 w-8" />
        </div>
        <h1 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-3xl font-bold text-transparent dark:from-white dark:to-slate-300">
          GSHS.app 도움말
        </h1>
        <p className="mx-auto max-w-2xl text-slate-500">
          처음 사용하는 학생도 바로 적응할 수 있도록 핵심 기능과 자주 묻는 질문을 정리했습니다.
          화면별 사용법, 오류 대응 방법, 문의 경로까지 한 번에 확인해 보세요.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {guideSections.map(({ title, icon: Icon, items }) => (
          <div key={title} className="glass rounded-2xl p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-500">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="px-2 text-xl font-bold text-slate-900 dark:text-white">자주 묻는 질문</h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 border-t border-slate-200 pt-8 dark:border-slate-800 md:grid-cols-2">
        <div className="glass rounded-2xl p-6 transition-colors hover:border-indigo-500/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">문제가 발생했나요?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            오류 화면, 데이터 누락, 버튼 동작 문제처럼 서비스 이용 중 문제가 생겼다면 오류 신고를 남겨 주세요.
            가능한 한 어떤 화면에서 무슨 문제가 났는지 같이 적어 주시면 처리 속도가 빨라집니다.
          </p>
          <Link
            href="/report"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-rose-500 transition-colors hover:text-rose-600"
          >
            오류 신고하러 가기 &rarr;
          </Link>
        </div>

        <div className="glass rounded-2xl p-6 transition-colors hover:border-indigo-500/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">개발자에게 문의하기</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            기능 제안, 계정 관련 문의, 서비스 개선 의견은 아래 메일로 보내 주세요. 오류 신고가 아니라 운영 문의라면 이메일이 가장 빠릅니다.
          </p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            admin@gshs.app
          </div>
          <a
            href="mailto:admin@gshs.app"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-indigo-500 transition-colors hover:text-indigo-600"
          >
            메일 보내기 &rarr;
          </a>
        </div>
      </section>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="glass overflow-hidden rounded-xl border border-transparent transition-all duration-200 hover:border-slate-200 dark:hover:border-slate-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="tap-target flex w-full items-center justify-between px-6 py-4 text-left font-medium transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
      >
        <span>{question}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-slate-100 px-6 pb-4 pt-3 text-sm leading-6 text-slate-500 dark:border-slate-800/50">
              {answer}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
