import type { ScheduleEntry } from "../types";
import { canAssignShift, summarizeMonth, type LaborSettings } from "./labor-hours";
import { applicationStatus, leaveApplicationKey, type ApplicationStatus, type LeaveApplications } from "./leave-application";
import { shiftRequestOf, type ShiftRequests } from "./shift-request";

/**
 * 排班工作台用的小計算（只看、不存資料）：
 * 某一診可以補誰（未排人員）、本月的排休申請清單。
 */

/**
 * available＝可以排；wish＝希望不排（可排，提醒）；applied＝這天有排休申請但沒排在班表上（可排，提醒）；
 * overHours＝排了會超過工時或休息規定（可排，提醒）；
 * scheduled＝這一診已排（含機動）；leave＝這天休假；sessionLeave＝這一診請假（不排）。
 */
export type Availability = "available" | "wish" | "applied" | "overHours" | "scheduled" | "leave" | "sessionLeave";

export interface Candidate {
  personId: string;
  status: Availability;
  /** 這個月目前的工時（上班＋請假），排序用：工時少的先。 */
  paidMinutes: number;
}

const ORDER: Availability[] = ["available", "wish", "applied", "overHours", "scheduled", "leave", "sessionLeave"];

/** 可以直接排入（希望不排、有排休申請、超過工時只提醒，手動排班不擋）。 */
export const canPlace = (status: Availability) =>
  status === "available" || status === "wish" || status === "applied" || status === "overHours";

/** 某一診每位助理的狀態，可以排的在前、工時少的在前。 */
export function sessionCandidates(
  entries: ScheduleEntry[],
  assistantIds: string[],
  date: string,
  shiftId: string,
  settings: LaborSettings,
  requests: ShiftRequests,
  applications: LeaveApplications = {},
): Candidate[] {
  const month = date.slice(0, 7);
  return assistantIds
    .map((personId) => {
      const own = entries.filter((entry) => entry.personId === personId && entry.date === date);
      const request = shiftRequestOf(requests, date, personId, shiftId);
      const status: Availability = own.some((entry) => entry.state === "shift" && entry.shiftId === shiftId)
        ? "scheduled"
        : own.some((entry) => entry.state === "leave")
          ? "leave"
          : request?.leaveType
            ? "sessionLeave"
            : request
              ? "wish"
              : applications[leaveApplicationKey(date, personId)]
                ? "applied"
                  : canAssignShift(entries, personId, date, shiftId, settings, undefined, requests)
                  ? "available"
                  : "overHours";
      return { personId, status, paidMinutes: summarizeMonth(entries, personId, month, settings, requests).paidMinutes };
    })
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.paidMinutes - b.paidMinutes);
}

export interface LeaveRequestRow {
  date: string;
  personId: string;
  /** 指定診次請假的班別；整天排休沒有。 */
  shiftId?: string;
  /** placed＝照申請（整天：班表上是排休；診次：那一診沒排）；rest＝改成休息不扣假；unplaced＝未排入。 */
  status: ApplicationStatus;
}

/** 本月的排休申請：整天排休＋指定診次請假（不含「不用假」的希望不排），依日期排序。不帶假別。 */
export function monthLeaveRequests(
  applications: LeaveApplications,
  requests: ShiftRequests,
  entries: ScheduleEntry[],
  month: string,
): LeaveRequestRow[] {
  const days: LeaveRequestRow[] = Object.values(applications)
    .filter((application) => application.date.startsWith(month))
    .map((application) => ({ date: application.date, personId: application.personId, status: applicationStatus(application, entries) }));
  const sessions: LeaveRequestRow[] = Object.values(requests)
    .filter((request) => request.leaveType && request.date.startsWith(month))
    .map((request) => {
      const scheduled = entries.some(
        (entry) => entry.personId === request.personId && entry.date === request.date && entry.state === "shift" && entry.shiftId === request.shiftId,
      );
      return {
        date: request.date,
        personId: request.personId,
        shiftId: request.shiftId,
        status: scheduled ? "unplaced" : request.restInstead ? "rest" : "placed",
      };
    });
  return [...days, ...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.personId.localeCompare(b.personId) || (a.shiftId ?? "").localeCompare(b.shiftId ?? ""),
  );
}
