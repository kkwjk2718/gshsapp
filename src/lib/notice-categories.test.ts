import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTICE_CATEGORIES,
  DEFAULT_NOTICE_CATEGORY_VALUE,
  coerceNoticeCategoryValue,
  loadNoticeCategories,
  resolveNoticeCategoryValue,
  type NoticeCategoryRecord,
} from "@/lib/notice-categories";

function createNoticeCategoryStore(initialCategories: NoticeCategoryRecord[] = []) {
  const categories = [...initialCategories];
  let nextId = categories.length + 1;

  return {
    noticeCategory: {
      async findMany() {
        return [...categories].sort((left, right) => left.label.localeCompare(right.label, "ko"));
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: { value: string };
        update: { label: string };
        create: { label: string; value: string };
      }) {
        const existingCategory = categories.find((category) => category.value === where.value);

        if (existingCategory) {
          existingCategory.label = update.label;
          return existingCategory;
        }

        const createdCategory = {
          id: `category-${nextId++}`,
          label: create.label,
          value: create.value,
        };

        categories.push(createdCategory);
        return createdCategory;
      },
    },
  };
}

describe("notice-categories", () => {
  describe("loadNoticeCategories", () => {
    it("seeds the default categories when the table is empty", async () => {
      const store = createNoticeCategoryStore();

      const categories = await loadNoticeCategories(store);

      expect(categories.map((category) => category.value)).toEqual(
        DEFAULT_NOTICE_CATEGORIES.map((category) => category.value),
      );
      expect(categories.map((category) => category.label)).toEqual(["일반", "학사", "행사", "방송"]);
    });

    it("hides the removed OTHER category from the visible list", async () => {
      const store = createNoticeCategoryStore([
        { id: "1", label: "기타", value: "OTHER" },
        { id: "2", label: "학사", value: "ACADEMIC" },
      ]);

      const categories = await loadNoticeCategories(store);

      expect(categories.map((category) => category.value)).toEqual(["GENERAL", "ACADEMIC", "EVENT", "BROADCAST"]);
    });

    it("adds any missing default categories without removing custom ones", async () => {
      const store = createNoticeCategoryStore([
        { id: "1", label: "기숙사", value: "DORM" },
        { id: "2", label: "학사", value: "ACADEMIC" },
      ]);

      const categories = await loadNoticeCategories(store);

      expect(categories.map((category) => category.value)).toEqual(
        ["GENERAL", "ACADEMIC", "EVENT", "BROADCAST", "DORM"],
      );
    });
  });

  describe("coerceNoticeCategoryValue", () => {
    const categories: NoticeCategoryRecord[] = [
      { id: "1", label: "일반", value: "GENERAL" },
      { id: "2", label: "학사", value: "ACADEMIC" },
    ];

    it("accepts a matching category value", () => {
      expect(coerceNoticeCategoryValue(categories, "academic")).toBe("ACADEMIC");
    });

    it("falls back to the default category when the input is blank", () => {
      expect(coerceNoticeCategoryValue(categories, "   ")).toBe(DEFAULT_NOTICE_CATEGORY_VALUE);
    });

    it("falls back to the default category when the input is unknown", () => {
      expect(coerceNoticeCategoryValue(categories, "unknown")).toBe(DEFAULT_NOTICE_CATEGORY_VALUE);
    });

    it("falls back to the first available category when GENERAL does not exist", () => {
      expect(
        coerceNoticeCategoryValue([{ id: "3", label: "기숙사", value: "DORM" }], ""),
      ).toBe("DORM");
    });
  });

  describe("resolveNoticeCategoryValue", () => {
    it("preserves a legacy OTHER value when an older notice is edited", async () => {
      const store = createNoticeCategoryStore([
        { id: "1", label: "기타", value: "OTHER" },
        { id: "2", label: "일반", value: "GENERAL" },
      ]);

      await expect(resolveNoticeCategoryValue("OTHER", store)).resolves.toBe("OTHER");
    });
  });
});
