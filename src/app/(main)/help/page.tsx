"use client"

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, AlertCircle, HelpCircle } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function HelpPage() {
    const faqs = [
        {
            question: "아이디/비밀번호를 분실했어요.",
            answer: "구글 계정(@gshs.gne.go.kr)의 비밀번호를 분실하셨다면, 정보부 학생에게 비밀번호 초기화를 요청해주세요."
        },
        {
            question: "기상곡 신청은 언제 할 수 있나요?",
            answer: "기상곡 신청은 매주 정해진 기간(보통 일요일 저녁 6시 ~ 수요일 밤 12시)에만 가능합니다. 방송부원이나 관리자가 신청 기간을 설정합니다."
        },
        {
            question: "급식 정보가 안 나와요.",
            answer: "NEIS(나이스) 서버 점검이나 일시적인 네트워크 오류일 수 있습니다. 잠시 후 다시 시도해보시고, 계속 안 된다면 '오류 신고'를 이용해주세요."
        },
        {
            question: "모바일에서도 잘 되나요?",
            answer: "네! GSHS.app은 모바일 환경에 최적화되어 있습니다. 홈 화면에 추가(PWA)하시면 앱처럼 편하게 쓰실 수 있습니다."
        },
        {
            question: "내 정보를 수정하고 싶어요.",
            answer: "우측 상단 프로필 메뉴의 '내 정보' 또는 사이드바의 '내 정보' 메뉴에서 학번, 기수 등을 수정할 수 있습니다."
        }
    ];

    return (
        <div className="max-w-3xl mx-auto p-6 md:p-12 space-y-12">
            <header className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 mb-4">
                    <HelpCircle className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300">
                    무엇을 도와드릴까요?
                </h1>
                <p className="text-slate-500">
                    자주 묻는 질문들을 모았습니다. 다른 문제가 있다면 언제든지 알려주세요.
                </p>
            </header>

            {/* FAQ Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-bold px-2">자주 묻는 질문</h2>
                <div className="space-y-3">
                    {faqs.map((faq, idx) => (
                        <FaqItem key={idx} question={faq.question} answer={faq.answer} />
                    ))}
                </div>
            </section>

            {/* Contact Section */}
            <section className="grid md:grid-cols-2 gap-6 pt-8 border-t border-slate-200 dark:border-slate-800">
                <div className="glass p-6 rounded-2xl space-y-4 hover:border-indigo-500/30 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">오류가 발생했나요?</h3>
                        <p className="text-sm text-slate-500 mt-1 mb-4">
                            서비스 이용 중 버그나 에러를 발견하셨다면 신고해주세요.
                        </p>
                        <Link
                            href="/report"
                            className="inline-flex items-center gap-2 text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors"
                        >
                            오류 신고하기 &rarr;
                        </Link>
                    </div>
                </div>

                <div className="glass p-6 rounded-2xl space-y-4 hover:border-indigo-500/30 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                        <Mail className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">개발자에게 문의하기</h3>
                        <p className="text-sm text-slate-500 mt-1 mb-4">
                            기능 제안이나 기타 문의사항이 있으신가요?
                        </p>
                        <a
                            href="mailto:gshs.app.team@gmail.com"
                            className="inline-flex items-center gap-2 text-sm font-bold text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                            이메일 보내기 &rarr;
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}

function FaqItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="glass rounded-xl overflow-hidden transition-all duration-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between text-left font-medium hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
            >
                <span>{question}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="px-6 pb-4 text-sm text-slate-500 border-t border-slate-100 dark:border-slate-800/50 pt-3">
                            {answer}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
