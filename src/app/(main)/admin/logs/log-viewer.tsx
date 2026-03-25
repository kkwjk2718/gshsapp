"use client"

import { useState, useEffect } from "react";
import { getSystemLogs } from "./actions";
import { Loader2, ChevronLeft, ChevronRight, Search, Eye, X } from "lucide-react";
import { formatKST } from "@/lib/date-utils";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

export function LogViewer() {
    const [logs, setLogs] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPage, setTotalPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState("ALL");
    const [filterRole, setFilterRole] = useState("ALL");
    const [searchUser, setSearchUser] = useState("");
    const [selectedLog, setSelectedLog] = useState<any>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs();
        }, 500);
        return () => clearTimeout(timer);
    }, [page, filterType, filterRole, searchUser]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await getSystemLogs(page, 15, filterType, searchUser, filterRole);
            setLogs(data.logs);
            setTotalPage(data.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Removed manual useEffect for fetchLogs to avoid double calling due to debouncing logic covering it.
    // The debounce effect covers page changes too.

    // Action Filters
    const actionTypes = ["ALL", "LOGIN", "LOGOUT", "PAGE_VIEW", "SONG_REQUEST", "ADMIN_ACTION", "ERROR"];
    const roles = [
        { label: "전체 역할", value: "ALL" },
        { label: ROLE_LABELS.STUDENT, value: "STUDENT" },
        { label: ROLE_LABELS.GRADUATE, value: "GRADUATE" },
        { label: ROLE_LABELS.TEACHER, value: "TEACHER" },
        { label: ROLE_LABELS.BROADCAST, value: "BROADCAST" },
        { label: ROLE_LABELS.ADMIN, value: "ADMIN" }
    ];

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Search User */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="이름/학번 검색..."
                            value={searchUser}
                            onChange={(e) => {
                                setSearchUser(e.target.value);
                                setPage(1);
                            }}
                            className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-48 placeholder:text-slate-600"
                        />
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filterRole}
                        onChange={(e) => {
                            setFilterRole(e.target.value);
                            setPage(1);
                        }}
                        className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {roles.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>

                    {/* Type Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-400 hidden md:inline">|</span>
                        <select
                            value={filterType}
                            onChange={(e) => {
                                setFilterType(e.target.value);
                                setPage(1);
                            }}
                            className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {actionTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <span className="text-sm font-medium text-slate-400">
                            {page} / {totalPage || 1}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPage, p + 1))}
                            disabled={page === totalPage || loading}
                            className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-700 bg-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Time</th>
                                <th className="px-6 py-4 font-medium">Action</th>
                                <th className="px-6 py-4 font-medium">User</th>
                                <th className="px-6 py-4 font-medium">Path / IP</th>
                                <th className="px-6 py-4 font-medium text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                            <p>불러오는 중...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        기록된 로그가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 text-slate-300 whitespace-nowrap">
                                            {formatKST(log.createdAt, "MM.dd HH:mm:ss")}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
                                                ${log.action === 'ERROR' ? 'bg-rose-500/10 text-rose-400' :
                                                    log.action === 'LOGIN' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        log.action === 'ADMIN_ACTION' ? 'bg-amber-500/10 text-amber-400' :
                                                            'bg-slate-700/50 text-slate-300'}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-200 font-medium">{log.user?.name || "Guest"}</span>
                                                <span className="text-xs text-slate-500">
                                                    {log.user?.studentId || (log.user?.role ? ROLE_LABELS[log.user.role as UserRole] ?? log.user.role : "-")}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 max-w-[200px]">
                                            <div className="flex flex-col truncate">
                                                <span className="text-slate-300 truncate" title={log.path}>{log.path || "-"}</span>
                                                <span className="text-xs text-slate-500">{log.ip}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="p-2 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                            <h3 className="text-lg font-bold text-slate-100">Log Details</h3>
                            <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="space-y-1">
                                <label className="text-slate-500 text-xs">Time</label>
                                <p className="text-slate-200 font-mono">{formatKST(selectedLog.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-slate-500 text-xs">Action</label>
                                <p className="text-slate-200 font-mono">{selectedLog.action}</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-slate-500 text-xs">User</label>
                                <p className="text-slate-200">
                                    {selectedLog.user?.name} ({selectedLog.user?.studentId || (selectedLog.user?.role ? ROLE_LABELS[selectedLog.user.role as UserRole] ?? selectedLog.user.role : "N/A")})
                                </p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-slate-500 text-xs">IP Address</label>
                                <p className="text-slate-200 font-mono">{selectedLog.ip}</p>
                            </div>
                            <div className="col-span-2 space-y-1">
                                <label className="text-slate-500 text-xs">Path</label>
                                <p className="text-slate-200 font-mono break-all bg-slate-950 p-2 rounded">{selectedLog.path}</p>
                            </div>
                            <div className="col-span-2 space-y-1">
                                <label className="text-slate-500 text-xs">Details (JSON)</label>
                                <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto max-h-60">
                                    {tryFormatJson(selectedLog.details)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function tryFormatJson(str: string | null) {
    if (!str) return "No details";
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {
        return str;
    }
}
