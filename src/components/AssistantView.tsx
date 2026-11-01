"use client";

import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { leaveTypes } from "@/config/leave.config";
import { useLeaveWindow } from "./useLeaveWindow";
import { addDays, formatDay, nowString, todayString } from "@/domain/dates";
import { formatHours, summarizeMonth } from "@/domain/rules/labor-hours";
import {
  isPreLeave,
  monthSchedule,
  PRE_LEAVE_PREFIX,
  preLeaveDayStatus,
  preLeaveType,
  shortLongLeaveRequests,
} from "@/domain/rules/leave-window";
import { evaluateLeaveLoad, margin, shortIfOff, type SessionLeaveLoad } from "@/domain/rules/leave-demand";
import {
  canRespond,
  pendingConfirmCount,
  ISSUE_KINDS,
  respond,
  type IssueKind,
  type ScheduleIssue,
} from "@/domain/rules/publication";
import {
  dayReasonKey,
  formatReason,
  normalizeReason,
  recentReasons,
  removeReason,
  setReason,
  shiftReasonKey,
  type LeaveReasons,
} from "@/domain/rules/leave-reason";
import { requestedShiftsOn, setShiftRequest, shiftRequestOf, shiftRequestDayStatus, toggleShiftRequest } from "@/domain/rules/shift-request";
import { sessionFloorMap } from "@/domain/rules/doctor-schedule";
import { assistantLeavePhase, confirmPreLeaves, effectiveReleasedAt, needsReconfirm } from "@/domain/rules/workflow";
import { timelineFor, timelineStates } from "@/domain/rules/month-timeline";
import { MonthTimelineCard } from "./MonthTimeline";
import { useDemandApprovals } from "./useDemandApprovals";
import { useDemandAdjustments } from "./useDemandAdjustments";
import { REASON_MAX_LENGTH, reasonCategories } from "@/config/leave-reason.config";
import { findEntries } from "@/domain/schedule";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePublications } from "./usePublications";
import { useShiftRequests } from "./useShiftRequests";
import { readLeaveReasons } from "@/data/leave-reason-store";
import { readLeaveApplications } from "@/data/leave-application-store";
import {
  applicationsOf,
  applicationStatus,
  leaveApplicationKey,
  removeApplication,
  setApplication,
  withLegacyApplications,
} from "@/domain/rules/leave-application";
import { useLeaveApplications } from "./useLeaveApplications";
import { FloatingPanel } from "./DemandDayEditor";
import { ScheduleResultCard } from "./ScheduleResultCard";
import { useLaborTargets } from "./useLaborTargets";
import { scheduleResultOf } from "@/domain/rules/schedule-result";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { taskLabel } from "@/domain/rules/shift-task";
import { dutiesOf, rolesOf } from "@/domain/rules/work-assignment";
import { useWorkAssignments } from "./WorkAssignmentBoard";
import { useTrainingPlans } from "./TrainingPanel";
import { SHOW_WISH_IMPACT_TO_ASSISTANTS, targetDoctorsAt } from "@/domain/rules/training-wish";
import { MyMonthCalendar } from "./MyMonthCalendar";
import { DayScroller, scrollerDates } from "./DayScroller";
import { Segmented } from "./Segmented";
import { useLeaveReasons } from "./useLeaveReasons";
import { useViewer } from "./ViewerProvider";
import { useSchedule } from "./ScheduleProvider";
import { useDoctorSchedule } from "./useDoctorSchedule";
import { HolidayNote } from "./HolidayNote";
import { shortDoctorName } from "./DoctorSlotPicker";
import { clampMonth, doctorSessionsFor, FIRST_MONTH, fullMonthLabel, LABOR_SETTINGS, monthDates, phaseText, shiftMonth, shortDate } from "./schedule-settings";
import { HelpTip } from "./HelpTip";
import { showToast } from "./Toast";

/** 助理的四頁：我的班表 `/`、排休申請 `/my-leave`、待確認 `/my-confirm`、排班結果 `/my-results`。 */
export type AssistantTab = "schedule" | "leave" | "confirm" | "results";
const NO_SESSIONS: ReturnType<typeof doctorSessionsFor> & object = [];
type LeaveMode = "day" | "shift";
type ReasonInput = { category: string; text: string };
/** 日期視窗按「確認」時的內容：同一個做法、假別與理由套用到 dates 的每一天。 */
interface DayPlan {
  mode: LeaveMode;
  /** true＝用假（選假別、算時數）；false＝不用假（希望休息／不排）。 */
  useLeave: boolean;
  leaveType: string;
  shiftIds: string[];
  reason: ReasonInput | null;
  dates: string[];
}

const BASE_STAFFING_RULES = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
const HEAT_TEXT = { ok: "人力足夠", hot: "熱門", short: "人數不足" } as const;
const nameOf = (id: string) => courseProfile.people.find((person) => person.id === id)?.displayName ?? id;
const shiftLabelOf = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;

/** 一診的人力說明：需求、可上班人數，以及已申請排休／希望不排的同事。 */
function describeLoad(session: SessionLeaveLoad, selfId: string): string {
  const names = (ids: string[]) => ids.map((id) => (id === selfId ? "你" : nameOf(id))).join("、");
  const gap = margin(session);
  const parts = [`${shiftLabelOf(session.shiftId)}：需 ${session.needed} 人、可上班 ${session.available} 人${gap < 0 ? `（缺 ${-gap}）` : ""}`];
  if (session.onLeave.length > 0) parts.push(`排休：${names(session.onLeave)}`);
  if (session.requestedOff.length > 0) parts.push(`希望不排：${names(session.requestedOff)}`);
  return parts.join("｜");
}

const shiftOrder = (id?: string) => courseProfile.shifts.findIndex((shift) => shift.id === id);
const shortShifts = (ids: string[]) =>
  [...ids].sort((a, b) => shiftOrder(a) - shiftOrder(b)).map((id) => courseProfile.shifts[shiftOrder(id)]?.label.slice(0, 1)).join("");

/** 待確認頁的兩種看法。 */
// 我的班表：單日（週條＋當天卡片）、月曆（使用者 2026-10-25 要求）、列表（2026-11-01，取代「本月全部」）。
const SCHEDULE_VIEWS = [
  ["day", "單日"],
  ["calendar", "月曆"],
  ["list", "列表"],
] as const;

const CONFIRM_VIEWS = [
  ["list", "列表"],
  ["calendar", "月曆"],
] as const;

const AGENDA_WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/**
 * 列表（使用者 2026-11-01，照 iPhone 行事曆的列表模式）：只列有班或休假的日子，每天一個日期標題，
 * 一診一列：左邊早／午／晚色條、班別＋崗位（沒排崗位只寫班別，助理不用知道機動）、雜務小字，右邊上下班時間。
 * 打開時捲到今天（今天沒班就捲到今天之後第一天）。
 */
