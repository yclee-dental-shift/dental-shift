import { addDays } from "../dates";

/**
 * 每月排班日程：預設依通則從班表月份往前推，每個月可以個別調整（overrides）。
 * 長假開放、一般排休開放、一般排休最後一天會決定助理實際能申請排休的時間；其他是預定日期，只用來提醒。
 */
export interface TimelineSettings {
  /** 長假開放（＝人數發布）：班表月份前幾個月的 1 日。 */
  longLeaveOpenMonthsBefore: number;
  /** 正式公告：班表月份前幾個月的 1 日。 */
  publishMonthsBefore: number;
  /** 預公告到正式公告幾天（含助理確認到隔天下班）。 */
  confirmDays: number;
  /** 排休截止後排班幾天，再預公告。 */
  schedulingDays: number;
  /** 一般排休幾天（日曆天）。 */
  generalLeaveDays: number;
  /** 開始準備醫師與人數：人數發布前幾天。 */
  prepareDaysBefore: number;
  /** 每月手動調整的日期；key 為月份。 */
  overrides?: Record<string, TimelineOverrides>;
}

export const TIMELINE_KEYS = [
  "prepare",
  "release",
  "longLeaveOpen",
  "generalOpen",
  "generalLast",
  "preannounce",
  "publish",
] as const;
export type TimelineKey = (typeof TIMELINE_KEYS)[number];
export type MonthTimeline = Record<TimelineKey, string> & { month: string };
export type TimelineOverrides = Partial<Record<TimelineKey, string>>;

export const TIMELINE_LABELS: Record<TimelineKey, string> = {
  prepare: "開始準備醫師與人數",
  release: "人數發布（預定）",
  longLeaveOpen: "長假開放",
  generalOpen: "一般排休開放",
  generalLast: "一般排休最後一天",
  preannounce: "預公告（預定）",
  publish: "正式公告（預定）",
};

function monthStart(month: string, offset: number): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 10);
}

/** 依通則算出的預設日程。 */
export function defaultTimeline(month: string, settings: TimelineSettings): MonthTimeline {
  const publish = monthStart(month, -settings.publishMonthsBefore);
  const preannounce = addDays(publish, -settings.confirmDays);
  const deadline = addDays(preannounce, -settings.schedulingDays);
  const longLeaveOpen = monthStart(month, -settings.longLeaveOpenMonthsBefore);
  return {
    month,
    prepare: addDays(longLeaveOpen, -settings.prepareDaysBefore),
    release: longLeaveOpen,
    longLeaveOpen,
    generalOpen: addDays(deadline, -settings.generalLeaveDays),
    generalLast: addDays(deadline, -1),
    preannounce,
    publish,
  };
}

/** 這個月實際的日程：預設＋手動調整。 */
export function timelineFor(month: string, settings: TimelineSettings): MonthTimeline {
  return { ...defaultTimeline(month, settings), ...settings.overrides?.[month] };
}

/** 日期順序有問題的地方（長假 ≤ 一般開放 ≤ 最後一天 < 預公告 ≤ 正式公告）。 */
export function timelineProblems(timeline: MonthTimeline): string[] {
  const problems: string[] = [];
  if (timeline.release > timeline.generalOpen) problems.push("人數發布要在一般排休開放之前");
  if (timeline.longLeaveOpen > timeline.generalOpen) problems.push("長假開放要在一般排休開放之前");
  if (timeline.generalOpen > timeline.generalLast) problems.push("一般排休最後一天不能早於開放日");
  if (timeline.generalLast >= timeline.preannounce) problems.push("預公告要在排休結束之後");
  if (timeline.preannounce > timeline.publish) problems.push("正式公告不能早於預公告");
  return problems;
}

/** 只留下和預設不同的日期。 */
export function changedOverrides(month: string, timeline: MonthTimeline, settings: TimelineSettings): TimelineOverrides {
  const base = defaultTimeline(month, settings);
  return Object.fromEntries(TIMELINE_KEYS.filter((key) => timeline[key] !== base[key]).map((key) => [key, timeline[key]]));
}

export type TimelineState = "done" | "now" | "late" | "upcoming";

/**
 * 每一項目前的狀態。done 由呼叫端依實際資料給（例如已發布、已預公告）；
 * 開放類日期依今天判斷；預定日期過了還沒完成就是延遲。
 */
export function timelineStates(
  timeline: MonthTimeline,
  today: string,
  done: { prepared: boolean; released: boolean; preannounced: boolean; published: boolean },
): Record<TimelineKey, TimelineState> {
  const planned = (date: string, finished: boolean): TimelineState =>
    finished ? "done" : today > date ? "late" : today === date ? "now" : "upcoming";
  const started = (date: string): TimelineState => (today >= date ? "done" : "upcoming");
  return {
    prepare: done.prepared ? "done" : today >= timeline.prepare ? "now" : "upcoming",
    release: planned(timeline.release, done.released),
    longLeaveOpen: started(timeline.longLeaveOpen),
    generalOpen: today > timeline.generalLast ? "done" : today >= timeline.generalOpen ? "now" : "upcoming",
    generalLast: today > timeline.generalLast ? "done" : "upcoming",
    preannounce: planned(timeline.preannounce, done.preannounced),
    publish: planned(timeline.publish, done.published),
  };
}
