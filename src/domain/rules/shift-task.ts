import { doctorIdsByName } from "../../config/doctors";
import type { ScheduleEntry } from "../types";

/**
 * 班表記工作（能力排班第 3 階段，使用者 2026-10-27，見 `docs/ability-plan.md` 第 4 節）：
 * 每一筆上班多記「做什麼」（`ScheduleEntry.task`，選填；沒有＝未分配）。
 * 代號：`doctor-醫師代號`＝跟那位醫師、`learn-醫師代號`＝跟那位醫師學習（新手，多出來的 1 人）、
 * `float-1`／`float-2`＝流動 1F／2F、`counter`＝櫃台、`reserve`＝預留。機動照舊用 `note`（`FLEX_SHIFT_NOTE`）。
 * 伺服器（`server/data-api.ts`）與畫面共用這裡的判斷。
 */

export const SHIFT_TASK_PATTERN = /^(?:(?:doctor|learn)-[0-9]{4}|float-1|float-2|counter|reserve)$/;

const FIXED_LABELS: Record<string, { label: string; short: string }> = {
  "float-1": { label: "流動 1F", short: "流1" },
  "float-2": { label: "流動 2F", short: "流2" },
  counter: { label: "櫃台", short: "櫃" },
  reserve: { label: "預留", short: "預" },
};

export const isShiftTask = (value: unknown): value is string => typeof value === "string" && SHIFT_TASK_PATTERN.test(value);

/** 跟診或學習的醫師代號（其他工作＝undefined）。 */
export function taskDoctorId(task: string | undefined): string | undefined {
  const found = task?.match(/^(?:doctor|learn)-([0-9]{4})$/);
  return found?.[1];
}

// 伺服器也用這個檔，只能用不經 `@/` 的設定（`doctors.ts`）。
const doctorName = (doctorId: string) =>
  Object.entries(doctorIdsByName).find(([, id]) => id === doctorId)?.[0] ?? doctorId;

/** 完整名稱，例如「跟林志明醫師」「跟林志明醫師（學習）」「流動 1F」。 */
export function taskLabel(task: string): string {
  const doctorId = taskDoctorId(task);
  if (doctorId) return `跟${doctorName(doctorId)}醫師${task.startsWith("learn-") ? "（學習）" : ""}`;
  return FIXED_LABELS[task]?.label ?? task;
}

/** 醫師全名，例如「林志明」。 */
export const doctorFullName = (doctorId: string) => doctorName(doctorId);

/** 格子裡的小字，例如「志明」「流1」「櫃」；學習（新手 +1）不加字，畫面一律字加底線（使用者 2026-10-31）。 */
export function taskShort(task: string): string {
  const doctorId = taskDoctorId(task);
  if (doctorId) return doctorName(doctorId).slice(-2);
  return FIXED_LABELS[task]?.short ?? task;
}

/** 某一診可選的工作：那一診看診的醫師（跟診、學習），再加流動、櫃台、預留。 */
export function taskOptions(doctorIds: string[]): Array<{ id: string; label: string }> {
  return [
    ...doctorIds.map((id) => `doctor-${id}`),
    ...doctorIds.map((id) => `learn-${id}`),
    ...Object.keys(FIXED_LABELS),
  ].map((id) => ({ id, label: taskLabel(id) }));
}

const DOCTOR_IDS = new Set(Object.values(doctorIdsByName));

/** 班表上某天某一診看診的醫師（醫師班依醫師班表同步在班表上）。 */
export function sessionDoctorIds(entries: ScheduleEntry[], date: string, shiftId: string): string[] {
  return entries
    .filter((entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shiftId && DOCTOR_IDS.has(entry.personId))
    .map((entry) => entry.personId);
}

/** 記的是跟某位醫師，但那位醫師這一診已經不看了（醫師班改過）：畫面標橘色提醒，不自動刪。 */
export function isStaleTask(entry: ScheduleEntry, entries: ScheduleEntry[]): boolean {
  const doctorId = taskDoctorId(entry.task);
  return !!doctorId && !!entry.shiftId && !sessionDoctorIds(entries, entry.date, entry.shiftId).includes(doctorId);
}

/** 改一筆上班的工作（undefined＝未分配）；不是上班就不動。 */
export function withTask(entry: ScheduleEntry, task: string | undefined, now = Date.now()): ScheduleEntry {
  if (entry.state !== "shift") return entry;
  const next: ScheduleEntry = { ...entry, updatedAt: now };
  if (task) next.task = task;
  else delete next.task;
  return next;
}
