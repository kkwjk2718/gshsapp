"use client"

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, User as UserIcon, Shield, GraduationCap, Radio, Search, KeyRound, Copy, Check, X } from "lucide-react";
import { format } from "date-fns";
import { changeUserRole, resetPassword } from "./actions";

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
    currentAdminId: string;
}

interface NewPasswordInfo {
    user: User;
    pass: string;
}

const ROLE_LABELS: Record<User["role"], string> = {
    STUDENT: "학생",
    TEACHER: "선생님",
    BROADCAST: "방송부",
    ADMIN: "관리자",
};

function getRoleChangeSummary(role: User["role"]) {
    if (role === "ADMIN") {
        return "관리자로 변경되면 기수는 제거되고, 기존 학번은 유지됩니다.";
    }

    if (role === "BROADCAST") {
        return "방송부 권한은 학생 메타데이터를 그대로 유지합니다.";
    }

    if (role === "TEACHER") {
        return "선생님 권한으로 변경되면 학번과 기수가 모두 제거됩니다.";
    }

    return "학생 권한으로 변경하려면 4자리 학생번호를 입력해야 하며, 기수는 자동 계산됩니다.";
}

export function UserGroupList({ users, currentAdminId }: UserGroupListProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"STUDENT" | "TEACHER" | "BROADCAST" | "ADMIN">("STUDENT");
    const [expandedGisu, setExpandedGisu] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [newPasswordInfo, setNewPasswordInfo] = useState<NewPasswordInfo | null>(null);
    const [copied, setCopied] = useState(false);
    const [selectedRoleUser, setSelectedRoleUser] = useState<User | null>(null);
    const [nextRole, setNextRole] = useState<User["role"]>("STUDENT");
    const [nextStudentId, setNextStudentId] = useState("");
    const [roleChangeError, setRoleChangeError] = useState<string | null>(null);
    const [isResetPending, startResetTransition] = useTransition();
    const [isRolePending, startRoleTransition] = useTransition();

    const isSearching = search.length > 0;
    const lowerSearch = search.toLowerCase();

    const handleResetPassword = (user: User) => {
        if (!confirm(`${user.name}님의 비밀번호를 초기화하시겠습니까?`)) return;

        startResetTransition(async () => {
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

    const handleOpenRoleModal = (user: User) => {
        setSelectedRoleUser(user);
        setNextRole(user.role);
        setNextStudentId(user.studentId ?? "");
        setRoleChangeError(null);
    };

    const handleRoleChange = () => {
        if (!selectedRoleUser) return;

        setRoleChangeError(null);

        startRoleTransition(async () => {
            const formData = new FormData();
            formData.append("userId", selectedRoleUser.id);
            formData.append("targetRole", nextRole);
            formData.append("studentId", nextStudentId);

            const result = await changeUserRole(formData);
            if (result.error) {
                setRoleChangeError(result.error);
                return;
            }

            setSelectedRoleUser(null);
            router.refresh();
            alert(result.success ?? "권한이 변경되었습니다.");
        });
    };

    const isSelfAdminDemotion =
        !!selectedRoleUser &&
        selectedRoleUser.id === currentAdminId &&
        selectedRoleUser.role === "ADMIN" &&
        nextRole !== "ADMIN";

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
                    onClick={() => handleOpenRoleModal(u)}
                    disabled={isRolePending}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
                    title="권한 변경"
                >
                    권한 변경
                </button>
                <button
                    onClick={() => handleResetPassword(u)}
                    disabled={isResetPending}
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
            {selectedRoleUser && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass rounded-3xl p-8 max-w-md w-full relative space-y-6">
                        <button
                            onClick={() => setSelectedRoleUser(null)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200"
                            aria-label="권한 변경 모달 닫기"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <div className="space-y-2">
                            <h2 className="text-lg font-bold text-slate-100">권한 변경</h2>
                            <p className="text-sm text-slate-400">
                                <span className="font-semibold text-indigo-300">{selectedRoleUser.name}</span>
                                {" "}({selectedRoleUser.userId}) 계정의 권한을 변경합니다.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300 space-y-1">
                            <div>현재 권한: <span className="font-semibold text-slate-100">{ROLE_LABELS[selectedRoleUser.role]}</span></div>
                            <div>현재 학번: <span className="font-semibold text-slate-100">{selectedRoleUser.studentId ?? "없음"}</span></div>
                            <div>현재 기수: <span className="font-semibold text-slate-100">{selectedRoleUser.gisu ? `${selectedRoleUser.gisu}기` : "없음"}</span></div>
                        </div>
                        <div className="space-y-3">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-200">변경할 권한</span>
                                <select
                                    value={nextRole}
                                    onChange={(event) => setNextRole(event.target.value as User["role"])}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="STUDENT">학생</option>
                                    <option value="TEACHER">선생님</option>
                                    <option value="BROADCAST">방송부</option>
                                    <option value="ADMIN">관리자</option>
                                </select>
                            </label>
                            {nextRole === "STUDENT" && (
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-200">학생번호</span>
                                    <input
                                        value={nextStudentId}
                                        onChange={(event) => setNextStudentId(event.target.value)}
                                        inputMode="numeric"
                                        maxLength={4}
                                        placeholder="예: 1304"
                                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </label>
                            )}
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                                {getRoleChangeSummary(nextRole)}
                            </div>
                            {isSelfAdminDemotion && (
                                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                                    현재 로그인한 관리자 계정의 ADMIN 권한은 해제할 수 없습니다.
                                </div>
                            )}
                            {roleChangeError && (
                                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                                    {roleChangeError}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedRoleUser(null)}
                                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleRoleChange}
                                disabled={isRolePending || nextRole === selectedRoleUser.role || isSelfAdminDemotion}
                                className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isRolePending ? "변경 중..." : "권한 변경 적용"}
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
