import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { EditNoticeForm } from "./edit-form";

type Props = {
    params: Promise<{ id: string }>;
};

export default async function EditNoticePage({ params }: Props) {
    const { id } = await params;

    const [notice, categories] = await Promise.all([
        prisma.notice.findUnique({ where: { id } }),
        prisma.noticeCategory.findMany({ orderBy: { label: "asc" } }),
    ]);

    if (!notice) notFound();

    return <EditNoticeForm notice={notice} categories={categories} />;
}
