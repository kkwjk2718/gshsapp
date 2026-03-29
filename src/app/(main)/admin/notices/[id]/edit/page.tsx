import { prisma } from "@/lib/db";
import { loadNoticeCategories } from "@/lib/notice-categories";
import { canCreateUnlimitedNotice, canManageNotice } from "@/lib/notice-permissions";
import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { EditNoticeForm } from "./edit-form";

type Props = {
    params: Promise<{ id: string }>;
};

export default async function EditNoticePage({ params }: Props) {
    const { id } = await params;

    const [notice, categories, user] = await Promise.all([
        prisma.notice.findUnique({ where: { id } }),
        loadNoticeCategories(prisma),
        getCurrentUser(),
    ]);

    if (!notice) notFound();
    if (!canManageNotice(user, notice.writerId)) notFound();

    return <EditNoticeForm notice={notice} categories={categories} canCreateUnlimited={canCreateUnlimitedNotice(user)} />;
}