function MonthAgenda({ days, today }: { days: Array<{ date: string; items: ScheduleEntry[] }>; today: string }) {
  const assignments = useWorkAssignments();
  const focus = days.find(({ date }) => date >= today)?.date;
  const scrollTo = useCallback((node: HTMLElement | null) => {
    if (node && focus && focus > days[0]?.date) node.scrollIntoView({ block: "start" });
    // 只在打開列表時捲一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="month-agenda">
      {days.map(({ date, items }) => {
        const leave = items.find((entry) => entry.state === "leave");
        const monthAssignments = assignments[date.slice(0, 7)];
        return (
          <section key={date} className={`agenda-day ${date === today ? "is-today" : ""}`} ref={date === focus ? scrollTo : undefined}>
            <h3>
              {Number(date.slice(5, 7))}月{Number(date.slice(8, 10))}日 {AGENDA_WEEKDAYS[weekdayOf(date)]}
              <HolidayNote date={date} />
            </h3>
            {leave ? (
              <div className="agenda-row">
                <span className={`agenda-bar ${isPreLeave(leave) ? "tone-pre-leave" : "tone-leave"}`} aria-hidden="true" />
                <strong>{preLeaveType(leave) ? `排休・${preLeaveType(leave)}` : "休假"}</strong>
                <span className="agenda-time">整日</span>
              </div>
            ) : (
              [...items]
                .sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId))
                .map((entry) => {
                  const shift = courseProfile.shifts.find((item) => item.id === entry.shiftId);
                  const roles = rolesOf(monthAssignments, date, entry.shiftId ?? "", entry.personId);
                  const tasks = roles.length > 0 ? roles : entry.task ? [entry.task] : [];
                  const duties = dutiesOf(monthAssignments, date, entry.personId, entry.shiftId);
                  return (
                    <div className="agenda-row" key={entry.id}>
                      <span className={`agenda-bar bar-${entry.shiftId}`} aria-hidden="true" />
                      <div className="agenda-title">
                        <strong>
                          {shift?.label}
                          {tasks.length > 0 && <span className="agenda-task">・{tasks.map((task) => taskLabel(task)).join("、")}</span>}
                        </strong>
                        {duties.length > 0 && <small>雜務：{duties.map((duty) => duty.text).join("、")}</small>}
                      </div>
                      <span className="agenda-time">
                        {shift?.start}
                        <small>{shift?.end}</small>
                      </span>
                    </div>
                  );
                })
            )}
          </section>
        );
      })}
    </div>
  );
}

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** 一診的長度，例如「3 小時 40 分」。 */
function shiftLength(shiftId?: string) {
  const shift = courseProfile.shifts.find((item) => item.id === shiftId);
  if (!shift) return "";
  const minutes = toMinutes(shift.end) - toMinutes(shift.start);
  return `${Math.floor(minutes / 60)} 小時${minutes % 60 ? ` ${minutes % 60} 分` : ""}`;
}
/** 那一診看診的醫師（依醫師班表）。 */
function doctorsOn(date: string, shiftId?: string) {
  const session = doctorSessionsFor(date.slice(0, 7))?.find((item) => item.date === date && item.shiftId === shiftId);
  return session ? session.doctors.map((doctor) => shortDoctorName(doctor.personId)).join("、") : "";
}

/** 手機上「我的班表」最上面：下一班的大卡片（只看已正式公告的班）。 */
function NextShiftCard({ entry, today }: { entry: ScheduleEntry | undefined; today: string }) {
  if (!entry) return <p className="next-shift is-empty">接下來沒有已公告的班。</p>;
  const shift = courseProfile.shifts.find((item) => item.id === entry.shiftId);
  const when = entry.date === today ? "・今天" : entry.date === addDays(today, 1) ? "・明天" : "";
  const doctors = doctorsOn(entry.date, entry.shiftId);
  return (
    <div className="next-shift">
      <small>下一班{when}</small>
      <strong>
        {formatDay(entry.date)} {shift?.label}
      </strong>
      <small>
        {shift?.start}–{shift?.end}・{shiftLength(entry.shiftId)}
        {doctors && `・${doctors}`}
      </small>
      {/* 崗位（使用者 2026-10-31）；助理不用知道哪一班是補工時的機動，沒排崗位就不寫。 */}
      {entry.task && <small className="next-shift-task">{taskLabel(entry.task)}</small>}
    </div>
  );
}

