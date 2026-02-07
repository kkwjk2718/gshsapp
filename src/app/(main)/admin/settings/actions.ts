"use server"

import { prisma } from "@/lib/db";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/session";

export async function updateGradeMapping(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const g1 = parseInt(formData.get("grade1") as string);
  const g2 = parseInt(formData.get("grade2") as string);
  const g3 = parseInt(formData.get("grade3") as string);

  const mapping = {
      "1": g1,
      "2": g2,
      "3": g3
  };

  await prisma.systemSetting.upsert({
      where: { key: "GRADE_MAPPING" },
      update: { value: JSON.stringify(mapping) },
      create: { key: "GRADE_MAPPING", value: JSON.stringify(mapping), description: "학년별 기수 매핑" }
  });

  // revalidateTag("grade-mapping");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}

export type ActionResult = {
  success?: string;
  error?: string;
};

export async function updateICalUrl(prevState: any, formData: FormData): Promise<ActionResult> {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

    const url = formData.get("icalUrl") as string;
    
    // Basic URL validation
    if (url && !url.startsWith("https://")) {
        return { error: "유효하지 않은 URL입니다. https://로 시작해야 합니다." }
    }

    await prisma.systemSetting.upsert({
        where: { key: "ICAL_URL" },
        update: { value: url },
        create: { key: "ICAL_URL", value: url, description: "Google Calendar iCal URL for sync" }
    });
    
    revalidatePath("/admin/settings");
    // revalidateTag("schedules"); 
    revalidatePath("/", "layout");
    return { success: "iCal URL이 업데이트되었습니다." };
}

export const getICalUrl = unstable_cache(
    async () => {
        const setting = await prisma.systemSetting.findUnique({ where: { key: "ICAL_URL" } });
        return setting?.value || null;
    },
    ["ical-url"],
    { tags: ["schedules"] }
);
