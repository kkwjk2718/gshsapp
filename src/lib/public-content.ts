import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getEventsFromICal } from "@/lib/google-calendar";
import { getSchoolSchedule } from "@/lib/neis";
import { getNoticeVisibilityWhere } from "@/lib/notice-window";

function logPublicContentError(source: string, error: unknown) {
  console.warn(
    `[public-content] ${source} failed:`,
    error instanceof Error ? error.message : error,
  );
}

export const getHomePublicNotices = unstable_cache(
  async () => {
    try {
      return await prisma.notice.findMany({
        orderBy: { createdAt: "desc" },
        where: getNoticeVisibilityWhere(),
        take: 5,
        select: {
          id: true,
          title: true,
          content: true,
        },
      });
    } catch (error) {
      logPublicContentError("home notices", error);
      return [];
    }
  },
  ["home-public-notices"],
  { revalidate: 300 },
);

export const getVisibleNotices = unstable_cache(
  async () => {
    try {
      return await prisma.notice.findMany({
        orderBy: { createdAt: "desc" },
        where: getNoticeVisibilityWhere(),
        include: {
          writer: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      });
    } catch (error) {
      logPublicContentError("visible notices", error);
      return [];
    }
  },
  ["visible-notices"],
  { revalidate: 300 },
);

export const getNextAcademicSchedule = unstable_cache(
  async () => {
    try {
      return await prisma.schedule.findFirst({
        where: {
          category: "ACADEMIC",
          startDate: { gte: new Date() },
        },
        orderBy: { startDate: "asc" },
      });
    } catch (error) {
      logPublicContentError("next academic schedule", error);
      return null;
    }
  },
  ["next-academic-schedule"],
  { revalidate: 300 },
);

export const getRelatedSites = unstable_cache(
  async () => {
    try {
      return await prisma.relatedSite.findMany({
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      logPublicContentError("related sites", error);
      return [];
    }
  },
  ["related-sites"],
  { revalidate: 300 },
);

export const getTeacherDirectory = unstable_cache(
  async () => {
    try {
      return await prisma.user.findMany({
        where: { role: "TEACHER" },
        include: { teacherProfile: true },
      });
    } catch (error) {
      logPublicContentError("teacher directory", error);
      return [];
    }
  },
  ["teacher-directory"],
  { revalidate: 300 },
);

export const getCalendarSchedules = unstable_cache(
  async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const fromDate = `${currentYear - 1}0101`;
    const toDate = `${currentYear + 1}1231`;

    const [dbSchedules, iCalSetting, neisSchedules] = await Promise.all([
      prisma.schedule.findMany().catch((error) => {
        logPublicContentError("calendar db schedules", error);
        return [];
      }),
      prisma.systemSetting
        .findUnique({
          where: { key: "ICAL_URL" },
          select: { value: true },
        })
        .catch((error) => {
          logPublicContentError("calendar ical setting", error);
          return null;
        }),
      getSchoolSchedule(fromDate, toDate).catch((error) => {
        logPublicContentError("calendar neis schedules", error);
        return [];
      }),
    ]);

    const iCalEvents = await getEventsFromICal(iCalSetting?.value || "").catch((error) => {
      logPublicContentError("calendar ical events", error);
      return [];
    });

    const neisEvents = neisSchedules.map((neis) => ({
      id: `neis-${neis.AA_YMD}-${neis.EVENT_NM}`,
      title: neis.EVENT_NM,
      description: neis.EVENT_CNTNT || neis.SBTR_DD_SC_NM,
      startDate: new Date(
        parseInt(neis.AA_YMD.substring(0, 4), 10),
        parseInt(neis.AA_YMD.substring(4, 6), 10) - 1,
        parseInt(neis.AA_YMD.substring(6, 8), 10),
      ),
      endDate: new Date(
        parseInt(neis.AA_YMD.substring(0, 4), 10),
        parseInt(neis.AA_YMD.substring(4, 6), 10) - 1,
        parseInt(neis.AA_YMD.substring(6, 8), 10),
      ),
      category: "ACADEMIC",
      isNEIS: true as const,
    }));

    return [...dbSchedules, ...iCalEvents, ...neisEvents];
  },
  ["calendar-schedules"],
  { revalidate: 300 },
);
