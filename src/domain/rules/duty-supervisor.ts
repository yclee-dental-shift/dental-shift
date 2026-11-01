import { FLEX_SHIFT_NOTE } from "../../config/labor.config";
import type { ScheduleEntry } from "../types";
import { isMonthLead, LEAD_CANDIDATES, type MonthLead, type RoleHolder } from "./month-lead";

/**
 * 每一診的值班主管。
 * - 自動：那一診上班的助理長，沒有再找組長（`LEAD_CANDIDATES` 的順序）。
 * - 沒有助理長、組長上班的診：排班負責人（助理長）從那一診上班的人裡指定一位（`picks`）；指定的優先於自動。
 * - 排班時先指定：第 5 步送行政檢查前，每一診都要有主管。公告後還可以改（例如主管臨時請假）。
 * - 指定的人那天沒上班、那一診沒人當主管：總覽「待確認」通知助理長處理（`supervisorIssues`）。
 */

export interface DutySupervisors {
  month: string;
  /** 最後修改時間 YYYY-MM-DDTHH:mm。 */
  at: string;
  /** 最後修改的人（姓名）。 */
  by: string;
  /** `日期|班別` → 指定的人員代號。 */
  picks: Record<string, string>;
}

export type DutySupervisorMap = Record<string, DutySupervisors>;

export const sessionKey = (date: string, shiftId: string) => `${date}|${shiftId}`;

/** 能改：最高管理者、助理長、這個月的排班負責人。 */
export const canEditSupervisors = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "owner" || viewer.role === "lead" || isMonthLead(viewer, lead);

/** 這一診上班、可以當主管的人（不含機動、帶新手 +1）。 */
export function sessionStaff(entries: ScheduleEntry[], date: string, shiftId: string, assistantIds: Set<string>): string[] {
  return entries
    .filter(
      (entry) =>
        entry.date === date &&
        entry.shiftId === shiftId &&
        entry.state === "shift" &&
        assistantIds.has(entry.personId) &&
        entry.note !== FLEX_SHIFT_NOTE &&
        !entry.task?.startsWith("learn-"),
    )
    .map((entry) => entry.personId);
}

export interface SessionSupervisor {
  personId: string | null;
  /** pick＝指定的、auto＝自動帶出的助理長或組長。 */
  source: "pick" | "auto" | null;
  /** 指定的人那一診沒有上班（例如臨時請假）。 */
  pickAway?: string;
}

/** 這一診的值班主管。 */
export function supervisorOf(
  entries: ScheduleEntry[],
  date: string,
  shiftId: string,
  picks: Record<string, string> | undefined,
  assistantIds: Set<string>,
): SessionSupervisor {
  const staff = sessionStaff(entries, date, shiftId, assistantIds);
  const pick = picks?.[sessionKey(date, shiftId)];
  if (pick && staff.includes(pick)) return { personId: pick, source: "pick" };
  const auto = LEAD_CANDIDATES.find((candidate) => staff.includes(candidate.personId));
  return { personId: auto?.personId ?? null, source: auto ? "auto" : null, ...(pick ? { pickAway: pick } : {}) };
}

export interface SupervisorIssue {
  date: string;
  shiftId: string;
  /** none＝這一診沒有主管；pickAway＝指定的人沒上班（已改用自動帶出的人）。 */
  reason: "none" | "pickAway";
  pickAway?: string;
}

/**
 * 一個月要處理的值班主管：有醫師看診、已經排了助理的診，沒有主管或指定的人沒上班。
 * 還沒排助理的診算「缺人」，不在這裡列。
 */
export function supervisorIssues(
  entries: ScheduleEntry[],
  month: string,
  shiftIds: string[],
  picks: Record<string, string> | undefined,
  doctorIds: Set<string>,
  assistantIds: Set<string>,
): SupervisorIssue[] {
  const sessions = new Set(
    entries
      .filter((entry) => entry.date.startsWith(month) && entry.state === "shift" && entry.shiftId && doctorIds.has(entry.personId))
      .map((entry) => sessionKey(entry.date, entry.shiftId!)),
  );
  const order = (key: string) => [key.slice(0, 10), shiftIds.indexOf(key.slice(11))] as const;
  return [...sessions]
    .sort((a, b) => order(a)[0].localeCompare(order(b)[0]) || order(a)[1] - order(b)[1])
    .flatMap((key): SupervisorIssue[] => {
      const [date, shiftId] = key.split("|");
      if (sessionStaff(entries, date, shiftId, assistantIds).length === 0) return [];
      const result = supervisorOf(entries, date, shiftId, picks, assistantIds);
      if (!result.personId) return [{ date, shiftId, reason: "none" as const, ...(result.pickAway ? { pickAway: result.pickAway } : {}) }];
      if (result.pickAway) return [{ date, shiftId, reason: "pickAway" as const, pickAway: result.pickAway }];
      return [];
    });
}

const isText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

/** 格式（伺服器存之前檢查）。 */
export function isDutySupervisors(value: unknown, month: string): value is DutySupervisors {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.month !== month || !isText(record.at, 40) || !isText(record.by, 40)) return false;
  const picks = record.picks;
  if (!picks || typeof picks !== "object" || Array.isArray(picks)) return false;
  const items = Object.entries(picks as Record<string, unknown>);
  return (
    items.length <= 200 &&
    items.every(([key, personId]) => {
      const match = /^(\d{4}-\d{2}-\d{2})\|([a-z]{1,20})$/.exec(key);
      return !!match && match[1].startsWith(month) && typeof personId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(personId);
    })
  );
}
