import type { SessionDemand } from "./assistant-demand";
import { TIMELINE_KEYS, type MonthTimeline, type TimelineKey, type TimelineState } from "./month-timeline";

/**
 * 總覽頁用的小計算（只看、不存資料）：
 * 每天的人力狀態（週條圓點）、班表日程的近期期限。
 */

/** closed＝沒有醫師看診；empty＝還沒排助理；short＝有一診缺人；ok＝每一診都補齊。 */
export type DayStatus = "closed" | "empty" | "short" | "ok";

/** 一天的狀態。`placed`＝每一診已排的助理（算機動、不算帶新手 +1），key 為班別 ID。 */
export function dayStatus(demands: SessionDemand[], placed: (demand: SessionDemand) => number): DayStatus {
  if (demands.length === 0) return "closed";
  if (demands.every((demand) => placed(demand) === 0)) return "empty";
  return demands.some((demand) => placed(demand) < demand.total) ? "short" : "ok";
}

/** 兩個日期（YYYY-MM-DD）相差幾天；b 比 a 晚為正。 */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface DeadlineItem {
  month: string;
  key: TimelineKey;
  date: string;
  state: TimelineState;
  /** 距今天幾天；負數＝已過。 */
  daysLeft: number;
}

/**
 * 近期期限：還沒完成、而且在 `withinDays` 天內到期（或已延遲）的日程項目，依日期排序。
 * 進行中的「開始準備」「一般排休開放」不列（要看的是下一個期限：人數發布、一般排休最後一天）。
 */
export function upcomingDeadlines(
  rows: Array<{ timeline: MonthTimeline; states: Record<TimelineKey, TimelineState> }>,
  today: string,
  withinDays: number,
): DeadlineItem[] {
  return rows
    .flatMap(({ timeline, states }) =>
      TIMELINE_KEYS.map((key) => ({
        month: timeline.month,
        key,
        date: timeline[key],
        state: states[key],
        daysLeft: daysBetween(today, timeline[key]),
      })),
    )
    .filter((item) => item.state !== "done" && (item.state === "late" || item.daysLeft <= withinDays))
    .filter((item) => !(item.state === "now" && (item.key === "prepare" || item.key === "generalOpen")))
    .sort((a, b) => a.date.localeCompare(b.date) || a.month.localeCompare(b.month));
}