/** 一天的班別：清單一列一診（小色點＋名稱＋時間），休假或排休一列。 */
function DayCards({ date, items }: { date: string; items: ScheduleEntry[] }) {
  const leave = items.find((entry) => entry.state === "leave");
  const monthAssignments = useWorkAssignments()[date.slice(0, 7)];
  return (
    <div className="day-cards" aria-live="polite">
      <h3>{formatDay(date)}<HolidayNote date={date} /></h3>
      {leave ? (
        <div className="list-group">
          <div className="list-row">
            <span className={`shift-dot ${isPreLeave(leave) ? "dot-pre-leave" : ""}`} aria-hidden="true" />
            <strong className="list-row-title">
              {preLeaveType(leave) ? "排休" : "休假"}
              {preLeaveType(leave) && <span className="leave-tag">{preLeaveType(leave)}</span>}
            </strong>
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="assistant-empty">這天沒有排班。</p>
      ) : (
        <div className="list-group">
          {[...items]
            .sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId))
            .map((entry) => {
              const shift = courseProfile.shifts.find((item) => item.id === entry.shiftId);
              const roles = rolesOf(monthAssignments, date, entry.shiftId ?? "", entry.personId);
              const tasks = roles.length > 0 ? roles : entry.task ? [entry.task] : [];
              const duties = dutiesOf(monthAssignments, date, entry.personId, entry.shiftId);
              return (
                <div className="list-row" key={entry.id}>
                  <span className={`shift-dot dot-${entry.shiftId}`} aria-hidden="true" />
                  <strong className="list-row-title">{shift?.label}</strong>
                  <span className="list-row-value">{shift?.start}–{shift?.end}</span>
                  {/* 崗位與雜務（使用者 2026-10-30：助理自己的頁面要看得到）。 */}
                  {/* 助理不用知道哪一班是補工時的機動（使用者 2026-10-31），沒排崗位就不寫。 */}
                  {tasks.length > 0 && <span className="day-card-task">{tasks.map((task) => taskLabel(task)).join("、")}</span>}
                  {duties.length > 0 && <span className="day-card-duty">雜務：{duties.map((duty) => duty.text).join("、")}</span>}
                  <small className="day-card-extra">
                    {shiftLength(entry.shiftId)}
                    {doctorsOn(date, entry.shiftId) && `・${doctorsOn(date, entry.shiftId)}`}
                  </small>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/**
 * 日期帶：點日期看當天班別；色點＝早／午／晚，灰點＝休假。
 * 可以連續左右捲動（使用者 2026-10-26 要求，`DayScroller`），2027/1/1 到選定那天（或今天）往後半年。
 */
function WeekStrip({
  day,
  today,
  itemsOf,
  onPick,
}: {
  day: string;
  today: string;
  itemsOf(date: string): ScheduleEntry[] | null;
  onPick(date: string): void;
}) {
  const last = day > today ? day : today;
  const dates = useMemo(() => scrollerDates(`${FIRST_MONTH}-01`, last, 6), [last]);
  return (
    <DayScroller
      dates={dates}
      selected={day}
      className="week-strip"
      daysClassName="week-days"
      navClassName="week-nav"
      label="選擇日期（可左右捲動）"
      renderDay={(date, near) => {
        const items = near ? itemsOf(date) : null;
        const leave = items?.find((entry) => entry.state === "leave");
        return (
          <button
            key={date}
            role="tab"
            aria-selected={date === day}
            className={`week-day ${date === day ? "is-active" : ""} ${date < `${FIRST_MONTH}-01` ? "is-out" : ""}`}
            disabled={date < `${FIRST_MONTH}-01`}
            onClick={() => onPick(date)}
          >
            <small>{WEEKDAY_CHARS[weekdayOf(date)]}</small>
            <strong>{Number(date.slice(8, 10))}</strong>
            <span className="week-dots" aria-hidden="true">
              {leave ? (
                <i className={isPreLeave(leave) ? "tone-pre-leave" : "tone-leave"} />
              ) : (
                [...(items ?? [])]
                  .sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId))
                  .map((entry) => <i key={entry.id} className={`shift-${entry.shiftId}`} />)
              )}
            </span>
          </button>
        );
      }}
    />
  );
}

function MonthPicker({ month, onChange }: { month: string; onChange(month: string): void }) {
  return (
    <div className="assistant-month">
      <button className="button button-quiet" disabled={month <= FIRST_MONTH} onClick={() => onChange(shiftMonth(month, -1))}>←</button>
      <strong>{fullMonthLabel(month)}</strong>
      <button className="button button-quiet" onClick={() => onChange(shiftMonth(month, 1))}>→</button>
    </div>
  );
}

/** 事由：先選大項目，再點常用事由或自己輸入事由內容。 */
function ReasonForm({
  category,
  text,
  recent,
  warn,
  onChange,
}: {
  category: string;
  text: string;
  recent: Array<{ category: string; text: string }>;
  warn: boolean;
  onChange(category: string, text: string): void;
}) {
  const quick = reasonCategories.find((item) => item.id === category)?.quick ?? [];
  const signedIn = useViewer().member !== null;
  return (
    <div className={`reason-form ${warn ? "is-warn" : ""}`}>
      <span className="reason-row" role="group" aria-label="事由大項目">
        <strong>事由</strong>
        {reasonCategories.map((item) => (
          <button
            key={item.id}
            className={`button button-quiet ${category === item.id ? "is-active" : ""}`}
            aria-pressed={category === item.id}
            onClick={() => onChange(item.id, text)}
          >
            {item.id}
          </button>
        ))}
      </span>
      {(quick.length > 0 || recent.length > 0) && (
        <span className="reason-row reason-quick" role="group" aria-label="常用事由">
          {quick.map((phrase) => (
            <button key={phrase} className="reason-chip" disabled={!category} onClick={() => onChange(category, phrase)}>
              {phrase}
            </button>
          ))}
          {recent.map((item) => (
            <button
              key={formatReason(item)}
              className="reason-chip is-recent"
              title="最近填過"
              onClick={() => onChange(item.category, item.text)}
            >
              {item.text}
            </button>
          ))}
        </span>
      )}
      <label className="reason-text">
        事由內容
        <input
          value={text}
          maxLength={REASON_MAX_LENGTH}
          placeholder="例如：小孩6點下課"
          onChange={(event) => onChange(category, event.target.value)}
        />
      </label>
      {warn && <p className="month-status-warn">請先選大項目並填寫事由內容。</p>}
      <p className="assistant-hint">
        管理者會參考事由決定能否配合。只有你和管理者看得到{signedIn ? "。" : "（目前為模擬身分，尚未登入保護）。"}
      </p>
    </div>
  );
}

/** 這種做法的說明。 */
const PLAN_HINT: Record<`${LeaveMode}_${boolean}`, string> = {
  day_true: "請假一天，算 8 小時工時。",
  day_false: "不扣假，當作休息日；管理者盡量配合，人力不足時仍可能排班，工時會排在別天。",
  shift_true: "這一診請假，算那一診的工時；一鍵排班不會排這一診。",
  shift_false: "不扣假，只是希望不排；管理者盡量配合，人力不足時仍可能排班。",
};

/** 點日期後跳出的視窗：先選整天或指定診次、用假或不用假，再選假別、事由，可一起套用到其他天。 */
function DayLeaveEditor({
  date,
  currentText,
  currentWarn,
  hasCurrent,
  initial,
  dayLeaveAllowed,
  requestAllowed,
  lockedReason,
  requestBlockedReason,
  openShiftIds,
  loadLines,
  candidates,
  reasonsEnabled,
  initialReason,
  recent,
  onSave,
  onClear,
  onClose,
}: {
  date: string;
  /** 這天目前的申請（文字）；沒有則為空字串。 */
  currentText: string;
  /** 目前的申請有沒排入的部分（紅字）。 */
  currentWarn: boolean;
  hasCurrent: boolean;
  initial: { mode: LeaveMode; useLeave: boolean; leaveType: string; shiftIds: string[] };
  /** 整天・用假可以登記（長假登記或一般排休期間）。 */
  dayLeaveAllowed: boolean;
  /** 指定診次與不用假可以登記（一般排休期間）。 */
  requestAllowed: boolean;
  /** 不能修改時的原因（例如不在排休申請期間）。 */
  lockedReason: string;
  requestBlockedReason: string;
  openShiftIds: string[];
  loadLines: string[];
  /** 可以一起套用的其他日期（整天用假，或其他做法）。 */
  candidates(dayLeave: boolean): string[];
  reasonsEnabled: boolean;
  initialReason?: ReasonInput;
  recent: Array<{ category: string; text: string }>;
  onSave(plan: DayPlan): void;
  onClear(): void;
  onClose(): void;
}) {
  const [mode, setMode] = useState<LeaveMode>(initial.mode);
  const [useLeave, setUseLeave] = useState(initial.useLeave);
  const [leaveType, setLeaveType] = useState<string>(initial.leaveType);
  const [shiftIds, setShiftIds] = useState<string[]>(initial.shiftIds);
  const [category, setCategory] = useState(initialReason?.category ?? "");
  const [text, setText] = useState(initialReason?.text ?? "");
  const [warn, setWarn] = useState(false);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [showOthers, setShowOthers] = useState(false);
  const editable = dayLeaveAllowed || requestAllowed;
  const dayLeave = mode === "day" && useLeave;
  const others = candidates(dayLeave).filter((day) => day !== date);
  const reason = normalizeReason(category, text);
  const allowed = dayLeave ? dayLeaveAllowed : requestAllowed;
  const save = () => {
    if (reasonsEnabled && !reason) return setWarn(true);
    if (mode === "shift" && shiftIds.length === 0) return window.alert("請選哪一診。");
    onSave({ mode, useLeave, leaveType, shiftIds, reason, dates: [date, ...extraDates.filter((day) => others.includes(day))] });
  };
  const toggle = <T extends string | boolean>(
    label: string,
    options: ReadonlyArray<readonly [T, string]>,
    value: T,
    onPick: (next: T) => void,
  ) => (
    <span className="view-toggle leave-mode" role="group" aria-label={label}>
      {options.map(([id, optionLabel]) => (
        <button
          key={String(id)}
          className={`button button-quiet ${value === id ? "is-active" : ""}`}
          aria-pressed={value === id}
          onClick={() => {
            onPick(id);
            setExtraDates([]);
          }}
        >
          {optionLabel}
        </button>
      ))}
    </span>
  );
  return (
    <div className="day-popover leave-editor" role="dialog" aria-label={`${formatDay(date)}排休`}>
      <div className="day-popover-head">
        <strong>{formatDay(date)}<HolidayNote date={date} /></strong>
        <button className="link-button" onClick={onClose}>關閉</button>
      </div>
      {hasCurrent && <p className={`leave-editor-current ${currentWarn ? "is-unplaced" : ""}`}>目前：{currentText}</p>}
      {loadLines.length > 0 && (
        <div className="day-popover-detail">
          {loadLines.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
      {!editable ? (
        <p className="assistant-hint">{lockedReason}，不能修改。</p>
      ) : (
        <>
          {toggle("整天或指定診次", [["day", "整天"], ["shift", "指定診次"]] as const, mode, setMode)}
          {toggle("要不要用假", [[true, "用假"], [false, "不用假（希望休）"]] as const, useLeave, setUseLeave)}
          {!allowed ? (
            <p className="month-status-warn">{dayLeave ? lockedReason : requestBlockedReason}。</p>
          ) : (
            <>
              {mode === "shift" && (
                <span className="shift-request-options" role="group" aria-label="哪一診">
                  {courseProfile.shifts
                    .filter((shift) => openShiftIds.includes(shift.id))
                    .map((shift) => {
                      const picked = shiftIds.includes(shift.id);
                      return (
                        <button
                          key={shift.id}
                          className={`button button-quiet ${picked ? "is-active" : ""}`}
                          aria-pressed={picked}
                          onClick={() => setShiftIds(picked ? shiftIds.filter((id) => id !== shift.id) : [...shiftIds, shift.id])}
                        >
                          {shift.label}
                        </button>
                      );
                    })}
                </span>
              )}
              {useLeave && (
                <label className="assistant-type">
                  假別
                  <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
                    {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              )}
              <p className="assistant-hint">{PLAN_HINT[`${mode}_${useLeave}`]}</p>
              {reasonsEnabled ? (
                <ReasonForm
                  category={category}
                  text={text}
                  recent={recent}
                  warn={warn && !reason}
                  onChange={(nextCategory, nextText) => {
                    setCategory(nextCategory);
                    setText(nextText);
                  }}
                />
              ) : (
                <p className="assistant-hint">只記假別。</p>
              )}
              {others.length > 0 && (
                <div className="apply-others">
                  <button className="link-button" aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)}>
                    {showOthers ? "收起其他天" : "也套用到其他天"}
                    {extraDates.length > 0 && `（已選 ${extraDates.length} 天）`}
                  </button>
                  {showOthers && (
                    <span className="apply-others-days" role="group" aria-label="也套用到其他天">
                      {others.map((day) => {
                        const picked = extraDates.includes(day);
                        return (
                          <button
                            key={day}
                            className={`reason-chip ${picked ? "is-active" : ""}`}
                            aria-pressed={picked}
                            onClick={() => setExtraDates(picked ? extraDates.filter((item) => item !== day) : [...extraDates, day])}
                          >
                            {Number(day.slice(8, 10))}（{WEEKDAY_CHARS[weekdayOf(day)]}）
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
              )}
              <span className="workflow-actions">
                <button className="button leave-button" onClick={save}>
                  確認{extraDates.length > 0 ? `（共 ${extraDates.length + 1} 天）` : ""}
                </button>
              </span>
            </>
          )}
          {hasCurrent && (
            <span className="workflow-actions">
              <button className="button button-quiet" onClick={onClear}>取消這天的申請</button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** 助理（模擬身分）看到的頁面：只有自己的資料。 */
export function AssistantView({ person, tab }: { person: CoursePerson; tab: AssistantTab }) {
  const { entries, saveLeave, clearEntry } = useSchedule();
  const { member } = useViewer();
  const trainingPlans = useTrainingPlans();
  /** 這幾診裡，自己這個月培訓目標要跟的醫師（一診一筆醫師代號；使用者 2026-10-31：登記希望不排時提醒，字要少）。 */
  const targetConflicts = (date: string, shiftIds: string[]) =>
    (SHOW_WISH_IMPACT_TO_ASSISTANTS ? shiftIds : []).flatMap((shiftId) => {
      const session = doctorSessionsFor(date.slice(0, 7))?.find((item) => item.date === date && item.shiftId === shiftId);
      const here = session ? session.doctors.map((doctor) => doctor.personId) : [];
      return targetDoctorsAt(trainingPlans[date.slice(0, 7)]?.targets ?? [], person.id, here).map((doctorId) => ({ shiftId, doctorId }));
    });
  /** 「希望不排會少 志明醫師 2 診、美玲醫師 1 診」。 */
  const conflictSummary = (items: Array<{ doctorId: string }>) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.doctorId, (counts.get(item.doctorId) ?? 0) + 1);
    return `希望不排會少 ${[...counts].map(([doctorId, count]) => `${shortDoctorName(doctorId)}醫師 ${count} 診`).join("、")}（培訓目標）`;
  };
  // 排休時程＝通則＋每月排班日程的調整。
  const { settings: leaveWindow } = useLeaveWindow();
  const today = todayString();
  const [scheduleMonth, setScheduleMonth] = useState(() => clampMonth(today.slice(0, 7)));
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [scheduleView, setScheduleView] = useState<(typeof SCHEDULE_VIEWS)[number][0]>("day");
  // 每診人數發布後、而且日期到了，助理才能申請排休。
  const { approvals, saveDemandApproval } = useDemandApprovals();
  // 預約發布到「人數發布」日也算發布。
  const isReleased = (month: string) => !!effectiveReleasedAt(approvals[month], today, timelineFor(month, leaveWindow).release);
  const [leaveMonth, setLeaveMonth] = useState(() => {
    // 預設跳到目前可以申請排休的最近月份。
    for (let offset = 0; offset <= leaveWindow.longLeaveOpenMonthsBefore; offset += 1) {
      const month = shiftMonth(today.slice(0, 7), offset);
      if (month < FIRST_MONTH) continue;
      const phase = assistantLeavePhase(monthSchedule(month, today, leaveWindow).phase, isReleased(month));
      if (phase === "open" || phase === "longLeaveOnly") return month;
    }
    return clampMonth(shiftMonth(today.slice(0, 7), leaveWindow.publishMonthsBefore + 1));
  });
  // 點日期打開的視窗（anchor＝那一天的按鈕）。
  const [editDay, setEditDay] = useState<{ date: string; anchor: HTMLElement } | null>(null);
  const closeEditor = useCallback(() => setEditDay(null), []);
  const { requests, saveShiftRequests } = useShiftRequests();
  const { reasons, saveLeaveReasons, enabled: reasonsEnabled } = useLeaveReasons();
  // 排休申請紀錄：管理者改班表不會刪除；班表上沒有排休的標「未排入」。
  const { stored: storedApplications, saveLeaveApplications } = useLeaveApplications();
  const applications = useMemo(() => withLegacyApplications(storedApplications, entries), [storedApplications, entries]);
  const myApplicationOn = (date: string) => applications[leaveApplicationKey(date, person.id)];
  const myRecentReasons = recentReasons(reasons, person.id);
  // 依診所行事曆：沒有醫師看診的日子（休診、未開診的週六等）不能申請排休。
  // 醫師班表改了就重畫；doctorSessionsFor 有快取，同一份設定回傳同一個陣列。
  const doctorConfig = useDoctorSchedule();
  // 人數規則＋單日指定樓層。
  const staffingRules = useMemo(() => ({ ...BASE_STAFFING_RULES, sessionFloors: sessionFloorMap(doctorConfig) }), [doctorConfig]);
  const sessions = doctorSessionsFor(leaveMonth) ?? NO_SESSIONS;
  const CLOSED = useMemo(() => {
    const open = new Set(sessions.map((session) => session.date));
    return new Set(monthDates(leaveMonth).filter((date) => !open.has(date)));
  }, [sessions, leaveMonth]);
  const mine = entries.filter((entry) => entry.personId === person.id);
  // 排休熱門度：所有助理的排休與指定不排都算進來，人數不足時由助理自行協調。
  const { adjustments } = useDemandAdjustments();
  const leaveLoads = useMemo(
    () =>
      new Map(
        evaluateLeaveLoad(entries, courseProfile.people, sessions, requests, staffingRules, adjustments).map((day) => [day.date, day]),
      ),
    [entries, sessions, requests, adjustments, staffingRules],
  );
  const busyDays = [...leaveLoads.values()].filter((day) => day.heat !== "ok");
  const { publications, publicationOf, savePublication } = usePublications();
  const now = nowString();
  const daysOf = (month: string) =>
    monthDates(month)
      .map((date) => ({ date, items: findEntries(mine, date, person.id) }))
      .filter((day) => day.items.length > 0);
  const scheduleStatus = publicationOf(scheduleMonth).status;
  const pendingMonths = Object.values(publications)
    .filter((publication) => publication.status === "preannounced")
    .sort((a, b) => a.month.localeCompare(b.month));
  const [draftIssues, setDraftIssues] = useState<ScheduleIssue[]>([]);
  // 排班結果：每月申請了什麼、實際怎麼排、工時多少（班表預公告後才看得到）。
  const { targets: laborTargets } = useLaborTargets();
  const [resultMonth, setResultMonth] = useState(() => clampMonth(today.slice(0, 7)));
  const resultOf = (month: string) =>
    scheduleResultOf({
      entries,
      applications,
      requests,
      personId: person.id,
      month,
      settings: LABOR_SETTINGS,
      flexNote: FLEX_SHIFT_NOTE,
      targetOverride: laborTargets[month],
    });
  // 待確認的班表：清單（每天一列）或月曆。
  const [confirmView, setConfirmView] = useState<(typeof CONFIRM_VIEWS)[number][0]>("list");
  const [issueDate, setIssueDate] = useState("");
  const [issueShift, setIssueShift] = useState("");
  const [issueKind, setIssueKind] = useState<IssueKind>(ISSUE_KINDS[0]);

  const scheduleDays = daysOf(scheduleMonth);
  // 週條：預設今天；今天不在這個月就選這個月第一個有班的日子。
  const scheduleDay =
    pickedDay?.startsWith(scheduleMonth)
      ? pickedDay
      : today.startsWith(scheduleMonth)
        ? today
        : scheduleDays[0]?.date ?? `${scheduleMonth}-01`;
  const pickDay = (date: string) => {
    setPickedDay(date);
    setScheduleMonth(clampMonth(date.slice(0, 7)));
  };
  // 只有正式公告的月份才顯示班別。
  const publishedItemsOf = (date: string) =>
    publicationOf(date.slice(0, 7)).status === "published" ? findEntries(mine, date, person.id) : null;
  const pendingCount = pendingConfirmCount(pendingMonths, person.id, now);
  const summary = summarizeMonth(entries, person.id, scheduleMonth, LABOR_SETTINGS, requests);
  // 下一班：已正式公告、還沒結束的第一診。
  const nextShift = mine
    .filter((entry) => {
      const end = courseProfile.shifts.find((shift) => shift.id === entry.shiftId)?.end;
      return entry.state === "shift" && !!end && publicationOf(entry.date.slice(0, 7)).status === "published" && `${entry.date}T${end}` > now;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || shiftOrder(a.shiftId) - shiftOrder(b.shiftId))[0];
  // 排休日曆的記號說明（手機上點 ⓘ 打開）。
  const [legendOpen, setLegendOpen] = useState(false);

  const dateLeaveInfo = monthSchedule(leaveMonth, today, leaveWindow);
  const leaveReleased = isReleased(leaveMonth);
  const leaveApproval = approvals[leaveMonth];
  const leaveInfo = { ...dateLeaveInfo, phase: assistantLeavePhase(dateLeaveInfo.phase, leaveReleased) };
  // 日期到了但人數還沒發布：先不開放，也不顯示熱門度。
  const waitingRelease = !leaveReleased && dateLeaveInfo.phase !== "notOpen" && dateLeaveInfo.phase !== "closed";
  // 管理者暫停排休：不能新增或取消，已登記的保留。
  const leavePaused = leaveReleased && !!leaveApproval?.leavePausedAt && dateLeaveInfo.phase !== "closed";
  const leaveBlocked = waitingRelease || leavePaused;
  const myPreLeaves = mine.filter((entry) => isPreLeave(entry) && entry.date.startsWith(leaveMonth));
  const myApplications = applicationsOf(applications, person.id, leaveMonth);
  const tooShort =
    leaveInfo.phase === "longLeaveOnly" &&
    shortLongLeaveRequests(mine, leaveMonth, leaveWindow.longLeaveMinDays).includes(person.id);

  const myRequestDays = monthDates(leaveMonth)
    .map((date) => ({
      date,
      requests: requestedShiftsOn(requests, date, person.id)
        .sort((a, b) => shiftOrder(a) - shiftOrder(b))
        .map((shiftId) => shiftRequestOf(requests, date, person.id, shiftId)!),
    }))
    .filter((day) => day.requests.length > 0);
  const reasonOf = (key: string) => (reasonsEnabled && reasons[key] ? `（${reasons[key].text}）` : "");
  // 指定診次不排的開放條件；這天自己的整天排休不擋（可改成指定診次）。
  const requestStatusOf = (date: string) =>
    shiftRequestDayStatus(
      entries.filter((entry) => !(entry.personId === person.id && entry.date === date && isPreLeave(entry))),
      person.id,
      date,
      today,
      leaveWindow,
      CLOSED,
    );
  const requestBlockedReason =
    dateLeaveInfo.phase === "longLeaveOnly"
      ? `長假登記期間只能「整天・用假」；指定診次與不用假在 ${shortDate(dateLeaveInfo.generalOpen)} 一般排休開放後才能登記`
      : "";
  /** 自己某天的「希望不排／診次請假」，依診的順序。 */
  const myRequestsOn = (date: string) =>
    requestedShiftsOn(requests, date, person.id)
      .sort((a, b) => shiftOrder(a) - shiftOrder(b))
      .map((shiftId) => shiftRequestOf(requests, date, person.id, shiftId)!);
  const scheduledOn = (date: string, shiftId: string) =>
    mine.some((entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shiftId);
  /** 一天的申請怎麼顯示：整天排休（含狀態）、希望整天休、診次請假、希望不排。 */
  const describeDay = (date: string) => {
    const application = myApplicationOn(date);
    const parts: Array<{ text: string; short: string; warn: boolean }> = [];
    if (application) {
      const status = applicationStatus(application, entries);
      parts.push({
        text: `排休（${application.leaveType}）${status === "placed" ? "・已排入班表" : status === "rest" ? "・管理者改成休息日，不扣假" : "・未排入班表（管理者尚未同意，申請仍保留）"}`,
        short: `${application.leaveType}${status === "rest" ? "→休" : status === "unplaced" ? "・未排入" : ""}`,
        warn: status === "unplaced",
      });
    }
    const own = myRequestsOn(date);
    const open = openShiftsOn(date);
    const wishes = own.filter((request) => !request.leaveType);
    const leaves = own.filter((request) => request.leaveType);
    if (wishes.length > 0 && leaves.length === 0 && open.length > 0 && open.every((id) => wishes.some((request) => request.shiftId === id))) {
      parts.push({ text: "希望整天休（不用假）", short: "希望休", warn: false });
    } else if (wishes.length > 0) {
      parts.push({ text: `希望不排${shortShifts(wishes.map((request) => request.shiftId))}（不用假）`, short: `不排${shortShifts(wishes.map((request) => request.shiftId))}`, warn: false });
    }
    leaves.forEach((request) => {
      const label = shortShifts([request.shiftId]);
      const unplaced = scheduledOn(date, request.shiftId);
      parts.push({
        text: `${label}診請假（${request.leaveType}）${unplaced ? "・未排入班表（申請仍保留）" : request.restInstead ? "・管理者改成休息，不扣假" : ""}`,
        short: `${label}請${request.leaveType!.slice(0, 1)}${unplaced ? "・未排入" : request.restInstead ? "→休" : ""}`,
        warn: unplaced,
      });
    });
    return parts;
  };

  // 管理者重新發布或恢復排休時選「請助理重新確認」：列出原本的排休，人數不足的日子要先改掉才能確認。
  const reconfirmDays = myPreLeaves
    .map((entry) => {
      const day = leaveLoads.get(entry.date);
      return { date: entry.date, type: preLeaveType(entry), short: day ? shortIfOff(day, person.id).length > 0 : false };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const reconfirmShort = reconfirmDays.filter((day) => day.short);
  const reconfirmBox = needsReconfirm(leaveApproval, person.id) && reconfirmDays.length > 0 && leaveInfo.phase !== "closed" && (
    <div className="reconfirm-box" role="alert">
      <strong>請重新確認你原本的排休</strong>
      <span>管理者重新發布了這個月的人數，請確認原本的排休要保留或修改。</span>
      <ul>
        {reconfirmDays.map((day) => (
          <li key={day.date} className={day.short ? "is-short" : ""}>
            {formatDay(day.date)}（{day.type}）{day.short ? "：人數不足，請點日曆上這天取消，或改到別天" : "：可以保留"}
          </li>
        ))}
      </ul>
      {reconfirmShort.length > 0 && <span className="month-status-warn">還有 {reconfirmShort.length} 天人數不足，改好後才能確認。</span>}
      <button
        className="button"
        disabled={reconfirmShort.length > 0}
        title={reconfirmShort.length > 0 ? "請先改掉人數不足的日子" : ""}
        onClick={() => leaveApproval && saveDemandApproval(confirmPreLeaves(leaveApproval, person.id))}
      >
        確認保留這些排休
      </button>
    </div>
  );

  const heatClass = (date: string) => {
    const heat = leaveLoads.get(date)?.heat;
    return heat ? `heat-${heat}` : "";
  };
  const heatLabel = (date: string) => {
    const heat = leaveLoads.get(date)?.heat;
    return heat && heat !== "ok" ? `（${HEAT_TEXT[heat]}）` : "";
  };
  const openShiftsOn = (date: string) => sessions.filter((session) => session.date === date).map((session): string => session.shiftId);
  /** 可以一起套用的日期：同月、同一種做法可以登記的日子。 */
  const candidateDates = (dayLeave: boolean) =>
    monthDates(leaveMonth).filter((date) =>
      dayLeave
        ? preLeaveDayStatus(entries, person.id, date, today, leaveWindow, CLOSED).editable
        : requestStatusOf(date).editable && openShiftsOn(date).length > 0,
    );

  /** 清掉自己某天的排休申請（含班表上的排休）、希望不排與理由；回傳新的登記與理由。 */
  async function clearDay(date: string, nextRequests: typeof requests, nextReasons: LeaveReasons | null) {
    if (myApplicationOn(date)) {
      if (findEntries(mine, date, person.id).some(isPreLeave)) await clearEntry(date, person.id);
      saveLeaveApplications(removeApplication(readLeaveApplications(), date, person.id));
      if (nextReasons) nextReasons = removeReason(nextReasons, dayReasonKey(date, person.id));
    }
    for (const shiftId of requestedShiftsOn(nextRequests, date, person.id)) {
      nextRequests = toggleShiftRequest(nextRequests, date, person.id, shiftId, now);
      if (nextReasons) nextReasons = removeReason(nextReasons, shiftReasonKey(date, person.id, shiftId));
    }
    return { nextRequests, nextReasons };
  }

  /** 日期視窗按「確認」：列出要存的日子與提醒（已有排班、人數不足），同意後直接存好。 */
  async function saveDayPlan(plan: DayPlan) {
    const dates = [...plan.dates].sort();
    const dayLeave = plan.mode === "day" && plan.useLeave;
    // 「希望整天休」＝那天每一診都登記不排。
    const shiftsOf = (date: string) => (plan.mode === "day" ? openShiftsOn(date) : plan.shiftIds.filter((id) => openShiftsOn(date).includes(id)));
    const describe = (date: string) =>
      `${formatDay(date)}：${
        dayLeave
          ? `排休（${plan.leaveType}）`
          : plan.mode === "day"
            ? "希望整天休（不用假）"
            : plan.useLeave
              ? `${shortShifts(shiftsOf(date))}診請假（${plan.leaveType}）`
              : `希望不排${shortShifts(shiftsOf(date))}（不用假）`
      }`;
    const warnings = dates.flatMap((date) => {
      const day = leaveLoads.get(date);
      const short = (day ? shortIfOff(day, person.id) : []).filter(
        (session) => shiftsOf(date).includes(session.shiftId),
      );
      const hasShifts = dayLeave && preLeaveDayStatus(entries, person.id, date, today, leaveWindow, CLOSED).hasShifts;
      return [
        ...(hasShifts ? [`${formatDay(date)} 已經有排班，排休會取代這些班。`] : []),
        ...(short.length > 0
          ? [`${formatDay(date)} 加上你之後會人數不足：${short.map((session) => describeLoad(session, person.id)).join("；")}`]
          : []),
      ];
    });
    const conflicts = plan.useLeave ? [] : dates.flatMap((date) => targetConflicts(date, shiftsOf(date)));
    const message = [
      dates.length > 1 ? `確認以下 ${dates.length} 天？` : "確認？",
      ...dates.map((date) => `・${describe(date)}`),
      ...(conflicts.length > 0 ? ["", conflictSummary(conflicts)] : []),
      ...(warnings.length > 0 ? ["", "請注意：", ...warnings, "人數不足請先自行與同事協調。"] : []),
    ].join("\n");
    if (!window.confirm(message)) return;
    let nextRequests = requests;
    let nextReasons = reasonsEnabled ? readLeaveReasons() : null;
    for (const date of dates) {
      // 先清掉這天原本的申請，再存新的（整天排休與指定診次不排不會同時存在）。
      ({ nextRequests, nextReasons } = await clearDay(date, nextRequests, nextReasons));
      if (dayLeave) {
        await saveLeave(date, person.id, `${PRE_LEAVE_PREFIX}${plan.leaveType}`);
        saveLeaveApplications(setApplication(readLeaveApplications(), date, person.id, plan.leaveType, now));
        if (nextReasons && plan.reason) {
          nextReasons = setReason(nextReasons, dayReasonKey(date, person.id), { personId: person.id, date, ...plan.reason }, now);
        }
        continue;
      }
      for (const shiftId of shiftsOf(date)) {
        nextRequests = setShiftRequest(nextRequests, date, person.id, shiftId, now, plan.useLeave ? plan.leaveType : undefined);
        if (nextReasons && plan.reason) {
          nextReasons = setReason(nextReasons, shiftReasonKey(date, person.id, shiftId), { personId: person.id, date, ...plan.reason }, now);
        }
      }
    }
    if (nextRequests !== requests) saveShiftRequests(nextRequests);
    if (nextReasons) saveLeaveReasons(nextReasons);
    setEditDay(null);
    // 存好了要說一聲（使用者 2026-11-01）：原本視窗關掉就沒了，看不出有沒有存
    showToast(dates.length > 1 ? `已登記 ${dates.length} 天` : `已登記 ${formatDay(dates[0])}`);
  }

  async function clearDayPlan(date: string) {
    const what = describeDay(date).map((part) => part.text.split("・")[0]).join("、");
    if (!window.confirm(`取消 ${formatDay(date)} 的${what}？`)) return;
    const { nextRequests, nextReasons } = await clearDay(date, requests, reasonsEnabled ? readLeaveReasons() : null);
    if (nextRequests !== requests) saveShiftRequests(nextRequests);
    if (nextReasons) saveLeaveReasons(nextReasons);
    setEditDay(null);
    showToast(`已取消 ${formatDay(date)} 的${what}`);
  }

  return (
    <main className="page-shell assistant-shell">
      <section className="hero-row">
        <div>
          <p className="eyebrow">{member ? "助理頁面" : "助理頁面（模擬身分）"}</p>
          <h1>{person.displayName}</h1>
          <p>只看得到自己的班表與排休。</p>
        </div>
      </section>

      {tab === "schedule" && (
        <div className="assistant-home">
          {pendingCount > 0 && (
            <Link className="todo-banner" href="/my-confirm">
              <span>
                <strong>{pendingCount} 份班表待確認</strong>
                <small>逾期未回覆視同接受</small>
              </span>
              去確認 ›
            </Link>
          )}
          <NextShiftCard entry={nextShift} today={today} />
        </div>
      )}

      {tab === "schedule" && (
        <section className="assistant-card">
          <MonthPicker month={scheduleMonth} onChange={(month) => { setScheduleMonth(month); setPickedDay(null); }} />
          <p className="assistant-summary">
            本月 {formatHours(summary.workedMinutes)} 小時
            {summary.normalCapMinutes !== undefined && `／上限 ${formatHours(summary.normalCapMinutes)} 小時`}・休 {summary.restDays} 天
          </p>
          {summary.normalCapMinutes ? (
            <span className="hours-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (summary.workedMinutes / summary.normalCapMinutes) * 100)}%` }} />
            </span>
          ) : null}
          {scheduleStatus !== "published" ? (
            <p className="assistant-empty">
              {scheduleStatus === "preannounced"
                ? "這個月的班表正在預公告，請到「待確認」查看並確認。"
                : "這個月的班表尚未公告。"}
            </p>
          ) : (
            <>
              <Segmented options={SCHEDULE_VIEWS} value={scheduleView} onChange={setScheduleView} label="班表檢視方式" className="schedule-view-toggle" />
              {scheduleView === "calendar" ? (
                <MyMonthCalendar
                  month={scheduleMonth}
                  entries={mine.filter((entry) => entry.date.startsWith(scheduleMonth))}
                  today={today}
                  renderDetail={(date) => <DayCards date={date} items={findEntries(mine, date, person.id)} />}
                />
              ) : scheduleView === "list" ? (
                scheduleDays.length === 0 ? (
                  <p className="assistant-empty">這個月沒有排班。</p>
                ) : (
                  <MonthAgenda days={scheduleDays} today={today} />
                )
              ) : (
                <>
                  <WeekStrip day={scheduleDay} today={today} itemsOf={publishedItemsOf} onPick={pickDay} />
                  <DayCards date={scheduleDay} items={findEntries(mine, scheduleDay, person.id)} />
                </>
              )}
            </>
          )}
        </section>
      )}

      {tab === "leave" && (
        <section className="assistant-card">
          <MonthPicker month={leaveMonth} onChange={setLeaveMonth} />
          <MonthTimelineCard
            timeline={timelineFor(leaveMonth, leaveWindow)}
            states={timelineStates(timelineFor(leaveMonth, leaveWindow), today, {
              prepared: true,
              released: leaveReleased,
              preannounced: publicationOf(leaveMonth).status !== "draft",
              published: publicationOf(leaveMonth).status === "published",
            })}
            overrides={leaveWindow.overrides[leaveMonth]}
            forAssistant
          />
          <p className={`assistant-summary phase-${leaveInfo.phase}`}>
            {waitingRelease
              ? "排休尚未開放：排班者還沒發布這個月每診需要的人數，發布後就能申請排休。"
              : leavePaused
                ? `排休暫停中${leaveApproval?.leavePauseReason ? `：${leaveApproval.leavePauseReason}` : ""}。暫停中不能新增或取消排休申請，已登記的會保留，恢復後再通知。`
                : phaseText(leaveInfo)}
          </p>
          <p className="assistant-hint help-line">
            排休會盡量安排，但不保證排入。
            <HelpTip title="怎麼排休" guide="assistant-leave">
              <p>排休申請會盡量安排，但不保證排入；以正式公告的班表為準。可選「用假」，或「不用假」只希望休。</p>
              <p>
                點日期，選「整天」或「指定診次」、「用假」或「不用假」，再選假別{reasonsEnabled ? "和事由" : ""}，按「確認」就存好。
                很多天一樣的話，在視窗裡按「也套用到其他天」一起選。
              </p>
            </HelpTip>
          </p>
          {!leaveBlocked && reconfirmBox}
          {!leaveBlocked && (
            <>
            {tooShort && <p className="month-status-warn">長假登記需 2 天以上，目前只有 1 天。</p>}
            <div className="leave-legend-anchor">
              <button className="legend-button" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
                ⓘ 日期記號說明
              </button>
              {legendOpen && (
                <div className="leave-legend" role="dialog" aria-label="日期記號說明">
                  <strong>
                    日期記號說明
                    <button className="link-button" onClick={() => setLegendOpen(false)}>關閉</button>
                  </strong>
                  <span><i className="sw sw-picked" />我已申請排休（整天）</span>
                  <span><i className="sw sw-requested" />指定診次（請假或希望不排）</span>
                  <span><i className="sw sw-unplaced" />已申請、未排入班表</span>
                  <span><i className="sw sw-hot" />熱門（只剩 0–1 人）</span>
                  <span><i className="sw sw-short" />人數不足</span>
                  <span><i className="sw sw-off" />沒有看診或不能申請排休</span>
                </div>
              )}
            </div>
            <div className="leave-calendar" role="grid" aria-label={`${fullMonthLabel(leaveMonth)}排休`}>
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span className="leave-weekday" key={day}>{day}</span>)}
              {Array.from({ length: new Date(`${leaveMonth}-01T00:00:00Z`).getUTCDay() }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {monthDates(leaveMonth).map((date) => {
                const status = preLeaveDayStatus(entries, person.id, date, today, leaveWindow, CLOSED);
                const application = myApplicationOn(date);
                const parts = describeDay(date);
                const requested = requestedShiftsOn(requests, date, person.id);
                const editable = status.editable || requestStatusOf(date).editable;
                const warn = parts.some((part) => part.warn);
                return (
                  <button
                    key={date}
                    className={`leave-day ${heatClass(date)} ${application ? "is-picked" : ""} ${requested.length > 0 && !application ? "is-requested" : ""} ${warn ? "is-unplaced" : ""} ${editDay?.date === date ? "is-selected" : ""}`}
                    disabled={!editable && parts.length === 0}
                    title={parts.length > 0 ? parts.map((part) => part.text).join("\n") : status.reason}
                    aria-label={`${formatDay(date)}${heatLabel(date)}${parts.length > 0 ? `：${parts.map((part) => part.text).join("、")}` : ""}`}
                    onClick={(event) => setEditDay({ date, anchor: event.currentTarget })}
                  >
                    {Number(date.slice(8, 10))}
                    {parts.map((part) => <small key={part.short}>{part.short}</small>)}
                    <HolidayNote date={date} />
                  </button>
                );
              })}
            </div>
            {editDay?.date.startsWith(leaveMonth) && (() => {
              const date = editDay.date;
              const status = preLeaveDayStatus(entries, person.id, date, today, leaveWindow, CLOSED);
              const application = myApplicationOn(date);
              const own = myRequestsOn(date);
              const parts = describeDay(date);
              const leaveRequest = own.find((request) => request.leaveType);
              const wholeDayWish = !application && parts.some((part) => part.short === "希望休");
              const initialReason = reasons[application ? dayReasonKey(date, person.id) : shiftReasonKey(date, person.id, own[0]?.shiftId ?? "")];
              const day = leaveLoads.get(date);
              return (
                <FloatingPanel anchor={editDay.anchor} onClose={closeEditor}>
                  <DayLeaveEditor
                    key={date}
                    date={date}
                    currentText={parts.map((part) => part.text).join("；")}
                    currentWarn={parts.some((part) => part.warn)}
                    hasCurrent={parts.length > 0}
                    initial={{
                      mode: application || wholeDayWish || own.length === 0 ? "day" : "shift",
                      useLeave: application ? true : own.length > 0 ? !!leaveRequest : true,
                      leaveType: application?.leaveType ?? leaveRequest?.leaveType ?? leaveTypes[0],
                      shiftIds: own.map((request) => request.shiftId),
                    }}
                    dayLeaveAllowed={status.editable}
                    requestAllowed={requestStatusOf(date).editable && openShiftsOn(date).length > 0}
                    lockedReason={status.reason || requestStatusOf(date).reason}
                    requestBlockedReason={requestBlockedReason || requestStatusOf(date).reason || "這天沒有可以指定的診"}
                    openShiftIds={openShiftsOn(date)}
                    loadLines={[
                      ...targetConflicts(date, openShiftsOn(date)).map(
                        ({ shiftId }) => `${courseProfile.shifts.find((shift) => shift.id === shiftId)?.label ?? shiftId}是培訓目標醫師的診`,
                      ),
                      ...(day ? day.sessions.map((session) => describeLoad(session, person.id)) : []),
                    ]}
                    candidates={candidateDates}
                    reasonsEnabled={reasonsEnabled}
                    initialReason={reasonsEnabled && initialReason ? { category: initialReason.category, text: initialReason.text } : undefined}
                    recent={myRecentReasons}
                    onSave={saveDayPlan}
                    onClear={() => clearDayPlan(date)}
                    onClose={closeEditor}
                  />
                </FloatingPanel>
              );
            })()}
            <p className="heat-legend">
              {(["ok", "hot", "short"] as const).map((heat) => (
                <span key={heat}><i className={`heat-dot heat-${heat}`} />{HEAT_TEXT[heat]}</span>
              ))}
            </p>
            <p className="assistant-hint help-line">
              排休先登記先得。
              <HelpTip title="熱門與人數不足" guide="assistant-leave">
                <p>熱門或人數不足的日子，請先自行與同事協調再排休。</p>
                <p>人數依醫師行事曆估算，實際排班可能更緊。</p>
              </HelpTip>
            </p>
            {busyDays.length > 0 && (
              <ul className="heat-list">
                {busyDays.map((day) => (
                  <li key={day.date} className={`heat-${day.heat}`}>
                    <strong>{formatDay(day.date)}・{HEAT_TEXT[day.heat]}</strong>
                    {day.sessions
                      .filter((session) => margin(session) <= 1)
                      .map((session) => <span key={session.shiftId}>{describeLoad(session, person.id)}</span>)}
                  </li>
                ))}
              </ul>
            )}
            </>
          )}
          <p className="assistant-summary">
            本月已申請排休 {myApplications.length} 天
            {myApplications.length > 0 &&
              `：${myApplications
                .map((application) => {
                  const status = applicationStatus(application, entries);
                  const note = status === "unplaced" ? "（未排入班表）" : status === "rest" ? "（改成休息日，不扣假）" : "";
                  return `${Number(application.date.slice(8, 10))} 日${application.leaveType}${note}${reasonOf(dayReasonKey(application.date, person.id))}`;
                })
                .join("、")}`}
          </p>
          <p className="assistant-summary">
            指定診次請假 {myRequestDays.flatMap((day) => day.requests).filter((request) => request.leaveType).length} 診、
            希望不排 {myRequestDays.flatMap((day) => day.requests).filter((request) => !request.leaveType).length} 診
            {myRequestDays.length > 0 &&
              `：${myRequestDays
                .flatMap((day) =>
                  day.requests.map(
                    (request) =>
                      `${Number(day.date.slice(8, 10))} 日${shortShifts([request.shiftId])}${request.leaveType ? `請假${request.leaveType}` : "不排"}${reasonOf(shiftReasonKey(day.date, person.id, request.shiftId))}`,
                  ),
                )
                .join("、")}`}
          </p>
        </section>
      )}

      {tab === "results" && (
        <section className="assistant-card">
          <MonthPicker month={resultMonth} onChange={setResultMonth} />
          {publicationOf(resultMonth).status === "draft" ? (
            <p className="assistant-empty">這個月的班表還沒公布；預公告後就會顯示排班結果。</p>
          ) : (
            <>
              {publicationOf(resultMonth).status === "preannounced" && <p className="assistant-hint">預公告中：班表還可能調整，正式公告後才是最後結果。</p>}
              <ScheduleResultCard result={resultOf(resultMonth)} />
            </>
          )}
        </section>
      )}

      {tab === "confirm" && (
        <section className="assistant-card">
          {pendingMonths.length === 0 && <p className="assistant-empty">目前沒有需要確認的班表。</p>}
          {pendingMonths.map((publication) => {
            const response = publication.responses[person.id];
            const open = canRespond(publication, now);
            const days = daysOf(publication.month);
            const submit = (status: "confirmed" | "issue") => {
              savePublication(respond(publication, person.id, { status, at: now, issues: status === "issue" ? draftIssues : [] }, now));
              // 送出後說一聲、清掉剛填的問題（使用者 2026-11-01）
              showToast(status === "confirmed" ? `已確認${fullMonthLabel(publication.month)}班表` : `已送出 ${draftIssues.length} 個問題`);
              if (status === "issue") setDraftIssues([]);
            };
            return (
              <div className="confirm-month" key={publication.month}>
                <h2>{fullMonthLabel(publication.month)} 班表（預公告）</h2>
                <p className="assistant-summary">
                  請在 {shortDate(publication.confirmDeadline!.slice(0, 10))} {publication.confirmDeadline!.slice(11)} 前確認；
                  逾期未回覆視同接受，之後不能再提出異動。
                </p>
                {response && (
                  <p className={`confirm-state is-${response.status}`}>
                    {response.status === "confirmed"
                      ? "你已確認這份班表。"
                      : `你已提出 ${response.issues.length} 個問題，等待管理者調整。`}
                  </p>
                )}
                {!response && !open && <p className="confirm-state is-expired">已超過確認期限，視同接受。</p>}
                <ScheduleResultCard result={resultOf(publication.month)} title="這份班表的排班結果" />
                {days.length === 0 ? (
                  <p className="assistant-empty">這個月沒有排班。</p>
                ) : (
                  <>
                    <Segmented options={CONFIRM_VIEWS} value={confirmView} onChange={setConfirmView} label="班表檢視方式" className="confirm-view-toggle" />
                    {confirmView === "calendar" ? <MyMonthCalendar month={publication.month} entries={mine} today={todayString()} renderDetail={(date) => <DayCards date={date} items={mine.filter((entry) => entry.date === date)} />} /> : <MonthAgenda days={days} today={todayString()} />}
                  </>
                )}
                {open && (
                  <>
                    <div className="confirm-actions">
                      {response?.status === "confirmed" ? (
                        <p className="confirm-state is-confirmed">✓ 你已確認這份班表。</p>
                      ) : (
                        <button className="button" onClick={() => submit("confirmed")}>確認班表</button>
                      )}
                    </div>
                    <div className="issue-form">
                      <strong>有問題嗎？</strong>
                      <select aria-label="有問題的日期" value={issueDate} onChange={(event) => setIssueDate(event.target.value)}>
                        <option value="">選日期</option>
                        {monthDates(publication.month).map((date) => (
                          <option key={date} value={date}>{formatDay(date)}</option>
                        ))}
                      </select>
                      <select aria-label="哪一診" value={issueShift} onChange={(event) => setIssueShift(event.target.value)}>
                        <option value="">整天</option>
                        {courseProfile.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.label}</option>)}
                      </select>
                      <select aria-label="問題類型" value={issueKind} onChange={(event) => setIssueKind(event.target.value as IssueKind)}>
                        {ISSUE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                      </select>
                      <button
                        className="button button-quiet"
                        disabled={!issueDate}
                        onClick={() => {
                          setDraftIssues([...draftIssues, { date: issueDate, ...(issueShift ? { shiftId: issueShift } : {}), kind: issueKind }]);
                          setIssueDate("");
                        }}
                      >
                        加入
                      </button>
                      {draftIssues.length > 0 && (
                        <ul className="issue-list">
                          {draftIssues.map((issue, index) => (
                            <li key={`${issue.date}_${index}`}>
                              {formatDay(issue.date)} {courseProfile.shifts.find((shift) => shift.id === issue.shiftId)?.label ?? "整天"}・{issue.kind}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="assistant-hint">只選類型，不需填寫理由；細節請當面與管理者討論。</p>
                      <button className="button leave-button" disabled={draftIssues.length === 0} onClick={() => submit("issue")}>
                        送出問題
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
