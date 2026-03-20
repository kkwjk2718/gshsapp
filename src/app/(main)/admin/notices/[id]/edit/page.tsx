import { prisma } from "@/lib/db";
import { loadNoticeCategories } from "@/lib/notice-categories";
import { notFound } from "next/navigation";
import { EditNoticeForm } from "./edit-form";

type Props = {
    params: Promise<{ id: string }>;
};

export default async function EditNoticePage({ params }: Props) {
    const { id } = await params;

    const [notice, categories] = await Promise.all([
        prisma.notice.findUnique({ where: { id } }),
        loadNoticeCategories(prisma),
    ]);

    if (!notice) notFound();

    return <EditNoticeForm notice={notice} categories={categories} />;
}
