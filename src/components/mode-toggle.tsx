"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export function ModeToggle({ className }: { className?: string }) {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={cn("relative p-2 w-9 h-9", className)}>
        <div className="w-5 h-5 bg-slate-200 dark:bg-slate-800 rounded-full" />
      </div>
    )
  }

  return (
    <button
      className={cn("relative p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="테마 변경"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 top-2 left-2" />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}