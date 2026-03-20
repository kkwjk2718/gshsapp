import type { NoticeCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

export type NoticeCategoryRecord = Pick<NoticeCategory, "id" | "label" | "value">;

type NoticeCategoryStore = {
  noticeCategory: {
    findMany: (args?: { orderBy?: { label: "asc" | "desc" } }) => Promise<NoticeCategoryRecord[]>;
    upsert: (args: {
      where: { value: string };
      update: { label: string };
      create: { label: string; value: string };
    }) => Promise<NoticeCategoryRecord>;
  };
};

export const DEFAULT_NOTICE_CATEGORY_VALUE = "GENERAL";
export const DEFAULT_NOTICE_CATEGORIES = [
  { label: "일반", value: "GENERAL" },
  { label: "학사", value: "ACADEMIC" },
  { label: "행사", value: "EVENT" },
  { label: "방송", value: "BROADCAST" },
] as const;

function getFallbackCategoryValue(categories: NoticeCategoryRecord[]) {
  return (
    categories.find((category) => category.value === DEFAULT_NOTICE_CATEGORY_VALUE)?.value ||
    categories[0]?.value ||
    DEFAULT_NOTICE_CATEGORY_VALUE
  );
}

export function coerceNoticeCategoryValue(
  categories: NoticeCategoryRecord[],
  input: FormDataEntryValue | null | undefined,
) {
  const normalizedValue = typeof input === "string" ? input.trim().toUpperCase() : "";

  if (!normalizedValue) {
    return getFallbackCategoryValue(categories);
  }

  const matchingCategory = categories.find((category) => category.value === normalizedValue);
  return matchingCategory?.value || getFallbackCategoryValue(categories);
}

export async function loadNoticeCategories(store: NoticeCategoryStore = prisma) {
  const existingCategories = await store.noticeCategory.findMany({
    orderBy: { label: "asc" },
  });

  if (existingCategories.length > 0) {
    return existingCategories;
  }

  await Promise.all(
    DEFAULT_NOTICE_CATEGORIES.map((category) =>
      store.noticeCategory.upsert({
        where: { value: category.value },
        update: { label: category.label },
        create: { label: category.label, value: category.value },
      }),
    ),
  );

  return store.noticeCategory.findMany({
    orderBy: { label: "asc" },
  });
}

export async function resolveNoticeCategoryValue(
  input: FormDataEntryValue | null | undefined,
  store: NoticeCategoryStore = prisma,
) {
  const categories = await loadNoticeCategories(store);
  return coerceNoticeCategoryValue(categories, input);
}
