"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export function ModeToggle({
  className,
  testId,
  style,
}: {
  className?: string
  testId?: string
  style?: React.CSSProperties
}) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        data-testid={testId}
        className={cn("relative flex h-9 w-9 items-center justify-center p-2", className)}
        style={style}
      >
        <div className="w-5 h-5 rounded-full" style={{ backgroundColor: "var(--border)" }} />
      </div>
    )
  }

  return (
    <button
      data-testid={testId}
      className={cn("relative inline-flex items-center justify-center p-2 rounded-full transition-colors", className)}
      style={{ color: "var(--foreground)", backgroundColor: "transparent", ...style }}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="테마 변경"
    >
      <span className="relative block h-5 w-5">
        <Sun className="absolute inset-0 m-auto h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute inset-0 m-auto h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
