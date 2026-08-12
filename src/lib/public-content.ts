import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getEventsFromICal } from "@/lib/google-calendar";
import { getSchoolSchedule } from "@/lib/neis";
import { normalizeStoredExternalHttpsUrl } from "@/lib/security/public-input";
import { toPublicCalendarSchedule, type PublicCalendarSchedule } from "@/lib/calendar-dto";

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
        where: {
          OR: [
            { expiresAt: { gt: new Date() } },
            { expiresAt: null },
          ],
        },
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
        where: {
          OR: [
            { expiresAt: { gt: new Date() } },
            { expiresAt: null },
          ],
        },
        take: 100,
        select: {
          id: true,
          category: true,
          title: true,
          content: true,
          expiresAt: true,
          createdAt: true,
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
        select: { title: true, startDate: true },
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
      const rows = await prisma.relatedSite.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, name: true, url: true, category: true, description: true },
      });
      return rows.flatMap((site) => {
        const url = normalizeStoredExternalHttpsUrl(site.url);
        return url ? [{ ...site, url }] : [];
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
        select: {
          id: true,
          name: true,
          email: true,
          teacherProfile: {
            select: { subject: true, location: true, message: true },
          },
        },
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
  async (): Promise<PublicCalendarSchedule[]> => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const fromDate = `${currentYear - 1}0101`;
    const toDate = `${currentYear + 1}1231`;
    const rangeStart = new Date(Date.UTC(currentYear - 1, 0, 1));
    const rangeEnd = new Date(Date.UTC(currentYear + 1, 11, 31, 23, 59, 59, 999));

    const [dbSchedules, iCalSetting, neisSchedules] = await Promise.all([
      prisma.schedule.findMany({
        where: {
          startDate: { lte: rangeEnd },
          endDate: { gte: rangeStart },
        },
        orderBy: { startDate: "asc" },
        take: 500,
        select: {
          id: true,
          title: true,
          description: true,
          startDate: true,
          endDate: true,
          category: true,
        },
      }).catch((error) => {
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

    const dbEvents = dbSchedules.map(toPublicCalendarSchedule);
    const externalEvents = iCalEvents.map(toPublicCalendarSchedule);
    const neisEvents = neisSchedules.map((neis) => {
      const eventDate = new Date(Date.UTC(
        Number.parseInt(neis.AA_YMD.substring(0, 4), 10),
        Number.parseInt(neis.AA_YMD.substring(4, 6), 10) - 1,
        Number.parseInt(neis.AA_YMD.substring(6, 8), 10),
      ));
      return toPublicCalendarSchedule({
        id: `neis-${neis.AA_YMD}-${neis.EVENT_NM}`,
        title: neis.EVENT_NM,
        description: neis.EVENT_CNTNT || neis.SBTR_DD_SC_NM,
        startDate: eventDate,
        endDate: eventDate,
        category: "NEIS",
      });
    });

    return [...dbEvents, ...externalEvents, ...neisEvents]
      .filter((event): event is PublicCalendarSchedule => Boolean(event))
      .filter((event) => event.startDate <= rangeEnd.toISOString() && event.endDate >= rangeStart.toISOString())
      .sort((left, right) => left.startDate.localeCompare(right.startDate))
      .slice(0, 500);
  },
  ["calendar-schedules"],
  { revalidate: 300 },
);
