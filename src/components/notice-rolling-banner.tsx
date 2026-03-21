"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";

interface Notice {
  id: string;
  title: string;
  content: string;
}

export function NoticeRollingBanner({ notices }: { notices: Notice[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (notices.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % notices.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [notices.length]);

  if (notices.length === 0) {
    return (
      <div className="flex h-full min-h-[152px] flex-col justify-between rounded-[1.35rem] border p-4">
        <div className="space-y-2">
          <div className="section-kicker">Notice Stream</div>
          <div className="flex items-center gap-2 text-base font-semibold" style={{ color: "var(--foreground)" }}>
            <Megaphone className="h-4 w-4" style={{ color: "var(--accent)" }} />
            공지사항
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            아직 등록된 공지사항이 없습니다.
          </p>
        </div>
        <Link href="/notices" className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "var(--accent)" }}>
          전체 공지 보러가기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-[180px] flex-col justify-between rounded-[1.45rem] border p-4 md:p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--surface-2) 74%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="section-kicker">Live Notices</div>
          <div className="flex items-center gap-2 text-base font-semibold" style={{ color: "var(--foreground)" }}>
            <Megaphone className="h-4 w-4" style={{ color: "var(--accent)" }} />
            공지사항
          </div>
        </div>
        <Link href="/notices" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          전체보기
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative mt-4 min-h-[88px] flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={notices[index].id}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <Link
              href={`/notices/${notices[index].id}`}
              className="block rounded-[1.15rem] border p-4 transition-colors hover:bg-[color:var(--surface)]"
              style={{ borderColor: "color-mix(in srgb, var(--border) 64%, transparent)" }}
            >
              <div className="line-clamp-1 text-[1rem] font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
                {notices[index].title}
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {notices[index].content}
              </p>
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {notices.length > 1 ? (
        <div className="mt-4 flex items-center gap-1.5">
          {notices.map((notice, indicatorIndex) => (
            <div
              key={notice.id}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: indicatorIndex === index ? "1.4rem" : "0.45rem",
                backgroundColor: indicatorIndex === index ? "var(--accent)" : "color-mix(in srgb, var(--border) 78%, transparent)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
