import {
  Building2,
  Calculator,
  Calendar,
  Clock,
  Home,
  Link as LinkIcon,
  Megaphone,
  Music,
  User,
  Utensils,
} from "lucide-react";
import { shouldHideRestrictedNav } from "@/lib/user-roles";

export const primaryNavItems = [
  { name: "홈", href: "/", icon: Home },
  { name: "급식", href: "/meals", icon: Utensils },
  { name: "기상곡", href: "/songs", icon: Music },
];

export const allNavItems = [
  { name: "홈", href: "/", icon: Home },
  { name: "공지사항", href: "/notices", icon: Megaphone },
  { name: "급식", href: "/meals", icon: Utensils },
  { name: "기상곡", href: "/songs", icon: Music },
  { name: "시간표", href: "/timetable", icon: Clock },
  { name: "학사일정", href: "/calendar", icon: Calendar },
  { name: "링크모음", href: "/links", icon: LinkIcon },
  { name: "교내 사이트", href: "/sites", icon: Building2 },
  { name: "도구", href: "/utils", icon: Calculator },
  { name: "내 정보", href: "/me", icon: User },
];

export const desktopNavItems = allNavItems.filter((item) => item.href !== "/me");
export const mainNavItems = desktopNavItems;
export const bottomNavItems = primaryNavItems;

const graduateRestrictedHrefs = new Set(["/songs", "/timetable", "/links", "/sites"]);

export function getVisibleNavItems(role?: string | null) {
  if (!shouldHideRestrictedNav(role)) {
    return mainNavItems;
  }

  return mainNavItems.filter((item) => !graduateRestrictedHrefs.has(item.href));
}

export function getVisibleMobileNavItems(role?: string | null) {
  if (!shouldHideRestrictedNav(role)) {
    return allNavItems;
  }

  return allNavItems.filter((item) => !graduateRestrictedHrefs.has(item.href));
}
