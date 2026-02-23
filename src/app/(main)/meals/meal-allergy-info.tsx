"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

interface FoodAllergyDetail {
  food: string;
  allergies: string[];
}

interface MealAllergyInfoProps {
  foodAllergies: FoodAllergyDetail[]; 
  calorie?: string;
}

export function MealAllergyInfo({ foodAllergies, calorie }: MealAllergyInfoProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasAllergyInfo = foodAllergies.some(item => item.allergies.length > 0);

  if (!hasAllergyInfo && !calorie) {
    return null; 
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-full transition-colors flex items-center justify-center text-sm"
        style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)", border: "1px solid var(--border)" }}
        title="상세 정보 보기"
      >
        <Info className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 p-4 rounded-xl shadow-xl border z-50 text-sm"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}>
          <div className="flex justify-between items-start mb-3">
              <h4 className="font-bold" style={{ color: "var(--foreground)" }}>식단 상세 정보</h4>
              <button 
                onClick={() => setIsOpen(false)} 
                className=""
                style={{ color: "var(--muted)" }}
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
          </div>
          
          {calorie && (
              <div className="mb-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs font-bold block mb-1" style={{ color: "var(--muted)" }}>열량</span>
                  <span className="font-mono" style={{ color: "var(--foreground)" }}>{calorie}</span>
              </div>
          )}

          {hasAllergyInfo && (
              <div>
                  <span className="text-xs font-bold block mb-2" style={{ color: "var(--muted)" }}>알레르기 유발 식품</span>
                  <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                      {foodAllergies.map((foodDetail, index) => {
                          if (foodDetail.allergies.length === 0) return null;
                          return (
                              <li key={index}>
                                  <span className="font-medium" style={{ color: "var(--foreground)" }}>{foodDetail.food}: </span>
                                  <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{foodDetail.allergies.join(", ")}</span>
                              </li>
                          );
                      })}
                  </ul>
              </div>
          )}
        </div>
      )}
    </div>
  );
}
