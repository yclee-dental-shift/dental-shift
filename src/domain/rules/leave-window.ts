import { addDays } from "../dates";
import type { ScheduleEntry } from "../types";
import { timelineFor, type TimelineSettings } from "./month-timeline";

export const PRE_LEAVE_PREFIX = "預假｜";

/** 排休時程依每月排班日程（month-timeline）：預設通則＋每月手動調整。 */
export interface LeaveWindowSettings extends TimelineSettings {
  longLeaveMinDays: number;
  /** 管理者提早截止排休的月份（月份 → 截止時間）；有的話那個月一律算已截止。 */
  closedEarly?: Record<string, string>;
}

/** 排休申請階段：notOpen 未開放 → longLeaveOnly 長假登記 → open 一般排休 → closed 已截止 */
export type MonthPhase = "notOpen" | "longLeaveOnly" | "open" | "closed";

export interface MonthSchedule {
  month: string;
  phase: MonthPhase;
  longLeaveOpen: string;
  generalOpen: string;
  deadline: string;
  /** 管理者提早截止的時間（沒有＝照日程）。 */
  closedEarlyAt?: string;
}

/** deadline 是截止後第一天（一般排休最後一天的隔天）。 */
export function monthSchedule(month: string, today: string, settings: LeaveWindowSettings): MonthSchedule {
  const timeline = timelineFor(month, settings);
  const { longLeaveOpen, generalOpen } = timeline;
  const deadline = addDays(timeline.generalLast, 1);
  const closedEarlyAt = settings.closedEarly?.[month];
  const phase: MonthPhase =
    closedEarlyAt ? "closed"
      : today < longLeaveOpen ? "notOpen"
      : today < generalOpen ? "longLeaveOnly"
        : today < deadline ? "open"
          : "closed";
  return closedEarlyAt
    ? { month, phase, longLeaveOpen, generalOpen, deadline, closedEarlyAt }
    : { month, phase, longLeaveOpen, generalOpen, deadline };
}

export function isPreLeave(entry: ScheduleEntry): boolean {
  return entry.state === "leave" && (entry.note ?? "").startsWith(PRE_LEAVE_PREFIX);
}

export function preLeaveType(entry: ScheduleEntry): string | undefined {
  return isPreLeave(entry) ? entry.note!.slice(PRE_LEAVE_PREFIX.length) : undefined;
}

/** 排休是否還能新增、修改或取消。 */
export function preLeaveEditable(phase: MonthPhase): boolean {
  return phase === "longLeaveOnly" || phase === "open";
}

/** 長假登記期間，同月排休只有 1 天的人（需 2 天以上才算長假）。 */
export function shortLongLeaveRequests(
  entries: ScheduleEntry[],
  month: string,
  minDays: number,
): string[] {
  const counts = new Map<string, number>();
  entries.forEach((entry) => {
    if (isPreLeave(entry) && entry.date.startsWith(month)) counts.set(entry.personId, (counts.get(entry.personId) ?? 0) + 1);
  });
  return [...counts.entries()].filter(([, count]) => count < minDays).map(([personId]) => personId);
}

export interface PreLeaveDayStatus {
  /** 這天目前的排休假別（沒有則為 undefined）。 */
  type: string | undefined;
  /** 這天已排的班（排休會取代它們）。 */
  hasShifts: boolean;
  editable: boolean;
  reason: string;
}

/** 助理在「排休申請」頁能否新增或取消某一天的排休。 */
export function preLeaveDayStatus(
  entries: ScheduleEntry[],
  personId: string,
  date: string,
  today: string,
  settings: LeaveWindowSettings,
  closedDates: Set<string>,
): PreLeaveDayStatus {
  const own = entries.filter((entry) => entry.personId === personId && entry.date === date);
  const pre = own.find(isPreLeave);
  const base = { type: pre ? preLeaveType(pre) : undefined, hasShifts: own.some((entry) => entry.state === "shift") };
  const phase = monthSchedule(date.slice(0, 7), today, settings).phase;
  if (!preLeaveEditable(phase)) return { ...base, editable: false, reason: "不在排休申請期間" };
  if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || closedDates.has(date)) {
    return { ...base, editable: false, reason: "休診日不需排休" };
  }
  if (own.some((entry) => entry.state === "leave" && !isPreLeave(entry))) {
    return { ...base, editable: false, reason: "已由管理者排休" };
  }
  return { ...base, editable: true, reason: "" };
}
