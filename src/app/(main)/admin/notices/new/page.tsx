import { prisma } from "@/lib/db";
import { loadNoticeCategories } from "@/lib/notice-categories";
import { canCreateNotice } from "@/lib/notice-permissions";
import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage() {
  const user = await getCurrentUser();

  if (!canCreateNotice(user)) {
    notFound();
  }

  const categories = await loadNoticeCategories(prisma);

  return <NoticeForm categories={categories} />;
}
