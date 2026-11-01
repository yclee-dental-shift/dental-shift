import { addDays } from "@/domain/dates";
import { courseProfile } from "@/config/clinic.config";
import { holidaySwaps } from "@/config/holiday-swaps";
import { laborRules, workdaysByMonth } from "@/config/labor.config";
import { readDoctorSchedule } from "@/data/doctor-schedule-store";
import { sessionsForMonth } from "@/domain/rules/doctor-schedule";
import { holidayNoteOf } from "@/domain/rules/holiday-swap";
import type { MonthSchedule } from "@/domain/rules/leave-window";

/** 管理者與助理畫面共用的設定。 */
export const LABOR_SETTINGS = { ...laborRules, workdaysByMonth, shifts: courseProfile.shifts };
export const ASSISTANTS = courseProfile.people.filter((person) => person.role === "assistant");
export const ASSISTANT_IDS = ASSISTANTS.map((person) => person.id);
export const ASSISTANT_NAMES = new Map(ASSISTANTS.map((person) => [person.id, person.displayName]));
/** 班表從這個月開始，更早的日期不顯示（和醫師班表的 firstMonth 一致）。 */
export const FIRST_MONTH = "2027-01";
export const FIRST_DAY = `${FIRST_MONTH}-01`;
export const clampMonth = (month: string) => (month < FIRST_MONTH ? FIRST_MONTH : month);
export const clampDay = (date: string) => (date < FIRST_DAY ? FIRST_DAY : date);

export const fullMonthLabel = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
export const shortDate = (date: string) => `${date.slice(0, 4)}/${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function monthDates(month: string): string[] {
  const [year, value] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
}

// 依醫師班表產生的每月診次；醫師班表換了（物件不同）就重算。
let cacheConfig = readDoctorSchedule();
const sessionCache = new Map<string, ReturnType<typeof sessionsForMonth>>();

/** 某月的醫師診次（依「醫師班表」頁的設定）；行事曆範圍外回傳 undefined。 */
export function doctorSessionsFor(month: string) {
  const config = readDoctorSchedule();
  if (config !== cacheConfig) {
    cacheConfig = config;
    sessionCache.clear();
  }
  if (!sessionCache.has(month)) sessionCache.set(month, sessionsForMonth(config, month));
  return sessionCache.get(month);
}

export interface ClinicDay {
  /** 有沒有行事曆可依；沒有時（例如 2028 年以後）不限制排班。 */
  known: boolean;
  open: boolean;
  /** 當天有開的診，依早午晚排序。 */
  shiftIds: string[];
  /** 休診原因：補假寫「補 6/9 端午」，其次是行事曆上的節日，否則依星期寫「週日」「週六」，其他寫「休診」。 */
  label?: string;
}

/** 依診所行事曆：某天有沒有看診、開哪幾診、休診原因。 */
export function clinicDayOf(date: string): ClinicDay {
  const sessions = doctorSessionsFor(date.slice(0, 7));
  if (!sessions) return { known: false, open: true, shiftIds: courseProfile.shifts.map((shift) => shift.id) };
  const open = new Set(sessions.filter((session) => session.date === date).map((session) => session.shiftId as string));
  const shiftIds = courseProfile.shifts.map((shift) => shift.id).filter((id) => open.has(id));
  if (shiftIds.length > 0) return { known: true, open: true, shiftIds };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const label = holidayNoteOf(date, holidaySwaps)?.short ?? readDoctorSchedule().closures.find((closure) => closure.date === date)?.label ?? (weekday === 0 ? "週日" : weekday === 6 ? "週六" : "休診");
  return { known: true, open: false, shiftIds: [], label };
}

/** 國定假日照常看診或補休的標示（見 holiday-swaps.ts）。 */
export const holidayNote = (date: string) => holidayNoteOf(date, holidaySwaps);

/** 一般排休最後一天（deadline 是截止後第一天）。 */
export const leaveLastDay = (info: MonthSchedule) => shortDate(addDays(info.deadline, -1));

export function phaseText(info: MonthSchedule): string {
  switch (info.phase) {
    case "notOpen":
      return `排休尚未開放（長假 ${shortDate(info.longLeaveOpen)} 起、一般 ${shortDate(info.generalOpen)}～${leaveLastDay(info)}）`;
    case "longLeaveOnly":
      return `長假登記中（同月排休 2 天以上）；一般排休 ${shortDate(info.generalOpen)}～${leaveLastDay(info)}`;
    case "open":
      return `排休開放中，${leaveLastDay(info)} 是最後一天`;
    case "closed":
      return info.closedEarlyAt
        ? `排休已提早截止（原訂最後一天 ${leaveLastDay(info)}）`
        : `排休已截止（最後一天 ${leaveLastDay(info)}）`;
  }
}
