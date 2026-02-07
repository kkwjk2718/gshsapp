import { prisma } from "@/lib/db";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage() {
  const categories = await prisma.noticeCategory.findMany({
      orderBy: { label: 'asc' }
  });

  return <NoticeForm categories={categories} />;
}
