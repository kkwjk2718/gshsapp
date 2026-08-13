import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export function findPublicNoticeById<TSelect extends Prisma.NoticeSelect>(
  id: string,
  select: TSelect,
  now = new Date(),
) {
  return prisma.notice.findFirst({
    where: {
      id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select,
  });
}
