import { prisma } from "@/lib/db";
import { loadNoticeCategories } from "@/lib/notice-categories";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage() {
  const categories = await loadNoticeCategories(prisma);

  return <NoticeForm categories={categories} />;
}
