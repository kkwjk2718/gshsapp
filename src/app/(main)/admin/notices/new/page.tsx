import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";
import { loadNoticeCategories } from "@/lib/notice-categories";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage() {
  await requireAdmin();
  const categories = await loadNoticeCategories(prisma);

  return <NoticeForm categories={categories} />;
}
