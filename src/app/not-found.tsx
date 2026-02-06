'use client'

import Link from 'next/link'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-md">
                <div className="w-24 h-24 bg-slate-200 dark:bg-slate-900 rounded-3xl flex items-center justify-center shadow-lg transform rotate-12 mb-4">
                    <FileQuestion className="w-12 h-12 text-indigo-500" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
                        페이지를 찾을 수 없어요
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg">
                        요청하신 페이지가 존재하지 않거나,<br />
                        이동되었을 수 있습니다. 🥺
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full pt-4">
                    <button
                        onClick={() => window.history.back()}
                        className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>이전으로</span>
                    </button>

                    <Link
                        href="/"
                        className="flex-1 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                    >
                        <Home className="w-4 h-4" />
                        <span>홈으로 가기</span>
                    </Link>
                </div>

                <div className="text-xs text-slate-400 mt-8">
                    Error Code: 404 Not Found
                </div>
            </div>
        </div>
    )
}
