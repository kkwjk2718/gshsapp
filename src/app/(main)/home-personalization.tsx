"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Calendar, Clock, LogIn } from "lucide-react";
import { useUserSummary } from "@/components/user-summary-provider";
import {
  anonymousHomePersonalization,
  type HomeDdayPayload,
  type HomePersonalizationPayload,
} from "@/lib/user-state";

type HomePersonalizationContextValue = {
  data: HomePersonalizationPayload;
  isLoaded: boolean;
};

const HomePersonalizationContext = createContext<HomePersonalizationContextValue | null>(null);

function TimetableSkeleton() {
  return (
    <div className="flex-1 grid grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-[74px] animate-pulse rounded-[1.15rem] border p-2"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 70%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--surface-2) 88%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

function WelcomeSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-between gap-4 p-6">
      <div className="w-full space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-[color:var(--surface-3)]" />
        <div className="h-4 w-52 animate-pulse rounded bg-[color:var(--surface-2)]" />
      </div>
      <div className="h-12 w-12 animate-pulse rounded-[1rem] bg-[color:var(--surface-3)]" />
    </div>
  );
}

export function HomePersonalizationProvider({ children }: { children: ReactNode }) {
  const { summary, isLoaded: isSummaryLoaded } = useUserSummary();
  const [data, setData] = useState<HomePersonalizationPayload>(anonymousHomePersonalization);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchPersonalization = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/me/home", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load home personalization: ${response.status}`);
      }

      const nextData = (await response.json()) as HomePersonalizationPayload;
      setData(nextData);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // Keep the previous state on transient failures.
      }
    } finally {
      setIsLoaded(true);
    }
  });

  useEffect(() => {
    if (!isSummaryLoaded) {
      return;
    }

    if (!summary.authenticated) {
      setData(anonymousHomePersonalization);
      setIsLoaded(true);
      return;
    }

    const controller = new AbortController();
    void fetchPersonalization(controller.signal);

    return () => controller.abort();
  }, [summary.authenticated, isSummaryLoaded, fetchPersonalization]);

  return (
    <HomePersonalizationContext.Provider value={{ data, isLoaded }}>
      {children}
    </HomePersonalizationContext.Provider>
  );
}

function useHomePersonalization() {
  const context = useContext(HomePersonalizationContext);

  if (!context) {
    throw new Error("useHomePersonalization must be used within HomePersonalizationProvider.");
  }

  return context;
}

export function HomeHeaderMeta() {
  const { summary, isLoaded: isSummaryLoaded } = useUserSummary();
  const { data, isLoaded } = useHomePersonalization();

  if (!isSummaryLoaded || !summary.authenticated || !isLoaded || !data.grade || !data.classNum) {
    return null;
  }

  return (
    <>
      <span className="h-3 w-px bg-[color:var(--border)]" />
      <span>{`${data.grade}\ud559\ub144 ${data.classNum}\ubc18`}</span>
    </>
  );
}

