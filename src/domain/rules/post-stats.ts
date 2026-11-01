import type { ScheduleEntry } from "../types";
import { taskDoctorId } from "./shift-task";
import { rolesOf, type WorkAssignments } from "./work-assignment";

/**
 * 每人每月的崗位比例（使用者 2026-10-31）：跟各位醫師、櫃台、流動、學習、沒派崗位各幾診。
 * 助理長看這張表，檢查崗位安排有沒有照每個人的能力與規劃；以後要「能力相同的人平均」也看這張。
 * 崗位以工作分配為準，沒有工作分配時用班表上記的工作（同 `rolesOf` 的用法）。只給排班的人看。
 */
export interface PostCounts {
  /** 這個月上班幾診。 */
  worked: number;
  /** 醫師代號 → 跟診幾診（不含學習）。 */
  doctors: Record<string, number>;
  counter: number;
  float: number;
  /** 學習（帶新手 +1）。 */
  learn: number;
  reserve: number;
  /** 有上班、沒派崗位（工作分配表上的「機動」）。 */
  none: number;
}

export function postCounts(
  entries: ScheduleEntry[],
  personId: string,
  month: string,
  assignments: WorkAssignments | null | undefined,
): PostCounts {
  const counts: PostCounts = { worked: 0, doctors: {}, counter: 0, float: 0, learn: 0, reserve: 0, none: 0 };
  for (const entry of entries) {
    if (entry.personId !== personId || entry.state !== "shift" || !entry.shiftId || !entry.date.startsWith(`${month}-`)) continue;
    counts.worked += 1;
    const task = rolesOf(assignments, entry.date, entry.shiftId, personId)[0] ?? entry.task;
    const doctorId = taskDoctorId(task);
    if (task?.startsWith("learn-")) counts.learn += 1;
    else if (doctorId) counts.doctors[doctorId] = (counts.doctors[doctorId] ?? 0) + 1;
    else if (task === "counter") counts.counter += 1;
    else if (task === "float-1" || task === "float-2") counts.float += 1;
    else if (task === "reserve") counts.reserve += 1;
    else counts.none += 1;
  }
  return counts;
}
