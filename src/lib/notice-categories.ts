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

const HIDDEN_NOTICE_CATEGORY_VALUES = new Set(["OTHER"]);
const DEFAULT_NOTICE_CATEGORY_ORDER = new Map(
  DEFAULT_NOTICE_CATEGORIES.map((category, index) => [category.value, index]),
);

function sortNoticeCategories(categories: NoticeCategoryRecord[]) {
  return [...categories].sort((left, right) => {
    const leftOrder = DEFAULT_NOTICE_CATEGORY_ORDER.get(left.value);
    const rightOrder = DEFAULT_NOTICE_CATEGORY_ORDER.get(right.value);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== undefined) {
      return -1;
    }

    if (rightOrder !== undefined) {
      return 1;
    }

    return left.label.localeCompare(right.label, "ko");
  });
}

function getFallbackCategoryValue(categories: NoticeCategoryRecord[]) {
  return (
    categories.find((category) => category.value === DEFAULT_NOTICE_CATEGORY_VALUE)?.value ||
    categories[0]?.value ||
    DEFAULT_NOTICE_CATEGORY_VALUE
  );
}

async function ensureDefaultNoticeCategories(store: NoticeCategoryStore) {
  const existingCategories = await store.noticeCategory.findMany({
    orderBy: { label: "asc" },
  });
  const existingValues = new Set(existingCategories.map((category) => category.value));
  const missingDefaultCategories = DEFAULT_NOTICE_CATEGORIES.filter((category) => !existingValues.has(category.value));

  if (missingDefaultCategories.length === 0) {
    return;
  }

  await Promise.all(
    missingDefaultCategories.map((category) =>
      store.noticeCategory.upsert({
        where: { value: category.value },
        update: { label: category.label },
        create: { label: category.label, value: category.value },
      }),
    ),
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
  await ensureDefaultNoticeCategories(store);

  const categories = await store.noticeCategory.findMany({
    orderBy: { label: "asc" },
  });

  return sortNoticeCategories(
    categories.filter((category) => !HIDDEN_NOTICE_CATEGORY_VALUES.has(category.value)),
  );
}

export async function resolveNoticeCategoryValue(
  input: FormDataEntryValue | null | undefined,
  store: NoticeCategoryStore = prisma,
) {
  await ensureDefaultNoticeCategories(store);

  const categories = await store.noticeCategory.findMany({
    orderBy: { label: "asc" },
  });

  return coerceNoticeCategoryValue(categories, input);
}
