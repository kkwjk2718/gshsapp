"use client"

import { useState } from "react";
import { submitErrorReport } from "./actions";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";

export function ReportForm() {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            setStatus("error");
            return;
        }

        setIsSubmitting(true);
        setStatus("idle");

        try {
            await submitErrorReport(title, content);
            setStatus("success");
            setTitle("");
            setContent("");

            // Auto reset success message after 3 seconds
            setTimeout(() => setStatus("idle"), 3000);
        } catch (error) {
            console.error(error);
            setStatus("error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="glass p-8 rounded-3xl">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">오류 신고</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        발견하신 오류나 버그를 자세히 알려주세요. 관리자가 확인 후 조치하겠습니다.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Title */}
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                            제목 <span className="text-rose-600 dark:text-rose-400">*</span>
                        </label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="예: 로그인 페이지 오류"
                            className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                            disabled={isSubmitting}
                            required
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label htmlFor="content" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                            내용 <span className="text-rose-600 dark:text-rose-400">*</span>
                        </label>
                        <textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="오류 상황을 자세히 설명해주세요...&#10;&#10;예시:&#10;- 어떤 페이지에서 발생했나요?&#10;- 어떤 상황에서 발생했나요?&#10;- 오류 메시지가 있었나요?"
                            className="w-full px-4 py-3 bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none"
                            rows={8}
                            disabled={isSubmitting}
                            required
                        />
                    </div>

                    {/* Status Messages */}
                    {status === "success" && (
                        <div className="flex items-center gap-2 p-4 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">신고가 성공적으로 제출되었습니다!</span>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="flex items-center gap-2 p-4 bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-400">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm font-medium">제목과 내용을 모두 입력해주세요.</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white font-medium rounded-xl transition-colors disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                        {isSubmitting ? "제출 중..." : "오류 신고하기"}
                    </button>
                </form>
            </div>
        </div>
    );
}