export function HomeWelcomeCard({ publicDDay }: { publicDDay: HomeDdayPayload | null }) {
  const { summary, isLoaded: isSummaryLoaded } = useUserSummary();
  const { data, isLoaded } = useHomePersonalization();

  if (isSummaryLoaded && summary.authenticated && !isLoaded) {
    return <WelcomeSkeleton />;
  }

  if (!isSummaryLoaded || !summary.authenticated) {
    return (
      <div
        data-testid="home-welcome-anonymous"
        className="relative z-10 flex w-full flex-col items-start py-2 text-left"
      >
        <div className="section-kicker">Guest Mode</div>
        <h2 className="mb-2 mt-2 text-[1.35rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
          {"\ub85c\uadf8\uc778\uc774 \ud544\uc694\ud569\ub2c8\ub2e4"}
        </h2>
        <p className="mb-4 max-w-xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {"\ub85c\uadf8\uc778\ud558\uba74 \uac1c\uc778 \uc2dc\uac04\ud45c\uc640 \ub9de\ucda4 \uc815\ubcf4\uac00 \ud45c\uc2dc\ub429\ub2c8\ub2e4."}
        </p>
        {publicDDay ? (
          <p className="mb-5 rounded-full border px-3 py-1.5 text-xs" style={{ color: "var(--muted)", borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", backgroundColor: "color-mix(in srgb, var(--surface-2) 84%, transparent)" }}>
            <span className="font-bold" style={{ color: "var(--accent)" }}>{publicDDay.title}</span>
            {publicDDay.prefix}{" "}
            <span className="font-bold" style={{ color: "var(--foreground)" }}>{publicDDay.count}</span>{" "}
            {publicDDay.text}
          </p>
        ) : null}
        <Link href="/login" className="btn-primary px-6 py-2 text-sm">
          <LogIn className="h-4 w-4" />
          {"\ub85c\uadf8\uc778\ud558\ub7ec \uac00\uae30"}
        </Link>
      </div>
    );
  }

  const dday = data.personalDDay ?? publicDDay;

  return (
    <div
      data-testid="home-welcome-authenticated"
      className="relative z-10 flex w-full items-center justify-between gap-4"
    >
      <div>
        <div className="section-kicker">Student Hub</div>
        <h2 className="mb-2 mt-2 text-[1.55rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
          {`\uc548\ub155\ud558\uc138\uc694 ${data.name ?? ""}\ub2d8`}
        </h2>
        {dday ? (
          <p className="max-w-xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            <span className="font-bold" style={{ color: "var(--accent)" }}>{dday.title}</span>
            {dday.prefix}{" "}
            <span className="font-bold" style={{ color: "var(--foreground)" }}>{dday.count}</span>{" "}
            {dday.text}
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {"\uc624\ub298\uc740 \uac1c\uc778 \uc77c\uc815\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."}
          </p>
        )}
      </div>
      <Link
        href="/calendar"
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-[1rem] border"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface-2) 88%, transparent)",
          color: "var(--accent-2)",
          borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border) 78%)",
        }}
      >
        <Calendar className="h-6 w-6" />
      </Link>
    </div>
  );
}

export function HomeTimetableCard() {
  const { summary, isLoaded: isSummaryLoaded } = useUserSummary();
  const { data, isLoaded } = useHomePersonalization();

  if (isSummaryLoaded && summary.authenticated && !isLoaded) {
    return <TimetableSkeleton />;
  }

  if (!isSummaryLoaded || !summary.authenticated) {
    return (
      <div
        data-testid="home-timetable-anonymous"
        className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[1.25rem] border"
        style={{
          borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)",
          color: "var(--muted)",
        }}
      >
        <Clock className="h-8 w-8 opacity-20" />
        <span className="text-xs">{"\ub85c\uadf8\uc778 \ud6c4 \uc2dc\uac04\ud45c\ub97c \ud655\uc778\ud558\uc138\uc694"}</span>
      </div>
    );
  }

  return (
    <Link
      href="/timetable"
      data-testid="home-timetable-authenticated"
      className="flex-1 grid grid-cols-3 gap-3"
    >
      {data.todayTimetable.length > 0 ? data.todayTimetable.slice(0, 6).map((item, index) => (
        <div
          key={`${item.period}-${index}`}
          className="flex flex-col items-center justify-center rounded-[1.15rem] border p-2 transition-all hover:-translate-y-0.5"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--surface-2) 86%, transparent)",
          }}
        >
          <div className="mb-1 text-[10px] font-bold" style={{ color: "var(--muted)" }}>
            {`${item.period}\uad50\uc2dc`}
          </div>
          <div className="line-clamp-1 break-all px-1 text-center text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            {item.content}
          </div>
        </div>
      )) : (
        <div className="col-span-full flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
          {"\uc218\uc5c5 \uc815\ubcf4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4."}
        </div>
      )}
    </Link>
  );
}
