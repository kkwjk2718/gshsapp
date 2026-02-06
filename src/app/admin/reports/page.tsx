import { ReportsViewer } from "./reports-viewer";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "오류 신고 관리",
    description: "사용자가 신고한 오류를 확인하고 관리합니다.",
};

export default function AdminReportsPage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">오류 신고 관리</h1>
                <p className="text-sm text-slate-400 mt-1">사용자가 신고한 오류를 확인하고 처리 상태를 관리합니다.</p>
            </div>
            <ReportsViewer />
        </div>
    );
}
