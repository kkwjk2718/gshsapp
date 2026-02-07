"use client"

import Link from "next/link";
import { ArrowRight, Sparkles, Zap, Shield, Calendar, BookOpen, Utensils } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100 overflow-hidden selection:bg-indigo-500/30">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse-slow" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-[120px] animate-pulse-slow delay-1000" />
            </div>

            {/* Navbar */}
            <nav className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
                <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
                    GSHS LIFE
                </div>
                <Link
                    href="/"
                    className="px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium backdrop-blur-md"
                >
                    앱 실행하기
                </Link>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 container mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="max-w-4xl mx-auto space-y-8"
                >
                    <motion.div variants={item}>
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-4">
                            <Sparkles className="w-3 h-3" />
                            경기과학고등학교 학생을 위한 올인원 플랫폼
                        </span>
                    </motion.div>

                    <motion.h1 variants={item} className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
                        학교 생활의 모든 것,<br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400">
                            더 스마트하게.
                        </span>
                    </motion.h1>

                    <motion.p variants={item} className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                        급식 정보부터 공지사항, 그리고 편리한 유틸리티까지.
                        <br className="hidden md:block" />
                        복잡한 학교 생활을 하나의 앱으로 단순화하세요.
                    </motion.p>

                    <motion.div variants={item} className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                        <Link
                            href="/"
                            className="group px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                        >
                            시작하기
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <button className="px-8 py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-bold text-lg transition-all border border-white/10 backdrop-blur-md">
                            더 알아보기
                        </button>
                    </motion.div>
                </motion.div>

                {/* Floating Mockup / Visual */}
                <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="mt-24 relative w-full max-w-5xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent z-10" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-80 perspective-1000">
                        {/* Feature Cards as Visuals */}
                        <div className="transform rotate-y-12 translate-y-12 bg-slate-800/50 border border-slate-700/50 p-6 rounded-3xl h-64 backdrop-blur-sm">
                            <Utensils className="w-10 h-10 text-orange-400 mb-4" />
                            <div className="h-4 w-24 bg-slate-700 rounded mb-2" />
                            <div className="h-20 w-full bg-slate-700/50 rounded" />
                        </div>
                        <div className="transform translate-y-0 bg-slate-800/80 border border-indigo-500/30 p-6 rounded-3xl h-64 z-20 shadow-2xl shadow-indigo-500/20 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-6">
                                <div className="text-xl font-bold">Today</div>
                                <div className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs">Active</div>
                            </div>
                            <div className="space-y-3">
                                <div className="h-12 w-full bg-slate-700/50 rounded-xl" />
                                <div className="h-12 w-full bg-slate-700/50 rounded-xl" />
                                <div className="h-12 w-full bg-slate-700/50 rounded-xl" />
                            </div>
                        </div>
                        <div className="transform -rotate-y-12 translate-y-12 bg-slate-800/50 border border-slate-700/50 p-6 rounded-3xl h-64 backdrop-blur-sm">
                            <BookOpen className="w-10 h-10 text-emerald-400 mb-4" />
                            <div className="h-4 w-24 bg-slate-700 rounded mb-2" />
                            <div className="h-20 w-full bg-slate-700/50 rounded" />
                        </div>
                    </div>
                </motion.div>
            </main>

            {/* Features Grid */}
            <section className="relative z-10 container mx-auto px-6 py-24 border-t border-slate-800/50">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold mb-4">강력한 기능들</h2>
                    <p className="text-slate-400">학생들의 피드백을 반영하여 꼭 필요한 기능만 담았습니다.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={<Utensils className="w-6 h-6 text-orange-400" />}
                        title="오늘의 급식"
                        desc="맛있는 점심, 저녁 메뉴를 실시간으로 확인하고 칼로리 정보까지 얻으세요."
                    />
                    <FeatureCard
                        icon={<Calendar className="w-6 h-6 text-blue-400" />}
                        title="학사 일정"
                        desc="시험 기간, 축제, 휴일 등 중요한 학교 일정을 놓치지 마세요."
                    />
                    <FeatureCard
                        icon={<BookOpen className="w-6 h-6 text-emerald-400" />}
                        title="공지사항 알림"
                        desc="가정통신문과 학교 공지사항을 앱에서 바로 확인하세요."
                    />
                    <FeatureCard
                        icon={<Zap className="w-6 h-6 text-yellow-400" />}
                        title="유틸리티 도구"
                        desc="랜덤 번호 추첨, 자리 배치 등 학급 운영에 유용한 도구를 제공합니다."
                    />
                    <FeatureCard
                        icon={<Shield className="w-6 h-6 text-rose-400" />}
                        title="학생 인증"
                        desc="오직 경기과학고 학생들만 접근할 수 있는 안전한 커뮤니티입니다."
                    />
                    <FeatureCard
                        icon={<Sparkles className="w-6 h-6 text-purple-400" />}
                        title="모던 디자인"
                        desc="최신 트렌드를 반영한 깔끔하고 아름다운 UI/UX를 경험하세요."
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-slate-800 bg-[#020617] py-12">
                <div className="container mx-auto px-6 text-center text-slate-500 text-sm">
                    <p className="mb-4">© 2026 GSHS LIFE. All rights reserved.</p>
                    <div className="flex justify-center gap-6">
                        <a href="#" className="hover:text-slate-300 transition-colors">이용약관</a>
                        <a href="#" className="hover:text-slate-300 transition-colors">개인정보처리방침</a>
                        <a href="#" className="hover:text-slate-300 transition-colors">문의하기</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="p-6 rounded-2xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 hover:border-indigo-500/30 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-300 transition-colors">{title}</h3>
            <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
        </div>
    )
}
