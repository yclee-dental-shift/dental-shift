import type { ScheduleEntry } from "../types";
import { isMonthLead, seesAllOfMonth, type MonthLead, type RoleHolder } from "./month-lead";
import { isShiftTask } from "./shift-task";

/**
 * 每月培訓清單（能力排班第 4 階段，使用者 2026-10-27/28，見 `docs/ability-plan.md` 第 2、3-3 節）。
 * 培訓本身不在排班裡做；排班只記這個月要照排的兩種：
 * - **指定安排**：某人、某天某一診、做什麼（一定要排）；目的只是備註。
 * - **培訓目標**：某人這個月跟某位醫師（或流動、櫃台）最少幾診（排不下就跳過，先顧每診人數）；
 *   或「這個月以某崗位為主」（`main`，使用者 2026-10-31：照每個人的能力規劃，還不是平均分配）：一鍵排班記工作時他先拿這個崗位，不設診數。
 * 排完看偏離多少（`targetProgress`、`assignmentStatus`）；排班者可替每個目標寫一句原因。
 * 這一階段還沒接一鍵排班（第 5 階段）。伺服器（`server/data-api.ts`、`server/permissions.ts`）與畫面共用這裡的判斷。
 */

export type TrainingPurpose = "learn" | "assess" | "assign" | "other";
export const TRAINING_PURPOSES: TrainingPurpose[] = ["learn", "assess", "assign", "other"];
export const TRAINING_PURPOSE_LABELS: Record<TrainingPurpose, string> = { learn: "學習", assess: "考核", assign: "分配", other: "其他" };

export interface TrainingAssignment {
  id: string;
  personId: string;
  date: string;
  shiftId: string;
  /** 班表的工作代號（`shift-task.ts`），例如 `learn-0003`、`counter`。 */
  task: string;
  purpose: TrainingPurpose;
  note?: string;
}

export interface TrainingTarget {
  id: string;
  personId: string;
  /** 能力表的工作代號：`doctor-醫師代號`、`float`（流動）、`counter`（櫃台）。 */
  task: string;
  /** 這個月最少幾診；「為主」的目標是 0（不設診數）。 */
  minSessions: number;
  /** 這個月以這個崗位為主。 */
  main?: boolean;
  /** 沒排到時排班者寫的原因（例如人力緊繃）。 */
  reason?: string;
}

export interface TrainingPlan {
  month: string;
  /** 最後修改時間 YYYY-MM-DDTHH:mm。 */
  at: string;
  /** 最後修改的人（姓名）。 */
  by: string;
  assignments: TrainingAssignment[];
  targets: TrainingTarget[];
}

export type TrainingPlans = Record<string, TrainingPlan>;

/** 能改：最高管理者、助理長、這個月的排班負責人。 */
export const canEditTraining = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "owner" || viewer.role === "lead" || isMonthLead(viewer, lead);

/** 看得到全部：最高管理者、行政專員、助理長、這個月的負責人；其他人只看自己的。 */
export const seesAllTraining = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "lead" || seesAllOfMonth(viewer, lead);

/** 只留某個人的指定安排與目標。 */
export function trainingRowOnly(plan: TrainingPlan, personId: string | undefined): TrainingPlan {
  return {
    ...plan,
    assignments: plan.assignments.filter((item) => item.personId === personId),
    targets: plan.targets.filter((item) => item.personId === personId),
  };
}

/** 目標的工作代號（和能力表一樣）。 */
export const TARGET_TASK_PATTERN = /^(?:doctor-[0-9]{4}|float|counter)$/;

/** 班表上這一筆算不算進這個目標：跟診或學習那位醫師都算；流動 1F、2F 都算流動。 */
export function countsForTarget(target: string, task: string | undefined): boolean {
  if (!task) return false;
  if (target === "float") return task === "float-1" || task === "float-2";
  if (target === "counter") return task === "counter";
  const doctorId = target.slice("doctor-".length);
  return task === `doctor-${doctorId}` || task === `learn-${doctorId}`;
}

export interface TargetProgress {
  done: number;
  short: number;
  /** 這個月上班幾診（算「為主」的比例用）。 */
  worked: number;
  /** ok＝達到、warn＝少一點、bad＝少很多（少 2 診以上而且超過目標的四分之一）。 */
  tone: "ok" | "warn" | "bad";
}

/** 這個月班表上排了幾診、少幾診。 */
export function targetProgress(target: TrainingTarget, entries: ScheduleEntry[], month: string): TargetProgress {
  const mine = entries.filter((entry) => entry.personId === target.personId && entry.state === "shift" && entry.date.startsWith(month));
  const done = mine.filter((entry) => countsForTarget(target.task, entry.task)).length;
  const short = Math.max(0, target.minSessions - done);
  const tone = short === 0 ? "ok" : short >= 2 && short * 4 > target.minSessions ? "bad" : "warn";
  return { done, short, tone, worked: mine.length };
}

/** done＝照排了、otherTask＝有上班但做別的（或沒記工作）、off＝那天休、notScheduled＝那一診沒排他。 */
export type AssignmentStatus = "done" | "otherTask" | "off" | "notScheduled";
export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  done: "已照排",
  otherTask: "有上班，工作不同",
  off: "那天休",
  notScheduled: "還沒排",
};

export function assignmentStatus(item: TrainingAssignment, entries: ScheduleEntry[]): AssignmentStatus {
  const own = entries.filter((entry) => entry.personId === item.personId && entry.date === item.date);
  const shift = own.find((entry) => entry.state === "shift" && entry.shiftId === item.shiftId);
  if (shift) return shift.task === item.task ? "done" : "otherTask";
  return own.some((entry) => entry.state === "leave") ? "off" : "notScheduled";
}

const isText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const ID = /^[A-Za-z0-9-]{1,40}$/;
const PERSON = /^[A-Za-z0-9-]{1,64}$/;
const SHIFT = /^[a-z]{1,20}$/;

function isAssignment(value: unknown, month: string): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    isText(item.id, 40) && ID.test(String(item.id)) &&
    isText(item.personId, 64) && PERSON.test(String(item.personId)) &&
    typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date.startsWith(month) &&
    typeof item.shiftId === "string" && SHIFT.test(item.shiftId) &&
    isShiftTask(item.task) &&
    TRAINING_PURPOSES.includes(item.purpose as TrainingPurpose) &&
    (item.note === undefined || isText(item.note, 200))
  );
}

function isTarget(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    isText(item.id, 40) && ID.test(String(item.id)) &&
    isText(item.personId, 64) && PERSON.test(String(item.personId)) &&
    typeof item.task === "string" && TARGET_TASK_PATTERN.test(item.task) &&
    (item.main === undefined || item.main === true) &&
    Number.isInteger(item.minSessions) && (item.minSessions as number) >= (item.main ? 0 : 1) && (item.minSessions as number) <= 93 &&
    (item.reason === undefined || isText(item.reason, 200))
  );
}

/** 一個月的培訓清單格式（伺服器存之前檢查）。 */
export function isTrainingPlan(value: unknown, month: string): value is TrainingPlan {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.month === month &&
    isText(record.at, 40) &&
    isText(record.by, 40) &&
    Array.isArray(record.assignments) && record.assignments.length <= 300 &&
    record.assignments.every((item) => isAssignment(item, month)) &&
    Array.isArray(record.targets) && record.targets.length <= 200 &&
    record.targets.every(isTarget)
  );
}

/** 新的一筆的代號（同一份清單裡不重複就好）。 */
export const newTrainingId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
