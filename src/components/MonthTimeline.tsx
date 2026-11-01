"use client";

import {
  changedOverrides,
  TIMELINE_KEYS,
  TIMELINE_LABELS,
  timelineProblems,
  type MonthTimeline as Timeline,
  type TimelineKey,
  type TimelineOverrides,
  type TimelineState,
} from "@/domain/rules/month-timeline";
import { leaveWindow } from "@/config/leave.config";
import { useState, type ReactNode } from "react";
import { addDays } from "@/domain/dates";
import type { WorkflowStepId } from "@/domain/rules/workflow";
import { fullMonthLabel, shortDate } from "./schedule-settings";
import { HelpTip } from "./HelpTip";

const STATE_TEXT: Record<TimelineState, string> = { done: "✓", now: "進行中", late: "延遲", upcoming: "" };
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const withWeekday = (date: string) => `${shortDate(date).slice(5)}（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
/** 改了會影響助理實際能申請排休時間的日期。 */
const LEAVE_KEYS: TimelineKey[] = ["longLeaveOpen", "generalOpen", "generalLast"];

/**
 * 每月排班日程卡：大家看得到這個月班表的各項日期與進度；調整過的日期標「已調整」。
 * editable（管理者、排班者）可以逐月改日期或恢復通則。
 */
export function MonthTimelineCard({
  timeline,
  states,
  overrides,
  editable,
  forAssistant,
  defaultOpen = false,
  editorOnly = false,
  onClose,
  onSave,
}: {
  timeline: Timeline;
  states: Record<TimelineKey, TimelineState>;
  overrides?: TimelineOverrides;
  editable?: boolean;
  /** 助理看的版本：不列「開始準備」。 */
  forAssistant?: boolean;
  /** 一打開就展開（工作台側欄選「班表日程」時）。 */
  defaultOpen?: boolean;
  /** 只顯示調整日期的表單（電腦版流程列按「調整日程」時），存好或取消就 onClose。 */
  editorOnly?: boolean;
  onClose?(): void;
  onSave?(overrides: TimelineOverrides): void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditingRaw] = useState<Timeline | null>(editorOnly ? { ...timeline } : null);
  const setEditing = (next: Timeline | null) => {
    setEditingRaw(next);
    if (!next && editorOnly) onClose?.();
  };
  const adjusted = Object.keys(overrides ?? {}).length > 0;
  const keys = TIMELINE_KEYS.filter((key) => !(forAssistant && key === "prepare") && key !== "generalLast");
  const problems = editing ? timelineProblems(editing) : [];

  const save = () => {
    if (!editing || problems.length > 0 || !onSave) return;
    const leaveChanged = LEAVE_KEYS.some((key) => editing[key] !== timeline[key]);
    if (leaveChanged && !window.confirm("長假或一般排休的日期有改，助理實際能申請排休的時間會跟著變。確定儲存？")) return;
    onSave(changedOverrides(timeline.month, editing, leaveWindow));
    setEditing(null);
  };

  return (
    <section className="month-timeline" aria-label={`${fullMonthLabel(timeline.month)}班表日程`}>
      {editorOnly ? (
        <p className="month-timeline-head"><strong>調整{fullMonthLabel(timeline.month)}的日程</strong></p>
      ) : (
      <button className="month-timeline-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong>{fullMonthLabel(timeline.month)}班表日程</strong>
        {adjusted && <span className="timeline-adjusted">本月已調整</span>}
        <span className="month-timeline-brief">
          {timelineBrief(timeline)}
        </span>
        <span className="month-timeline-toggle">
          <span className="month-timeline-arrow" aria-hidden>{open ? "▲" : "▼"}</span>
          {open ? "收合" : "展開"}
        </span>
      </button>
      )}
      {open && !editing && !editorOnly && (
        <>
          <ol className="month-timeline-list">
            {keys.map((key) => {
              const isGeneral = key === "generalOpen";
              const changed = overrides?.[key] !== undefined || (isGeneral && overrides?.generalLast !== undefined);
              return (
                <li key={key} className={`timeline-${states[key]}`}>
                  <span className="timeline-dot" aria-hidden />
                  <span className="timeline-body">
                    {isGeneral ? (
                      <span className="timeline-date timeline-range" aria-label={`${withWeekday(timeline.generalOpen)}到${withWeekday(timeline.generalLast)}`}>
                        <span>{withWeekday(timeline.generalOpen)}</span>
                        <span className="timeline-range-line" aria-hidden />
                        <span>{withWeekday(timeline.generalLast)}</span>
                      </span>
                    ) : (
                      <span className="timeline-date">{withWeekday(timeline[key])}</span>
                    )}
                    <span className="timeline-label">{isGeneral ? `一般排休（${leaveDays(timeline)} 天）` : TIMELINE_LABELS[key]}</span>
                    {changed && <span className="timeline-adjusted">已調整</span>}
                    {STATE_TEXT[states[key]] && <span className="timeline-state">{STATE_TEXT[states[key]]}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {editable && (
            <button className="button button-quiet" onClick={() => setEditing({ ...timeline })}>
              調整這個月的日程
            </button>
          )}
        </>
      )}
      {(open || editorOnly) && editing && (
        <div className="timeline-editor">
          {TIMELINE_KEYS.filter((key) => key !== "prepare" || !forAssistant).map((key) => (
            <label key={key}>
              {TIMELINE_LABELS[key]}
              <input
                type="date"
                value={editing[key]}
                onChange={(event) => event.target.value && setEditing({ ...editing, [key]: event.target.value })}
              />
            </label>
          ))}
          {problems.length > 0 && <p className="month-status-warn">{problems.join("；")}。</p>}
          <p className="assistant-hint help-line">
            都是日曆天。
            <HelpTip title="調整日程" guide="timeline">
              <p>只會存和通則不同的日期。</p>
              <p>改長假或一般排休的日期，助理能申請排休的時間會跟著變。</p>
            </HelpTip>
          </p>
          <span className="toolbar-actions">
            <button className="button" disabled={problems.length > 0} onClick={save}>儲存</button>
            <button className="button button-quiet" onClick={() => setEditing(null)}>取消</button>
            {adjusted && (
              <button
                className="button button-quiet"
                onClick={() => {
                  if (onSave && window.confirm("這個月的日程恢復成通則？")) {
                    onSave({});
                    setEditing(null);
                  }
                }}
              >
                恢復通則
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/**
 * 電腦版流程列每一步下面的日期（使用者 2026-10-25：日程與流程合併成一排）。
 * 排休截止＝一般排休最後一天的隔天；排班＝排休截止到預公告前一天（日程沒有另外存排班日）。
 * 這個月改過的日期旁邊標「調」。
 */
export function flowStepDates(timeline: Timeline, overrides?: TimelineOverrides): Record<WorkflowStepId, ReactNode> {
  const adjusted = (...keys: TimelineKey[]) => (keys.some((key) => overrides?.[key] !== undefined) ? <span className="timeline-adj" title="這個月調整過">調</span> : null);
  const closed = addDays(timeline.generalLast, 1);
  return {
    demand: <>{withWeekday(timeline.prepare)} 開始{adjusted("prepare")}</>,
    review: <>{withWeekday(timeline.release)} 前{adjusted("release")}</>,
    release: (
      <>
        人數發布 {withWeekday(timeline.release)}{adjusted("release")}
        <br />長假 {monthDay(timeline.longLeaveOpen)} 起{adjusted("longLeaveOpen")}
        <br />一般 <b>{monthDay(timeline.generalOpen)}～{monthDay(timeline.generalLast)}</b>{adjusted("generalOpen", "generalLast")}
      </>
    ),
    leaveClosed: <>{withWeekday(closed)} 截止{adjusted("generalLast")}</>,
    schedule: <>{monthDay(closed)}～{monthDay(addDays(timeline.preannounce, -1))}</>,
    clerkCheck: <>預公告 {monthDay(timeline.preannounce)} 前</>,
    ownerCheck: <>預公告 {monthDay(timeline.preannounce)} 前</>,
    confirm: <>預公告 {withWeekday(timeline.preannounce)}{adjusted("preannounce")}</>,
    publish: <>正式公告 {withWeekday(timeline.publish)}{adjusted("publish")}</>,
  };
}

/** 預定日期過了還沒完成（延遲）的步驟。 */
export function lateFlowSteps(states: Record<TimelineKey, TimelineState>): WorkflowStepId[] {
  const map: Array<[TimelineKey, WorkflowStepId]> = [["prepare", "demand"], ["release", "release"], ["preannounce", "clerkCheck"], ["preannounce", "ownerCheck"], ["preannounce", "confirm"], ["publish", "publish"]];
  return map.filter(([key]) => states[key] === "late").map(([, step]) => step);
}

/** 一行摘要：排休期間與正式公告日。 */
function timelineBrief(timeline: Timeline): string {
  return `排休 ${withWeekday(timeline.generalOpen)}～${withWeekday(timeline.generalLast)}・正式公告 ${withWeekday(timeline.publish)}`;
}

function leaveDays(timeline: Timeline): number {
  const day = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((day(timeline.generalLast) - day(timeline.generalOpen)) / 86_400_000) + 1;
}
