export type UserSummaryPayload = {
  authenticated: boolean;
  role: string | null;
  name: string | null;
  studentId: string | null;
  unreadNotificationCount: number;
};

export const anonymousUserSummary: UserSummaryPayload = {
  authenticated: false,
  role: null,
  name: null,
  studentId: null,
  unreadNotificationCount: 0,
};

export type HomeDdayPayload = {
  title: string;
  count: string;
  text: string;
  prefix: string;
};

export type HomeTimetableItemPayload = {
  period: string;
  content: string;
};

export type HomePersonalizationPayload = {
  authenticated: boolean;
  role: string | null;
  name: string | null;
  studentId: string | null;
  grade: string | null;
  classNum: string | null;
  personalDDay: HomeDdayPayload | null;
  todayScheduleSummary: string | null;
  todayTimetable: HomeTimetableItemPayload[];
};

export const anonymousHomePersonalization: HomePersonalizationPayload = {
  authenticated: false,
  role: null,
  name: null,
  studentId: null,
  grade: null,
  classNum: null,
  personalDDay: null,
  todayScheduleSummary: null,
  todayTimetable: [],
};
