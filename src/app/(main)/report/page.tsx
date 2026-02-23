import { ReportForm } from "./report-form";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "오류 신고",
    description: "시스템 오류나 버그를 신고하세요.",
    robots: { index: false, follow: false },
    alternates: { canonical: "/report" },
};

export default function ReportPage() {
    return (
        <div className="mobile-page mobile-safe-bottom">
            <ReportForm />
        </div>
    );
}
