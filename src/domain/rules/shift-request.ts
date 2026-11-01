import type { ScheduleEntry } from "../types";
import { isPreLeave, monthSchedule, type LeaveWindowSettings } from "./leave-window";

/**
 * 「指定診次不排」：助理希望某天某一診不要排班。
 * 不用假（沒有 leaveType）：只是希望，一鍵排班盡量避開，人不夠時仍可能排入。
 * 用假（有 leaveType）：那一診請假，一鍵排班一律不排，時數算進當月工時。
 * 「希望整天休」＝那天每一診都登記不用假。
 */
export interface ShiftRequest {
  date: string;
  personId: string;
  shiftId: string;
  /** 登記時間（ISO 字串）。 */
  at: string;
  /** 用假時的假別；舊資料沒有＝不用假。 */
  leaveType?: string;
  /** 管理者把請假改成休息日（不扣假）：照樣不排，但不算請假時數。 */
  restInstead?: boolean;
}

export type ShiftRequests = Record<string, ShiftRequest>;

export const shiftRequestKey = (date: string, personId: string, shiftId: string) => `${date}_${personId}_${shiftId}`;

export function hasShiftRequest(requests: ShiftRequests, date: string, personId: string, shiftId: string): boolean {
  return shiftRequestKey(date, personId, shiftId) in requests;
}

/** 某人某天某一診的登記（沒有則為 undefined）。 */
export function shiftRequestOf(requests: ShiftRequests, date: string, personId: string, shiftId: string): ShiftRequest | undefined {
  return requests[shiftRequestKey(date, personId, shiftId)];
}

/** 這一診是否請假（用假）：一鍵排班一律不排。 */
export function isSessionLeave(requests: ShiftRequests, date: string, personId: string, shiftId: string): boolean {
  return !!shiftRequestOf(requests, date, personId, shiftId)?.leaveType;
}

/** 新增（或覆蓋）一筆登記；leaveType 有值＝用假。 */
export function setShiftRequest(
  requests: ShiftRequests,
  date: string,
  personId: string,
  shiftId: string,
  at: string,
  leaveType?: string,
): ShiftRequests {
  return { ...requests, [shiftRequestKey(date, personId, shiftId)]: { date, personId, shiftId, at, ...(leaveType ? { leaveType } : {}) } };
}

/** 管理者把診次請假改成休息日（不扣假），或改回用假。 */
export function setRestInstead(requests: ShiftRequests, request: ShiftRequest, restInstead: boolean): ShiftRequests {
  const key = shiftRequestKey(request.date, request.personId, request.shiftId);
  if (!requests[key]) return requests;
  const next = { ...requests[key] };
  if (restInstead) next.restInstead = true;
  else delete next.restInstead;
  return { ...requests, [key]: next };
}

/** 某人某月診次請假的時數（分鐘）：用假、沒改成休息日、而且班表上沒排這一診。 */
export function sessionLeaveMinutes(
  requests: ShiftRequests,
  entries: ScheduleEntry[],
  personId: string,
  month: string,
  minutesOf: Map<string, number>,
): number {
  const scheduled = new Set(
    entries
      .filter((entry) => entry.personId === personId && entry.state === "shift" && entry.shiftId)
      .map((entry) => shiftRequestKey(entry.date, entry.personId, entry.shiftId!)),
  );
  return Object.values(requests)
    .filter(
      (request) =>
        request.personId === personId &&
        request.date.startsWith(month) &&
        request.leaveType &&
        !request.restInstead &&
        !scheduled.has(shiftRequestKey(request.date, request.personId, request.shiftId)),
    )
    .reduce((sum, request) => sum + (minutesOf.get(request.shiftId) ?? 0), 0);
}

/** 某人某天登記不排的診。 */
export function requestedShiftsOn(requests: ShiftRequests, date: string, personId: string): string[] {
  return Object.values(requests)
    .filter((request) => request.date === date && request.personId === personId)
    .map((request) => request.shiftId);
}

/** 登記了不排、但班表上仍排了這一診的項目。 */
export function brokenShiftRequests(requests: ShiftRequests, entries: ScheduleEntry[]): ShiftRequest[] {
  const scheduled = new Set(
    entries
      .filter((entry) => entry.state === "shift" && entry.shiftId)
      .map((entry) => shiftRequestKey(entry.date, entry.personId, entry.shiftId!)),
  );
  return Object.values(requests).filter((request) =>
    scheduled.has(shiftRequestKey(request.date, request.personId, request.shiftId)),
  );
}

/** 助理能否在某天新增或取消「指定診次不排」；開放期間與一般排休相同。 */
export function shiftRequestDayStatus(
  entries: ScheduleEntry[],
  personId: string,
  date: string,
  today: string,
  settings: LeaveWindowSettings,
  closedDates: Set<string>,
): { editable: boolean; reason: string } {
  if (monthSchedule(date.slice(0, 7), today, settings).phase !== "open") {
    return { editable: false, reason: "不在排休申請期間" };
  }
  if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || closedDates.has(date)) {
    return { editable: false, reason: "休診日不需登記" };
  }
  const own = entries.filter((entry) => entry.personId === personId && entry.date === date);
  if (own.some(isPreLeave)) return { editable: false, reason: "這天已整天排休" };
  if (own.some((entry) => entry.state === "leave")) return { editable: false, reason: "已由管理者排休" };
  return { editable: true, reason: "" };
}

/** 新增或取消一筆登記，回傳新的登記表。 */
export function toggleShiftRequest(
  requests: ShiftRequests,
  date: string,
  personId: string,
  shiftId: string,
  at: string,
): ShiftRequests {
  const key = shiftRequestKey(date, personId, shiftId);
  const next = { ...requests };
  if (key in next) delete next[key];
  else next[key] = { date, personId, shiftId, at };
  return next;
}
