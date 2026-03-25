"use client"

import { useState, useEffect } from "react";
import { getErrorReports, updateReportStatus } from "./actions";
import { ChevronLeft, ChevronRight, Eye, X, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatKST } from "@/lib/date-utils";

export function ReportsViewer() {
    const [reports, setReports] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPage, setTotalPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [modalTab, setModalTab] = useState<"details" | "update">("details");

    const fetchReports = async () => {
        setLoading(true);
        try {
            const data = await getErrorReports(page, 15, filterStatus);
            setReports(data.reports);
            setTotalPage(data.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [page, filterStatus]);

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        try {
            await updateReportStatus(id, newStatus);
            fetchReports();
            setSelectedReport(null);
        } catch (error) {
            console.error(error);
        }
    };

    const statuses = [
        { label: "전체", value: "ALL" },
        { label: "대기중", value: "PENDING" },
        { label: "검토중", value: "REVIEWING" },
        { label: "해결됨", value: "RESOLVED" }
    ];

    const getStatusBadge = (status: string) => {
        if (status === "PENDING") return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", icon: Clock };
        if (status === "REVIEWING") return { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", icon: AlertCircle };
        if (status === "RESOLVED") return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", icon: CheckCircle };
        return { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30", icon: AlertCircle };
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-400">상태:</span>
                    <select
                        value={filterStatus}
                        onChange={(e) => {
                            setFilterStatus(e.target.value);
                            setPage(1);
                        }}
                        className="bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {statuses.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </div>

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

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-700 bg-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">시간</th>
                                <th className="px-6 py-4 font-medium">제목</th>
                                <th className="px-6 py-4 font-medium">사용자</th>
                                <th className="px-6 py-4 font-medium">상태</th>
                                <th className="px-6 py-4 font-medium text-right">작업</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        불러오는 중...
                                    </td>
                                </tr>
                            ) : reports.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        신고된 오류가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((report) => {
                                    const StatusIcon = getStatusBadge(report.status).icon;
                                    return (
                                        <tr key={report.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 text-slate-300 whitespace-nowrap">
                                                {formatKST(report.createdAt, "MM.dd HH:mm")}
                                            </td>
                                            <td className="px-6 py-4 max-w-xs truncate text-slate-200 font-medium">
                                                {report.title}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-200 font-medium">{report.user?.name || "Unknown"}</span>
                                                    <span className="text-xs text-slate-500">{report.user?.studentId || "-"}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(report.status).bg} ${getStatusBadge(report.status).text} ${getStatusBadge(report.status).border}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {statuses.find(s => s.value === report.status)?.label || report.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => {
                                                        setSelectedReport(report);
                                                        setModalTab("details");
                                                    }}
                                                    className="p-2 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedReport && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedReport(null)}>
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                            <h3 className="text-lg font-bold text-slate-100">오류 신고 상세</h3>
                            <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 border-b border-slate-700">
                            <button
                                onClick={() => setModalTab("details")}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${modalTab === "details" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400 hover:text-slate-200"}`}
                            >
                                상세 정보
                            </button>
                            <button
                                onClick={() => setModalTab("update")}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${modalTab === "update" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400 hover:text-slate-200"}`}
                            >
                                상태 변경
                            </button>
                        </div>

                        {modalTab === "details" ? (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-slate-500 text-xs">제목</label>
                                    <p className="text-slate-200 font-medium">{selectedReport.title}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 text-xs">신고자</label>
                                    <p className="text-slate-200">{selectedReport.user?.name} ({selectedReport.user?.studentId})</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 text-xs">신고 시간</label>
                                    <p className="text-slate-200 font-mono">{formatKST(selectedReport.createdAt, "yyyy-MM-dd HH:mm:ss")}</p>
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-slate-500 text-xs">내용</label>
                                    <div className="bg-slate-950 p-4 rounded-lg text-slate-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                                        {selectedReport.content}
                                    </div>
                                </div>
                                {selectedReport.adminNotes && (
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-slate-500 text-xs">관리자 메모</label>
                                        <div className="bg-slate-950 p-4 rounded-lg text-slate-400 whitespace-pre-wrap">
                                            {selectedReport.adminNotes}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleStatusUpdate(selectedReport.id, "PENDING")}
                                        className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium"
                                    >
                                        대기중으로 변경
                                    </button>
                                    <button
                                        onClick={() => handleStatusUpdate(selectedReport.id, "REVIEWING")}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                    >
                                        검토중으로 변경
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleStatusUpdate(selectedReport.id, "RESOLVED")}
                                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    해결됨으로 변경
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
