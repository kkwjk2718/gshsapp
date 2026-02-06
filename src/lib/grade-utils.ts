import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

// Cached function to get mapping
const getGradeMapping = unstable_cache(
  async () => {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "GRADE_MAPPING" },
    });

    let mapping = { "1": 42, "2": 41, "3": 40 }; // Default fallback
    if (setting) {
      try {
        mapping = JSON.parse(setting.value);
      } catch (e) {
        console.error("Failed to parse GRADE_MAPPING", e);
      }
    }
    return mapping;
  },
  ["grade-mapping-key"], // Key parts
  { tags: ["grade-mapping"] } // Revalidation tags
);

export async function getUserGrade(userGisu: number | null): Promise<string | null> {
  if (!userGisu) return null;

  const mapping = await getGradeMapping();

  // Reverse lookup: Find grade for the given gisu
  for (const [grade, gisu] of Object.entries(mapping)) {
      if (gisu === userGisu) {
          return grade;
      }
  }

  return null; // Not in 1~3 grade (Graduate or others)
}