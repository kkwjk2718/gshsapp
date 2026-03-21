"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  anonymousUserSummary,
  type UserSummaryPayload,
} from "@/lib/user-state";

type UserSummaryContextValue = {
  summary: UserSummaryPayload;
  isLoaded: boolean;
};

const UserSummaryContext = createContext<UserSummaryContextValue | null>(null);

export function UserSummaryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [summary, setSummary] = useState<UserSummaryPayload>(anonymousUserSummary);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchSummary = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/me/summary", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load user summary: ${response.status}`);
      }

      const nextSummary = (await response.json()) as UserSummaryPayload;
      setSummary(nextSummary);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // Keep the previous summary to avoid flashing back to anonymous on transient failures.
      }
    } finally {
      setIsLoaded(true);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetchSummary(controller.signal);
    return () => controller.abort();
  }, [pathname, fetchSummary]);

  useEffect(() => {
    const refresh = () => {
      void fetchSummary();
    };

    window.addEventListener("notification-update", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("notification-update", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchSummary]);

  useEffect(() => {
    if (!summary.authenticated) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchSummary();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [summary.authenticated, fetchSummary]);

  return (
    <UserSummaryContext.Provider
      value={{
        summary,
        isLoaded,
      }}
    >
      {children}
    </UserSummaryContext.Provider>
  );
}

export function useUserSummary() {
  const context = useContext(UserSummaryContext);

  if (!context) {
    throw new Error("useUserSummary must be used within UserSummaryProvider.");
  }

  return context;
}
