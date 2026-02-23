"use client"

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const options = [
    { value: "light", label: "라이트", icon: Sun },
    { value: "dark", label: "다크", icon: Moon },
  ];

  return (
    <div className="flex p-1 bg-[#faf0ca] dark:bg-[#0d3b66] rounded-xl border border-[#0d3b66]/20 dark:border-[#f4d35e]/25">
      {options.map((option) => {
        const isActive = theme === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-[#0d3b66] dark:bg-[#f4d35e] text-[#faf0ca] dark:text-[#0d3b66] shadow-sm"
                : "text-[#0d3b66]/70 dark:text-[#faf0ca]/75 hover:text-[#0d3b66] dark:hover:text-[#faf0ca]"
            )}
          >
            <option.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
