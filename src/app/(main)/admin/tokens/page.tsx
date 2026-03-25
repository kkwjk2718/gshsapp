import { prisma } from "@/lib/db";
import { createTokens } from "./actions";
import { ChevronRight, FileText, MailPlus, Send, Users } from "lucide-react";
import Link from "next/link";
import { ManualSendForm } from "./manual-send-form";
import { getDistributionQuotaSummary } from "@/lib/token-distribution";
import { TOKEN_DISTRIBUTION_DAILY_LIMIT } from "@/lib/token-portal-config";
import { formatKST } from "@/lib/date-utils";

const ROLE_LABELS: Record<string, string> = {
  STUDENT: "학생",
  TEACHER: "교사",
  ADMIN: "관리자",
  BROADCAST: "방송부",
};

const SOURCE_LABELS: Record<string, string> = {
  PORTAL_AUTO: "공개 포털",
  ADMIN_MANUAL: "관리자 수동",
};

const STATUS_LABELS: Record<string, string> = {
  SENT: "발송 성공",
  FAILED: "발송 실패",
  BLOCKED: "발송 차단",
};

export default async function TokenManagerPage() {
  const [batches, recentLogs, quota] = await Promise.all([
    prisma.tokenBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { tokens: true },
        },
      },
    }),
    prisma.tokenDistributionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        inviteToken: {
          select: {
            token: true,
          },
        },
      },
    }),
    getDistributionQuotaSummary(),
  ]);

  return (
    <div className="space-y-8 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">초대 토큰 관리</h1>
        <p className="text-sm text-slate-500">
          기존 배치 발급과 개별 메일 발송을 함께 관리할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-1">
          <div className="glass h-fit rounded-3xl p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5" />
              토큰 일괄 발급
            </h2>
            <form action={createTokens} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">발급명(제목)</label>
                <input
                  name="title"
                  placeholder="예: 2026 신입생 학생 토큰"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">메모</label>
                <input
                  name="memo"
                  placeholder="상세 설명"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">권한</label>
                  <select
                    name="targetRole"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="STUDENT">학생</option>
                    <option value="TEACHER">교사</option>
                    <option value="BROADCAST">방송부</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">기수 (학생용)</label>
                  <input
                    name="targetGisu"
                    type="number"
                    placeholder="예: 42"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">발급 개수</label>
                <input
                  name="count"
                  type="number"
                  defaultValue={10}
                  min={1}
                  max={100}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <button className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white transition hover:bg-indigo-700">
                배치 토큰 발급
              </button>
            </form>
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="mb-4 space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <MailPlus className="h-5 w-5" />
                개별 메일 발송
              </h2>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
                오늘 발송량 <span className="font-semibold">{quota.used} / {TOKEN_DISTRIBUTION_DAILY_LIMIT}</span>
                <span className="mx-2 text-slate-300">|</span>
                남은 발송량 <span className="font-semibold">{quota.remaining}건</span>
              </div>
            </div>

            <ManualSendForm />
          </div>
        </div>

        <div className="glass overflow-hidden rounded-3xl lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
            <h2 className="text-lg font-bold">배치 발급 이력</h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {batches.map((batch) => (
              <Link
                key={batch.id}
                href={`/admin/tokens/${batch.id}`}
                className="group flex items-center justify-between p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-900/30">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-1 text-lg font-bold">{batch.title}</div>
                    <div className="line-clamp-1 text-sm text-slate-500">{batch.memo || "메모 없음"}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      <span>{formatKST(batch.createdAt, "yyyy.MM.dd HH:mm")}</span>
                      <span>&middot;</span>
                      <span>{batch._count.tokens}개 토큰</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-indigo-500" />
              </Link>
            ))}
            {batches.length === 0 && (
              <div className="p-12 text-center text-slate-500">발급 이력이 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Send className="h-5 w-5" />
            최근 토큰 메일 발송 기록
          </h2>
          <span className="text-xs text-slate-500">최근 20건</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                <th className="px-3 py-3">시각</th>
                <th className="px-3 py-3">발송 경로</th>
                <th className="px-3 py-3">수신 주소</th>
                <th className="px-3 py-3">대상 권한</th>
                <th className="px-3 py-3">상태</th>
                <th className="px-3 py-3">토큰</th>
                <th className="px-3 py-3">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-3 text-slate-500">{formatKST(log.createdAt, "yyyy.MM.dd HH:mm")}</td>
                  <td className="px-3 py-3">{SOURCE_LABELS[log.source] || log.source}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{log.recipientEmail}</div>
                    {log.requesterName && <div className="text-xs text-slate-500">{log.requesterName}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {ROLE_LABELS[log.targetRole] || log.targetRole}
                    {log.targetGisu ? ` (${log.targetGisu}기)` : ""}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        log.status === "SENT"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : log.status === "FAILED"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                      }`}
                    >
                      {STATUS_LABELS[log.status] || log.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{log.inviteToken?.token || "-"}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">{log.errorMessage || log.brevoMessageId || "-"}</td>
                </tr>
              ))}
              {recentLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    발송 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
