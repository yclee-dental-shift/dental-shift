import type { ScheduleEntry } from "../types";
import { isMonthLead, type MonthLead, type RoleHolder } from "./month-lead";
import { isShiftTask } from "./shift-task";

/**
 * 工作分配（使用者 2026-10-30）：每月一份，每一診每個崗位排了誰，加上雜務。
 * 和班表分開存（`work-assignment-store.ts`／D1 `work_assignments`），版表（班表）為準：
 * 排了但那一診沒上班＝異常（顯示給大家看，請找排班負責人），有上班但沒排崗位＝機動。
 * 崗位代號和班表的「工作」相同（`shift-task.ts`）：doctor-醫師代號、learn-醫師代號（學習 +1）、float-1／float-2、counter、reserve。
 * 伺服器（`server/data-api.ts`）與畫面共用這裡的判斷。
 */
export interface WorkDuty {
  date: string;
  /** 哪一診（沒有＝整天）。 */
  shiftId?: string;
  /** 誰（人員代號，可以沒有）。 */
  people: string[];
  text: string;
}

export interface WorkAssignments {
  month: string;
  at: string;
  by: string;
  /** key＝`日期|班別|崗位` → 人員代號（照排的順序）。 */
  slots: Record<string, string[]>;
  duties: WorkDuty[];
}

export type WorkAssignmentMap = Record<string, WorkAssignments>;

/** 能改：最高管理者、助理長、這個月的排班負責人（和培訓清單、值班主管相同）。 */
export const canEditAssignments = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "owner" || viewer.role === "lead" || isMonthLead(viewer, lead);

export const slotKey = (date: string, shiftId: string, task: string) => `${date}|${shiftId}|${task}`;

export function parseSlotKey(key: string): { date: string; shiftId: string; task: string } {
  const [date, shiftId, task] = key.split("|");
  return { date, shiftId, task };
}

/** 一診的崗位（照 key 的順序）：[崗位, 人員代號[]]。 */
export function sessionSlots(assignments: WorkAssignments | null | undefined, date: string, shiftId: string): Array<[string, string[]]> {
  if (!assignments) return [];
  const prefix = `${date}|${shiftId}|`;
  return Object.entries(assignments.slots)
    .filter(([key, people]) => key.startsWith(prefix) && people.length > 0)
    .map(([key, people]) => [key.slice(prefix.length), people]);
}

/** 換掉某一格的人（空陣列＝拿掉這一格）。 */
export function setSlot(assignments: WorkAssignments, date: string, shiftId: string, task: string, people: string[], at: string, by: string): WorkAssignments {
  const slots = { ...assignments.slots };
  const key = slotKey(date, shiftId, task);
  if (people.length > 0) slots[key] = [...new Set(people)];
  else delete slots[key];
  return { ...assignments, slots, at, by };
}

export function emptyAssignments(month: string, at: string, by: string): WorkAssignments {
  return { month, at, by, slots: {}, duties: [] };
}

const onShift = (entries: ScheduleEntry[], date: string, shiftId: string, personId: string) =>
  entries.some((entry) => entry.date === date && entry.shiftId === shiftId && entry.personId === personId && entry.state === "shift");

export type AssignmentIssue =
  | { kind: "notWorking"; date: string; shiftId: string; task: string; personId: string }
  | { kind: "double"; date: string; shiftId: string; personId: string; tasks: string[] };

/** 異常：排了但那一診沒上班（版表為準）、同一個人同一診排了兩個崗位。 */
export function assignmentIssues(assignments: WorkAssignments | null | undefined, entries: ScheduleEntry[]): AssignmentIssue[] {
  if (!assignments) return [];
  const issues: AssignmentIssue[] = [];
  const bySession = new Map<string, Map<string, string[]>>();
  for (const [key, people] of Object.entries(assignments.slots)) {
    const { date, shiftId, task } = parseSlotKey(key);
    for (const personId of people) {
      if (!onShift(entries, date, shiftId, personId)) issues.push({ kind: "notWorking", date, shiftId, task, personId });
      const session = bySession.get(`${date}|${shiftId}`) ?? new Map<string, string[]>();
      session.set(personId, [...(session.get(personId) ?? []), task]);
      bySession.set(`${date}|${shiftId}`, session);
    }
  }
  for (const [session, people] of bySession) {
    const [date, shiftId] = session.split("|");
    for (const [personId, tasks] of people) if (tasks.length > 1) issues.push({ kind: "double", date, shiftId, personId, tasks });
  }
  return issues.sort((a, b) => a.date.localeCompare(b.date) || a.shiftId.localeCompare(b.shiftId));
}

