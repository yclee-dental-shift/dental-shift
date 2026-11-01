import type { ScheduleEntry, ShiftDefinition } from "../types";
import { isPreLeave } from "./leave-window";
import { sessionLeaveMinutes, type ShiftRequests } from "./shift-request";

export interface LaborSettings {
  dailyMaxMinutes: number;
  hoursPerWorkday: number;
  monthlyOvertimeHours: number;
  restDaysPerFourWeeks: number;
  restDaysPerTwoWeeks: number;
  leaveHoursPerDay: number;
  targetBelowNormalHours: { min: number; max: number };
  workdaysByMonth: Record<string, number>;
  shifts: ShiftDefinition[];
}

export interface MonthlyLabor {
  personId: string;
  month: string;
  workedMinutes: number;
  /** 有假別的排休時數（每天 leaveHoursPerDay 小時）。 */
  leaveMinutes: number;
  /** 上班＋請假，用來對照目標工時與正常工時上限。 */
  paidMinutes: number;
  normalCapMinutes: number | undefined;
  totalCapMinutes: number | undefined;
  restDays: number;
  requiredRestDays: number;
  /** 1–14 日、15–28 日各自的休息天數。 */
  blockRestDays: [number, number];
  maxDailyMinutes: number;
}

export interface LaborIssue {
  personId: string;
  month: string;
  message: string;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function shiftMinutes(shifts: ShiftDefinition[]): Map<string, number> {
  return new Map(shifts.map((shift) => [shift.id, toMinutes(shift.end) - toMinutes(shift.start)]));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function daysInMonth(month: string): number {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

export function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}` : `${hours}:${String(rest).padStart(2, "0")}`;
}

/** 每月目標工時（分鐘）：手動設定（小時）優先，否則依正常工時減去預設差距。 */
export interface TargetHours {
  min: number;
  max: number;
}

export function targetRange(
  month: string,
  settings: LaborSettings,
  override?: TargetHours,
): { minMinutes: number; maxMinutes: number } | undefined {
  if (override) return { minMinutes: override.min * 60, maxMinutes: override.max * 60 };
  const workdays = settings.workdaysByMonth[month];
  if (workdays === undefined) return undefined;
  const normal = workdays * settings.hoursPerWorkday;
  return {
    minMinutes: (normal - settings.targetBelowNormalHours.min) * 60,
    maxMinutes: (normal - settings.targetBelowNormalHours.max) * 60,
  };
}

/** 統計某人某月的工時與休息天數（休假、未排班都算休息日）；有 requests 時，診次請假的時數也算進請假。 */
export function summarizeMonth(
  entries: ScheduleEntry[],
  personId: string,
  month: string,
  settings: LaborSettings,
  requests?: ShiftRequests,
): MonthlyLabor {
  const minutesOf = shiftMinutes(settings.shifts);
  const daily = new Map<string, number>();
  let leaveDays = 0;
  entries.forEach((entry) => {
    if (entry.personId === personId && monthOf(entry.date) === month && isPreLeave(entry)) leaveDays += 1;
    if (entry.personId !== personId || entry.state !== "shift" || monthOf(entry.date) !== month) return;
    daily.set(entry.date, (daily.get(entry.date) ?? 0) + (minutesOf.get(entry.shiftId ?? "") ?? 0));
  });
  const totalDays = daysInMonth(month);
  const workedDays = [...daily.keys()].map((date) => Number(date.slice(8, 10)));
  const workdays = settings.workdaysByMonth[month];
  const normalCapMinutes = workdays === undefined ? undefined : workdays * settings.hoursPerWorkday * 60;
  const workedMinutes = [...daily.values()].reduce((sum, value) => sum + value, 0);
  const leaveMinutes =
    leaveDays * settings.leaveHoursPerDay * 60 + (requests ? sessionLeaveMinutes(requests, entries, personId, month, minutesOf) : 0);
  return {
    personId,
    month,
    workedMinutes,
    leaveMinutes,
    paidMinutes: workedMinutes + leaveMinutes,
    normalCapMinutes,
    totalCapMinutes: normalCapMinutes === undefined ? undefined : normalCapMinutes + settings.monthlyOvertimeHours * 60,
    restDays: totalDays - workedDays.length,
    requiredRestDays: Math.ceil((settings.restDaysPerFourWeeks * totalDays) / 28),
    blockRestDays: [
      14 - workedDays.filter((day) => day <= 14).length,
      14 - workedDays.filter((day) => day >= 15 && day <= 28).length,
    ],
    maxDailyMinutes: Math.max(0, ...daily.values()),
  };
}

/** 列出違反工時或休息規定的地方（多半來自手動排班）。 */
export function evaluateLaborIssues(
  entries: ScheduleEntry[],
  personIds: string[],
  months: string[],
  settings: LaborSettings,
  requests?: ShiftRequests,
): LaborIssue[] {
  return months.flatMap((month) =>
    personIds.flatMap((personId) => {
      const summary = summarizeMonth(entries, personId, month, settings, requests);
      const issues: string[] = [];
      const paid = summary.paidMinutes;
      const leaveText = summary.leaveMinutes > 0 ? `（含請假 ${formatHours(summary.leaveMinutes)}）` : "";
      if (summary.totalCapMinutes !== undefined && paid > summary.totalCapMinutes) {
        issues.push(`本月 ${formatHours(paid)} 小時${leaveText}，超過含加班上限 ${formatHours(summary.totalCapMinutes)} 小時`);
      } else if (summary.normalCapMinutes !== undefined && paid > summary.normalCapMinutes) {
        issues.push(`本月 ${formatHours(paid)} 小時${leaveText}，超過正常工時 ${formatHours(summary.normalCapMinutes)} 小時（加班）`);
      }
      if (summary.maxDailyMinutes > settings.dailyMaxMinutes) issues.push("有一天超過 10 小時");
      if (summary.restDays < summary.requiredRestDays) issues.push(`本月只休 ${summary.restDays} 天，至少要 ${summary.requiredRestDays} 天`);
      if (summary.blockRestDays[0] < settings.restDaysPerTwoWeeks) issues.push(`1–14 日只休 ${summary.blockRestDays[0]} 天`);
      if (summary.blockRestDays[1] < settings.restDaysPerTwoWeeks) issues.push(`15–28 日只休 ${summary.blockRestDays[1]} 天`);
      return issues.map((message) => ({ personId, month, message }));
    }),
  );
}

/**
 * 一鍵排班前的檢查：加上這一診後，是否仍在正常工時（含請假時數）與休息天數規定內。
 * limitMinutes 可再壓低上限（例如補工時只補到目標上限）。
 */
export function canAssignShift(
  entries: ScheduleEntry[],
  personId: string,
  date: string,
  shiftId: string,
  settings: LaborSettings,
  limitMinutes?: number,
  requests?: ShiftRequests,
): boolean {
  const month = monthOf(date);
  const before = summarizeMonth(entries, personId, month, settings, requests);
  if (before.normalCapMinutes === undefined) return true;
  const minutes = shiftMinutes(settings.shifts).get(shiftId) ?? 0;
  const cap = Math.min(before.normalCapMinutes, limitMinutes ?? Infinity);
  if (before.paidMinutes + minutes > cap) return false;

  const dayMinutes = entries
    .filter((entry) => entry.personId === personId && entry.date === date && entry.state === "shift")
    .reduce((sum, entry) => sum + (shiftMinutes(settings.shifts).get(entry.shiftId ?? "") ?? 0), 0);
  if (dayMinutes + minutes > settings.dailyMaxMinutes) return false;

  // 原本是休息日的話，排進去會少一天休息。
  if (dayMinutes === 0) {
    if (before.restDays - 1 < before.requiredRestDays) return false;
    const day = Number(date.slice(8, 10));
    const block = day <= 14 ? 0 : day <= 28 ? 1 : undefined;
    if (block !== undefined && before.blockRestDays[block] - 1 < settings.restDaysPerTwoWeeks) return false;
  }
  return true;
}
