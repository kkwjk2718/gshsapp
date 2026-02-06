"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { logPageView } from "@/lib/actions";
import { pageview } from "@/lib/ga";

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    logPageView(pathname);
    pageview(pathname);
  }, [pathname]);

  return null;
}
