import type { ScheduleEntry } from "../types";
import { isPreLeave, preLeaveType } from "./leave-window";

/**
 * 助理送出的排休申請（整天）。與班表分開存放：管理者把格子改成上班或清除時，
 * 申請紀錄仍保留，標「未排入」；協調後可再「改回排休」。
 */
export interface LeaveApplication {
  date: string;
  personId: string;
  leaveType: string;
  /** 申請時間（ISO 字串）。 */
  at: string;
  /** 管理者改成休息日（不扣假）：班表上是「休」，不算請假時數；舊資料沒有。 */
  restInstead?: boolean;
}

/** placed＝已排入（排休）；rest＝已改成休息日（不扣假）；unplaced＝未排入。 */
export type ApplicationStatus = "placed" | "rest" | "unplaced";

export type LeaveApplications = Record<string, LeaveApplication>;

export const leaveApplicationKey = (date: string, personId: string) => `${date}_${personId}`;

export function setApplication(
  applications: LeaveApplications,
  date: string,
  personId: string,
  leaveType: string,
  at: string,
): LeaveApplications {
  return { ...applications, [leaveApplicationKey(date, personId)]: { date, personId, leaveType, at } };
}

export function removeApplication(applications: LeaveApplications, date: string, personId: string): LeaveApplications {
  const key = leaveApplicationKey(date, personId);
  if (!(key in applications)) return applications;
  const next = { ...applications };
  delete next[key];
  return next;
}

/** 舊資料：班表上有排休、但還沒有申請紀錄的，視為一筆申請。 */
export function withLegacyApplications(applications: LeaveApplications, entries: ScheduleEntry[]): LeaveApplications {
  let next = applications;
  entries.forEach((entry) => {
    const key = leaveApplicationKey(entry.date, entry.personId);
    if (!isPreLeave(entry) || key in next) return;
    if (next === applications) next = { ...applications };
    next[key] = { date: entry.date, personId: entry.personId, leaveType: preLeaveType(entry)!, at: "" };
  });
  return next;
}

/** 申請是否已排在班表上（那天的格子是排休）。 */
export function isApplicationPlaced(application: Pick<LeaveApplication, "date" | "personId">, entries: ScheduleEntry[]): boolean {
  return entries.some((entry) => entry.date === application.date && entry.personId === application.personId && isPreLeave(entry));
}

export function applicationStatus(application: LeaveApplication, entries: ScheduleEntry[]): ApplicationStatus {
  if (isApplicationPlaced(application, entries)) return "placed";
  const own = entries.filter((entry) => entry.date === application.date && entry.personId === application.personId);
  return application.restInstead && own.some((entry) => entry.state === "leave") ? "rest" : "unplaced";
}

/** 管理者改成休息日（不扣假），或改回用假。 */
export function setApplicationRest(
  applications: LeaveApplications,
  application: LeaveApplication,
  restInstead: boolean,
): LeaveApplications {
  const next: LeaveApplication = { ...application };
  if (restInstead) next.restInstead = true;
  else delete next.restInstead;
  return { ...applications, [leaveApplicationKey(application.date, application.personId)]: next };
}

/** 某人某月的申請（依日期排序）。 */
export function applicationsOf(applications: LeaveApplications, personId: string, month: string): LeaveApplication[] {
  return Object.values(applications)
    .filter((application) => application.personId === personId && application.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
}
