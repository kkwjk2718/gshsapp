"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { updateSongRulesBulk } from "./actions";

interface RuleItem {
  day: string;
  dayOfWeek: number;
  allowedGrade: string;
}

interface RuleSettingsFormProps {
  initialRules: RuleItem[];
}

const GRADE_OPTIONS = ["1", "2", "3"] as const;

function parseAllowedGrades(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ALL") {
    return [...GRADE_OPTIONS];
  }
  if (!normalized) {
    return [];
  }

  const selected = normalized
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is (typeof GRADE_OPTIONS)[number] =>
      GRADE_OPTIONS.includes(item as (typeof GRADE_OPTIONS)[number])
    );

  return selected;
}

function serializeAllowedGrades(grades: string[]) {
  const unique = GRADE_OPTIONS.filter((grade) => grades.includes(grade));
  if (unique.length === GRADE_OPTIONS.length) return "ALL";
  return unique.join(",");
}

function normalizeAllowedGrade(value: string) {
  return serializeAllowedGrades(parseAllowedGrades(value));
}

function areSameRules(current: RuleItem[], saved: RuleItem[]) {
  return current.every((rule, index) => {
    const target = saved[index];
    return (
      rule.dayOfWeek === target.dayOfWeek &&
      normalizeAllowedGrade(rule.allowedGrade) === normalizeAllowedGrade(target.allowedGrade)
    );
  });
}

export function RuleSettingsForm({ initialRules }: RuleSettingsFormProps) {
  const [rules, setRules] = useState(initialRules);
  const [savedRules, setSavedRules] = useState(initialRules);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = !areSameRules(rules, savedRules);

  const handleToggleGrade = (dayOfWeek: number, grade: string) => {
    setNotice(null);
    setRules((current) =>
      current.map((rule) => {
        if (rule.dayOfWeek !== dayOfWeek) return rule;

        const selected = parseAllowedGrades(rule.allowedGrade);
        const nextSelected = selected.includes(grade)
          ? selected.filter((item) => item !== grade)
          : [...selected, grade];

        return {
          ...rule,
          allowedGrade: serializeAllowedGrades(nextSelected),
        };
      })
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty || isPending) return;

    const normalizedRules = rules.map((rule) => ({
      ...rule,
      allowedGrade: normalizeAllowedGrade(rule.allowedGrade),
    }));

    setNotice(null);
    startTransition(async () => {
      try {
        await updateSongRulesBulk(
          normalizedRules.map(({ dayOfWeek, allowedGrade }) => ({
            dayOfWeek,
            allowedGrade,
          }))
        );
        setRules(normalizedRules);
        setSavedRules(normalizedRules);
        setNotice({ type: "success", message: "요일별 규칙을 저장했습니다." });
      } catch (error) {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="glass p-6 rounded-3xl space-y-4">
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        각 요일에 신청 가능한 학년을 버튼으로 선택합니다. 여러 학년을 동시에 선택할 수 있고, 모두 해제하면 해당 요일은 신청 불가입니다.
      </p>

      {rules.map((rule) => {
        const selectedGrades = parseAllowedGrades(rule.allowedGrade);

        return (
          <div key={rule.dayOfWeek} className="flex items-center gap-2">
            <div className="w-8 font-bold" style={{ color: "var(--foreground)" }}>
              {rule.day}
            </div>

            <div
              className="flex-1 grid grid-cols-3 overflow-hidden rounded-full border"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              {GRADE_OPTIONS.map((grade, index) => {
                const isSelected = selectedGrades.includes(grade);

                return (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => handleToggleGrade(rule.dayOfWeek, grade)}
                    className={`py-2 text-sm font-medium transition-colors ${index > 0 ? "border-l" : ""}`}
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: isSelected ? "var(--accent)" : "transparent",
                      color: isSelected ? "var(--brand-sub)" : "var(--foreground)",
                    }}
                  >
                    {grade}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {notice && (
        <div
          className="text-sm rounded-xl px-3 py-2"
          style={{
            backgroundColor: notice.type === "success" ? "var(--surface-2)" : "rgba(248, 113, 113, 0.12)",
            color: notice.type === "success" ? "var(--accent)" : "#f87171",
          }}
        >
          {notice.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!isDirty || isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed"
        style={{
          backgroundColor: !isDirty || isPending ? "var(--border)" : "var(--accent)",
          color: !isDirty || isPending ? "var(--muted)" : "var(--brand-sub)",
          opacity: !isDirty || isPending ? 0.7 : 1,
        }}
      >
        <Save className="w-4 h-4" />
        <span>{isPending ? "저장 중..." : isDirty ? "변경사항 저장" : "변경사항 없음"}</span>
      </button>
    </form>
  );
}
