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
        className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors flex items-center justify-center text-sm"
        title="상세 정보 보기"
      >
        <Info className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 text-sm">
          <div className="flex justify-between items-start mb-3">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">식단 상세 정보</h4>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
          </div>
          
          {calorie && (
              <div className="mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">열량</span>
                  <span className="text-slate-800 dark:text-slate-200 font-mono">{calorie}</span>
              </div>
          )}

          {hasAllergyInfo && (
              <div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-2">알레르기 유발 식품</span>
                  <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                      {foodAllergies.map((foodDetail, index) => {
                          if (foodDetail.allergies.length === 0) return null;
                          return (
                              <li key={index}>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">{foodDetail.food}: </span>
                                  <span className="text-rose-500 text-xs font-medium">{foodDetail.allergies.join(", ")}</span>
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
