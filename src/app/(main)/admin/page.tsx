import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Building2,
  Music,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Tag,
  Ticket,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";

function StatCard({
  title,
  value,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  href: string;
}) {
  return (
    <Link href={href} className="glass-card glass-card-hover p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="section-kicker">{title}</div>
          <div className="mt-3 text-[2rem] font-semibold tracking-[-0.06em]" style={{ color: "var(--foreground)" }}>
            {value}
          </div>
        </div>
        <div className="icon-badge">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

export default async function AdminDashboard() {
  const [pendingSongsCount, usersCount, noticesCount, tokensCount] = await Promise.all([
    prisma.songRequest.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.notice.count(),
    prisma.inviteToken.count({ where: { isUsed: false } }),
  ]);

  const quickActions = [
    { href: "/admin/notices/new", title: "공지 작성", copy: "중요 공지를 빠르게 등록합니다.", icon: Bell },
    { href: "/admin/notifications", title: "알림 발송", copy: "전체 사용자에게 즉시 안내를 보냅니다.", icon: Send },
    { href: "/admin/tokens", title: "초대 토큰", copy: "새 사용자 초대 토큰을 발급합니다.", icon: Ticket },
    { href: "/admin/categories", title: "카테고리 관리", copy: "공지 카테고리를 정리합니다.", icon: Tag },
    { href: "/admin/settings", title: "서비스 설정", copy: "백업과 환경 설정을 관리합니다.", icon: Settings },
    { href: "/admin/logs", title: "로그 확인", copy: "서비스 로그와 기록을 확인합니다.", icon: ScrollText },
    { href: "/admin/reports", title: "오류 신고 관리", copy: "들어온 문제 제보를 검토합니다.", icon: ShieldCheck },
    { href: "/admin/test", title: "시스템 진단", copy: "운영 준비 상태를 점검합니다.", icon: Activity },
    { href: "/admin/sites", title: "교내 사이트 관리", copy: "관련 링크 목록을 최신 상태로 유지합니다.", icon: Building2 },
  ];

  return (
    <div className="page-shell admin-theme">
      <div className="page-shell-narrow space-y-4 md:space-y-5">
        <section className="glass-strong px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="info-chip">대기 중 기상곡 {pendingSongsCount}건</span>
                <span className="info-chip">운영 사용자 {usersCount}명</span>
              </div>

              <div>
                <div className="section-kicker">Admin Console</div>
                <h1 className="section-title mt-1">관리자 대시보드</h1>
                <p className="section-copy mt-3 max-w-2xl">
                  운영 상태, 사용자, 공지, 토큰, 진단 기능을 한 화면에서 빠르게 관리할 수 있도록 밀도 있게 정리했습니다.
                </p>
              </div>
            </div>

            <div className="glass-muted px-4 py-4 text-sm" style={{ color: "var(--muted)" }}>
              빠른 작업을 바로 실행하고, 주요 운영 지표를 상단에서 즉시 파악할 수 있습니다.
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="기상곡 대기" value={pendingSongsCount} icon={Music} href="/admin/songs" />
          <StatCard title="전체 사용자" value={usersCount} icon={Users} href="/admin/users" />
          <StatCard title="공지 수" value={noticesCount} icon={Bell} href="/admin/notices" />
          <StatCard title="사용 가능 토큰" value={tokensCount} icon={Ticket} href="/admin/tokens" />
        </section>

        <section className="glass-card p-5 md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="section-kicker">Quick Actions</div>
              <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                자주 쓰는 관리 작업
              </h2>
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              새 공지 작성, 알림 발송, 시스템 진단까지 바로 이동할 수 있습니다.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} className="glass-card glass-card-hover flex items-start gap-3 p-4">
                <div className="icon-badge shrink-0">
                  <action.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {action.title}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    {action.copy}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
