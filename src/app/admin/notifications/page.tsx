import { sendAdminNotification } from "./actions";
import { Send, Users, User, Calendar } from "lucide-react";

export default function AdminNotificationsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                        알림 발송
                    </h1>
                    <p className="text-slate-400">전체 또는 특정 사용자에게 알림을 보냅니다.</p>
                </div>
            </div>

            <div className="glass-card p-6 max-w-2xl">
                <form
                    // @ts-ignore
                    action={sendAdminNotification}
                    className="space-y-6">

                    {/* Target Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-300">수신 대상</label>
                        <div className="flex gap-4 p-1 bg-slate-800/50 rounded-xl w-fit">
                            <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer hover:bg-white/5 has-[:checked]:bg-indigo-500/20 has-[:checked]:text-indigo-400 transition-all">
                                <input type="radio" name="targetType" value="ALL" className="hidden" defaultChecked />
                                <Users className="w-4 h-4" />
                                <span className="text-sm font-bold">전체 사용자</span>
                            </label>
                            <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer hover:bg-white/5 has-[:checked]:bg-indigo-500/20 has-[:checked]:text-indigo-400 transition-all">
                                <input type="radio" name="targetType" value="USER" className="hidden" />
                                <User className="w-4 h-4" />
                                <span className="text-sm font-bold">특정 사용자</span>
                            </label>
                        </div>
                    </div>

                    {/* User ID Input (Conditional in logic, ensuring placeholder/helper text explains it) */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300">대상 사용자 ID (특정 사용자 선택 시)</label>
                        <input
                            type="text"
                            name="targetUserId"
                            placeholder="예: kkwjk247"
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300">제목</label>
                        <input
                            type="text"
                            name="title"
                            required
                            placeholder="알림 제목을 입력하세요"
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-300">내용</label>
                        <textarea
                            name="content"
                            required
                            rows={4}
                            placeholder="알림 내용을 입력하세요"
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300">링크 (선택)</label>
                            <input
                                type="text"
                                name="link"
                                placeholder="/songs"
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300">만료 기간 (일)</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                                <input
                                    type="number"
                                    name="expiresAfter"
                                    defaultValue={7}
                                    min={1}
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-base">
                        <Send className="w-4 h-4" />
                        알림 발송하기
                    </button>
                </form>
            </div>
        </div>
    );
}
