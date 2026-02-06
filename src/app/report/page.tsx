import { ReportForm } from "./report-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "오류 신고",
    description: "시스템 오류나 버그를 신고하세요.",
};

export default function ReportPage() {
    return (
        <div className="p-4 md:p-8">
            <ReportForm />
        </div>
    );
}
