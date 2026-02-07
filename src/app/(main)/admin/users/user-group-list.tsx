"use client"

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, User as UserIcon, Shield, GraduationCap, Radio, Search, KeyRound, Copy, Check, X } from "lucide-react";
import { format } from "date-fns";
import { resetPassword } from "./actions";

interface User {
    id: string;
    name: string;
    userId: string;
    role: string;
    studentId: string | null;
    gisu: number | null;
    createdAt: Date;
}

interface UserGroupListProps {
    users: User[];
}

interface NewPasswordInfo {
    user: User;
    pass: string;
}

export function UserGroupList({ users }: UserGroupListProps) {
    const [activeTab, setActiveTab] = useState<"STUDENT" | "TEACHER" | "BROADCAST" | "ADMIN">("STUDENT");
    const [expandedGisu, setExpandedGisu] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [newPasswordInfo, setNewPasswordInfo] = useState<NewPasswordInfo | null>(null);
    const [copied, setCopied] = useState(false);
    const [isPending, startTransition] = useTransition();

    const isSearching = search.length > 0;
    const lowerSearch = search.toLowerCase();

    const handleResetPassword = (user: User) => {
        if (!confirm(`${user.name}님의 비밀번호를 초기화하시겠습니까?`)) return;

        startTransition(async () => {
            const formData = new FormData();
            formData.append('userId', user.id);
            const result = await resetPassword(formData);
            if (result.success) {
                const match = result.success.match(/New password is: (.*)$/);
                if (match && match[1]) {
                    setNewPasswordInfo({ user, pass: match[1] });
                } else {
                    alert(result.success); // Fallback if parsing fails
                }
            } else {
                alert(result.error || "오류가 발생했습니다.");
            }
        });
    };

    const handleCopyPassword = () => {
        if (!newPasswordInfo) return;
        navigator.clipboard.writeText(newPasswordInfo.pass);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // Filter & Grouping Logic...
    const filteredUsers = users.filter(u => {
        if (isSearching) {
            return (
                u.name.toLowerCase().includes(lowerSearch) ||
                u.userId.toLowerCase().includes(lowerSearch) ||
                (u.studentId && u.studentId.toLowerCase().includes(lowerSearch))
            );
        }

        if (activeTab === "STUDENT") return u.role === "STUDENT";
        if (activeTab === "TEACHER") return u.role === "TEACHER";
        if (activeTab === "BROADCAST") return u.role === "BROADCAST";
        if (activeTab === "ADMIN") return u.role === "ADMIN";
        return false;
    });

    const studentGroups: Record<string, User[]> = {};
    const searchGroups: Record<string, User[]> = {
        "STUDENT": [], "TEACHER": [], "BROADCAST": [], "ADMIN": []
    };

    if (isSearching) {
        filteredUsers.forEach(u => {
            if (searchGroups[u.role]) searchGroups[u.role].push(u);
        });
    } else if (activeTab === "STUDENT") {
        filteredUsers.forEach(u => {
            const key = u.gisu ? `${u.gisu}기` : "기수 미정";
            if (!studentGroups[key]) studentGroups[key] = [];
            studentGroups[key].push(u);
        });
    }
    // ... end of filtering and grouping

    const renderUserRow = (u: User) => (
        <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors border-b border-slate-800 last:border-0">
            <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${u.role === 'ADMIN' ? 'bg-indigo-500' :
                        u.role === 'TEACHER' ? 'bg-emerald-500' :
                            u.role === 'BROADCAST' ? 'bg-rose-500' : 'bg-slate-400'
                    }`}>
                    {u.name[0]}
                </div>
                <div>
                    <div className="font-bold text-slate-100">{u.name}</div>
                    <div className="text-xs text-slate-500">
                        {u.userId} &middot; {u.studentId ? `학번 ${u.studentId}` : u.role} {u.gisu ? `(${u.gisu}기)` : ""}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-xs text-slate-400 text-right">
                    {format(new Date(u.createdAt), "yyyy.MM.dd")}
                </div>
                <button
                    onClick={() => handleResetPassword(u)}
                    disabled={isPending}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-colors disabled:opacity-50"
                    title="비밀번호 초기화"
                >
                    <KeyRound className="w-4 h-4" />
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* New Password Modal */}
            {newPasswordInfo && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="glass rounded-3xl p-8 max-w-sm w-full relative">
                        <button onClick={() => setNewPasswordInfo(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold mb-2">비밀번호 초기화 완료</h2>
                        <p className="text-sm text-slate-500 mb-4">
                            <span className="font-bold text-indigo-500">{newPasswordInfo.user.name}</span>님의 새 비밀번호입니다.
                            이 창을 닫으면 다시 확인할 수 없습니다.
                        </p>
                        <div className="flex gap-2 p-4 bg-slate-800 rounded-xl">
                            <code className="flex-1 font-mono font-bold text-lg select-all">{newPasswordInfo.pass}</code>
                            <button
                                onClick={handleCopyPassword}
                                className="p-2 rounded-lg bg-slate-700 text-slate-500 hover:text-indigo-500"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {/* Search & Tabs */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className={`flex bg-slate-800 p-1 rounded-xl w-fit flex-shrink-0 transition-opacity ${isSearching ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
                        {[
                            { id: "STUDENT", label: "학생", icon: UserIcon },
                            { id: "TEACHER", label: "선생님", icon: GraduationCap },
                            { id: "BROADCAST", label: "방송부", icon: Radio },
                            { id: "ADMIN", label: "관리자", icon: Shield },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id
                                        ? "bg-slate-700 text-indigo-400 shadow-sm"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative w-full md:w-64 md:ml-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            placeholder="이름, 아이디, 학번 검색..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="glass rounded-3xl overflow-hidden min-h-[300px]">
                    {isSearching ? (
                        // Search Results View
                        <div className="divide-y divide-slate-800">
                            <div className="p-4 bg-indigo-900/20 text-sm font-bold text-indigo-400">
                                검색 결과: {filteredUsers.length}명
                            </div>
                            {Object.entries(searchGroups).map(([role, groupUsers]) => {
                                if (groupUsers.length === 0) return null;
                                const roleName = role === 'STUDENT' ? '학생' : role === 'TEACHER' ? '선생님' : role === 'BROADCAST' ? '방송부' : '관리자';
                                return (
                                    <div key={role}>
                                        <div className="p-3 bg-slate-800/50 text-xs font-bold text-slate-500 border-y border-slate-800">
                                            {roleName} ({groupUsers.length})
                                        </div>
                                        {groupUsers.map(renderUserRow)}
                                    </div>
                                )
                            })}
                            {filteredUsers.length === 0 && (
                                <div className="p-12 text-center text-slate-500">검색 결과가 없습니다.</div>
                            )}
                        </div>
                    ) : activeTab === "STUDENT" ? (
                        // Student Tab (Grouped by Gisu)
                        <div className="divide-y divide-slate-800">
                            {Object.entries(studentGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([gisu, groupUsers]) => (
                                <div key={gisu}>
                                    <button
                                        onClick={() => setExpandedGisu(expandedGisu === parseInt(gisu) ? null : parseInt(gisu))}
                                        className="w-full flex items-center justify-between p-4 bg-slate-900/30 hover:bg-slate-800 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 font-bold text-slate-300">
                                            {expandedGisu === parseInt(gisu) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            {gisu}
                                        </div>
                                        <span className="text-xs bg-slate-800 px-2 py-1 rounded-full text-slate-400">
                                            {groupUsers.length}명
                                        </span>
                                    </button>
                                    {expandedGisu === parseInt(gisu) && (
                                        <div className="bg-slate-950 pl-4 border-t border-slate-800">
                                            {groupUsers.map(renderUserRow)}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {Object.keys(studentGroups).length === 0 && (
                                <div className="p-12 text-center text-slate-500">학생 데이터가 없습니다.</div>
                            )}
                        </div>
                    ) : (
                        // Other Tabs (Flat List)
                        <div className="divide-y divide-slate-800">
                            {filteredUsers.length > 0 ? filteredUsers.map(renderUserRow) : (
                                <div className="p-12 text-center text-slate-500">데이터가 없습니다.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}