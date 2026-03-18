import { Home, Utensils, Music, Clock, Calendar, User, Menu, Calculator, Megaphone, Link as LinkIcon, Radio, Bell, AlertCircle, Building2 } from "lucide-react";

// Primary items for mobile bottom navigation (most frequently used)
export const primaryNavItems = [
  { name: "홈", href: "/", icon: Home },
  { name: "급식", href: "/meals", icon: Utensils },
  { name: "기상곡", href: "/songs", icon: Music },
];

// All navigation items for desktop sidebar and mobile menu
export const allNavItems = [
  { name: "홈", href: "/", icon: Home },
  { name: "공지사항", href: "/notices", icon: Megaphone },
  { name: "급식", href: "/meals", icon: Utensils },
  { name: "기상곡", href: "/songs", icon: Music },
  { name: "시간표", href: "/timetable", icon: Clock },
  { name: "학사일정", href: "/calendar", icon: Calendar },
  { name: "바로가기", href: "/links", icon: LinkIcon },
  { name: "교내 사이트", href: "/sites", icon: Building2 },
  { name: "도구", href: "/utils", icon: Calculator },
  { name: "내 정보", href: "/me", icon: User },
];

// Keep for backward compatibility
export const mainNavItems = allNavItems;

// Bottom nav now uses primary + menu button
export const bottomNavItems = primaryNavItems;
