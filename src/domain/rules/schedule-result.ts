import type { ScheduleEntry } from "../types";
import { applicationsOf, applicationStatus, type ApplicationStatus, type LeaveApplications } from "./leave-application";
import { shiftMinutes, summarizeMonth, targetRange, type LaborSettings, type TargetHours } from "./labor-hours";
import { shiftRequestKey, type ShiftRequests } from "./shift-request";

/**
 * 每位助理每個月的「排班結果」（使用者 2026-10-25 要求）：申請了什麼、實際怎麼排、工時多少、
 * 為了配合申請做了哪些調整（例如改成休息日不扣假）。只從班表、排休申請、指定診次與工時算出來，不另外存。
 * 不含事由；假別照現有規則只給本人與管理者看（模擬身分，非正式保護）。
 */
export interface WholeDayResult {
  date: string;
  leaveType: string;
  status: ApplicationStatus;
}

/** placed＝照希望沒排（用假＝請假、不用假＝休息）；rest＝用假改成休息（不扣假）；scheduled＝還是排了班。 */
export type SessionStatus = "placed" | "rest" | "scheduled";

export interface SessionResult {
  date: string;
  shiftId: string;
  /** 有值＝用假（請假）；沒有＝不用假（只是希望不排）。 */
  leaveType?: string;
  status: SessionStatus;
}

export interface ScheduleResult {
  personId: string;
  month: string;
  wholeDay: WholeDayResult[];
  sessions: SessionResult[];
  /** 跟診（不含機動）、機動、請假（整天排休＋診次請假）。 */
  followMinutes: number;
  flexMinutes: number;
  leaveMinutes: number;
  /** 上班＋請假，對照正常工時與目標。 */
  paidMinutes: number;
  normalMinutes?: number;
  target?: { minMinutes: number; maxMinutes: number };
  /** 比正常工時少排的時數（沒有少排＝0）。 */
  belowNormalMinutes: number;
  /** 改成休息日（不扣假）省下的假：整天幾天、合計時數（含診次）。 */
  restDays: number;
  restMinutes: number;
}

export function scheduleResultOf({
  entries,
  applications,
  requests,
  personId,
  month,
  settings,
  flexNote,
  targetOverride,
}: {
  entries: ScheduleEntry[];
  applications: LeaveApplications;
  requests: ShiftRequests;
  personId: string;
  month: string;
  settings: LaborSettings;
  /** 機動（補工時）班別的 note。 */
  flexNote: string;
  targetOverride?: TargetHours;
}): ScheduleResult {
  const minutesOf = shiftMinutes(settings.shifts);
  const mine = entries.filter((entry) => entry.personId === personId && entry.date.startsWith(month));
  const wholeDay = applicationsOf(applications, personId, month).map((application) => ({
    date: application.date,
    leaveType: application.leaveType,
    status: applicationStatus(application, entries),
  }));
  const scheduled = new Set(
    mine.filter((entry) => entry.state === "shift" && entry.shiftId).map((entry) => shiftRequestKey(entry.date, entry.personId, entry.shiftId!)),
  );
  const sessions: SessionResult[] = Object.values(requests)
    .filter((request) => request.personId === personId && request.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || settings.shifts.findIndex((s) => s.id === a.shiftId) - settings.shifts.findIndex((s) => s.id === b.shiftId))
    .map((request) => ({
      date: request.date,
      shiftId: request.shiftId,
      leaveType: request.leaveType,
      status: scheduled.has(shiftRequestKey(request.date, request.personId, request.shiftId))
        ? "scheduled"
        : request.leaveType && request.restInstead
          ? "rest"
          : "placed",
    }));
  const labor = summarizeMonth(entries, personId, month, settings, requests);
  const flexMinutes = mine
    .filter((entry) => entry.state === "shift" && entry.note === flexNote)
    .reduce((sum, entry) => sum + (minutesOf.get(entry.shiftId ?? "") ?? 0), 0);
  const restDays = wholeDay.filter((item) => item.status === "rest").length;
  const restSessionMinutes = sessions
    .filter((item) => item.status === "rest")
    .reduce((sum, item) => sum + (minutesOf.get(item.shiftId) ?? 0), 0);
  return {
    personId,
    month,
    wholeDay,
    sessions,
    followMinutes: labor.workedMinutes - flexMinutes,
    flexMinutes,
    leaveMinutes: labor.leaveMinutes,
    paidMinutes: labor.paidMinutes,
    normalMinutes: labor.normalCapMinutes,
    target: targetRange(month, settings, targetOverride),
    belowNormalMinutes: labor.normalCapMinutes === undefined ? 0 : Math.max(0, labor.normalCapMinutes - labor.paidMinutes),
    restDays,
    restMinutes: restDays * settings.leaveHoursPerDay * 60 + restSessionMinutes,
  };
}