/** 機動：那一診有上班、但沒排在任何崗位的助理。 */
export function unassignedPeople(
  assignments: WorkAssignments | null | undefined,
  entries: ScheduleEntry[],
  date: string,
  shiftId: string,
  assistantIds: string[],
): string[] {
  const placed = new Set(sessionSlots(assignments, date, shiftId).flatMap(([, people]) => people));
  return assistantIds.filter((id) => onShift(entries, date, shiftId, id) && !placed.has(id));
}

/** 某人某一診的崗位（工作分配上排的；同一診排兩個崗位就兩個）。 */
export function rolesOf(assignments: WorkAssignments | null | undefined, date: string, shiftId: string, personId: string): string[] {
  return sessionSlots(assignments, date, shiftId)
    .filter(([, people]) => people.includes(personId))
    .map(([task]) => task);
}

/** 某人某一診（或整天）的雜務；`shiftId` 沒有的雜務＝整天，每一診都列。 */
export function dutiesOf(assignments: WorkAssignments | null | undefined, date: string, personId: string, shiftId?: string): WorkDuty[] {
  return (assignments?.duties ?? []).filter(
    (duty) => duty.date === date && duty.people.includes(personId) && (shiftId === undefined ? true : duty.shiftId === undefined || duty.shiftId === shiftId),
  );
}

/** 從班表上記的「工作」產生工作分配（一鍵排班排完、或這個月還沒有工作分配時用）。 */
export function assignmentsFromEntries(entries: ScheduleEntry[], month: string, at: string, by: string): WorkAssignments {
  const slots: Record<string, string[]> = {};
  for (const entry of entries) {
    if (entry.state !== "shift" || !entry.shiftId || !entry.task || !entry.date.startsWith(`${month}-`)) continue;
    const key = slotKey(entry.date, entry.shiftId, entry.task);
    slots[key] = [...(slots[key] ?? []), entry.personId];
  }
  return { month, at, by, slots, duties: [] };
}

/** 照工作分配改班表上記的「工作」：有上班、而且只排一個崗位的人記那個崗位；有上班沒排的清掉。回傳要改的班。 */
export function entryTaskUpdates(assignments: WorkAssignments, entries: ScheduleEntry[], assistantIds: Set<string>): ScheduleEntry[] {
  const roleOf = new Map<string, string[]>();
  for (const [key, people] of Object.entries(assignments.slots)) {
    const { date, shiftId, task } = parseSlotKey(key);
    for (const personId of people) roleOf.set(`${date}|${shiftId}|${personId}`, [...(roleOf.get(`${date}|${shiftId}|${personId}`) ?? []), task]);
  }
  const updates: ScheduleEntry[] = [];
  for (const entry of entries) {
    if (entry.state !== "shift" || !entry.shiftId || !assistantIds.has(entry.personId) || !entry.date.startsWith(`${assignments.month}-`)) continue;
    const tasks = roleOf.get(`${entry.date}|${entry.shiftId}|${entry.personId}`) ?? [];
    const next = tasks.length === 1 ? tasks[0] : undefined;
    if (next === entry.task) continue;
    const rest = { ...entry };
    delete rest.task;
    updates.push(next ? { ...rest, task: next } : rest);
  }
  return updates;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT = /^[a-z]{1,20}$/;
const PERSON = /^[A-Za-z0-9-]{1,64}$/;
const isText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

/** 格式（伺服器存之前檢查）。 */
export function isWorkAssignments(value: unknown, month: string): value is WorkAssignments {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.month !== month || !isText(record.at, 40) || !isText(record.by, 40)) return false;
  const slots = record.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return false;
  const items = Object.entries(slots as Record<string, unknown>);
  if (items.length > 1500) return false;
  const slotsOk = items.every(([key, people]) => {
    const [date, shiftId, task, extra] = key.split("|");
    return (
      extra === undefined &&
      DATE.test(date ?? "") &&
      date.startsWith(month) &&
      SHIFT.test(shiftId ?? "") &&
      isShiftTask(task) &&
      Array.isArray(people) &&
      people.length <= 8 &&
      people.every((id) => typeof id === "string" && PERSON.test(id))
    );
  });
  if (!slotsOk || !Array.isArray(record.duties) || record.duties.length > 500) return false;
  return record.duties.every((duty: unknown) => {
    if (!duty || typeof duty !== "object") return false;
    const item = duty as Record<string, unknown>;
    return (
      typeof item.date === "string" &&
      DATE.test(item.date) &&
      item.date.startsWith(month) &&
      (item.shiftId === undefined || (typeof item.shiftId === "string" && SHIFT.test(item.shiftId))) &&
      Array.isArray(item.people) &&
      item.people.length <= 8 &&
      item.people.every((id) => typeof id === "string" && PERSON.test(id)) &&
      isText(item.text, 200)
    );
  });
}
