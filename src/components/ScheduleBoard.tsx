"use client";

import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { leaveTypes } from "@/config/leave.config";
import { useLeaveWindow } from "./useLeaveWindow";
import { scrollBehavior } from "./reduce-motion";
import { flowStepDates, lateFlowSteps, MonthTimelineCard } from "./MonthTimeline";
import { timelineFor, timelineStates } from "@/domain/rules/month-timeline";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import { LIMITED_BOOKING_NOTE } from "@/config/doctors";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { addDays, formatDay, formatWeekRange, nowString, startOfWeek, todayString, weekDates } from "@/domain/dates";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  adjustmentMap,
  describeDemand,
  evaluateSessionDemand,
  type SessionDemand,
} from "@/domain/rules/assistant-demand";
import { changedDatesInMonth } from "@/domain/rules/demand-draft";
import { isStaleTask, sessionDoctorIds, taskLabel, taskOptions, taskShort, withTask } from "@/domain/rules/shift-task";
import {
  balanceSplitShifts,
  breakEveningStreaks,
  countShiftPatterns,
  eveningStreakExcess,
  planAutoSchedule,
  planHourTopUp,
  splitDaysOf,
  type RelaxStats,
} from "@/domain/rules/auto-schedule";
import {
  abilityHooks,
  assignTasks,
  postSlotsOf,
  unfilledPostSessions,
  doctorTargets,
  unableLevel,
  isLearnerEntry,
  placeAssignments,
  placeLearners,
  uncoveredSessions,
} from "@/domain/rules/ability-schedule";
import { ABILITY_LEVEL_LABELS, abilityFor, type AbilityGrid } from "@/domain/rules/ability";
import { assignmentStatus, targetProgress } from "@/domain/rules/training";
import {
  isPreLeave,
  monthSchedule,
  PRE_LEAVE_PREFIX,
  preLeaveEditable,
  preLeaveType,
  shortLongLeaveRequests,
} from "@/domain/rules/leave-window";
import {
  canAssignShift,
  evaluateLaborIssues,
  formatHours,
  monthOf,
  summarizeMonth,
  targetRange,
} from "@/domain/rules/labor-hours";
import {
  confirmDeadlineFor,
  preannounce,
  publish,
  withdrawPublication,
  summarizeResponses,
} from "@/domain/rules/publication";
import { dayReasonKey, formatReason, removeReason, shiftReasonKey } from "@/domain/rules/leave-reason";
import {
  applicationStatus,
  setApplicationRest,
  leaveApplicationKey,
  removeApplication,
  setApplication,
  withLegacyApplications,
} from "@/domain/rules/leave-application";
import {
  brokenShiftRequests,
  hasShiftRequest,
  isSessionLeave,
  requestedShiftsOn,
  setRestInstead,
  shiftRequestOf,
} from "@/domain/rules/shift-request";
import {
  approveAndRelease,
  approveDemand,
  currentStep,
  stepAccess,
  demandMismatches,
  needsReconfirm,
  closeLeaveEarly,
  pauseLeave,
  reopenLeave,
  effectiveReleasedAt,
  releaseDemand,
  scheduleRelease,
  resumeLeave,
  revokeRelease,
  type PreLeaveHandling,
  returnDemand,
  withdrawDemand,
  stepTitle,
  submitDemand,
  WORKFLOW_STEPS,
  type WorkflowInput,
  type WorkflowStepId,
} from "@/domain/rules/workflow";
import { findEntries } from "@/domain/schedule";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { useSchedule } from "./ScheduleProvider";
import { CoverageWarnings } from "./CoverageWarnings";
import { LaborWarnings } from "./LaborWarnings";
import { AssistantView } from "./AssistantView";
import { usePublications } from "./usePublications";
import { useShiftRequests } from "./useShiftRequests";
import { useLeaveReasons } from "./useLeaveReasons";
import { useLeaveApplications } from "./useLeaveApplications";
import { useDemandApprovals } from "./useDemandApprovals";
import { useDemandAdjustments } from "./useDemandAdjustments";
import { useDemandDraft } from "./useDemandDraft";
import { useLaborTargets } from "./useLaborTargets";
import { LaborTargetPanel } from "./LaborTargetPanel";
import { ScheduleChecklist, type ChecklistItem } from "./ScheduleChecklist";
import { WorkAssignmentBoard } from "./WorkAssignmentBoard";
import { ScheduleStatsPanel } from "./ScheduleStatsPanel";
import { PostStatsPanel } from "./PostStatsPanel";
import { DemandCalendar } from "./DemandCalendar";
import { DemandDayEditor, FloatingPanel } from "./DemandDayEditor";
import { useSheetDrag } from "./useSheetDrag";
import { DoctorDayEditor } from "./DoctorDayEditor";
import { DayHoverContent, DoctorHoverContent } from "./DemandHoverTip";
import { DoctorScheduleSettings, type SettingFocus, type SettingTarget } from "./DoctorScheduleSettings";
import { planDoctorScheduleReload } from "@/domain/rules/doctor-schedule-import";
import { sessionFloorMap, sessionsForMonth, type ShiftKey } from "@/domain/rules/doctor-schedule";
import { WorkflowSidebar } from "./WorkflowSidebar";
import { useReadOnlyZone } from "./useReadOnlyZone";
import { MonthLeadBar } from "./MonthLeadBar";
import { useMonthAccess } from "./useMonthAccess";
import { ScheduleReviewPanel, SnapshotChanges, type ReviewActor } from "./ScheduleReviewPanel";
import { useScheduleReviews } from "./useScheduleReviews";
import { REVIEW_STATUS_LABELS, reviewApproved, sendToClerk, snapshotOf, withdrawReview } from "@/domain/rules/schedule-review";
import { SaveImageButton } from "./SaveImageButton";
import { MobileDayView } from "./MobileDayView";
import { MobileMonthView } from "./MobileMonthView";
import { Segmented } from "./Segmented";
import { HelpTip } from "./HelpTip";
import { showToast } from "./Toast";
import { AssignPanel, LeaveRequestList } from "./WorkbenchPanels";
import { TrainingPanel, trainingIssueCount, useTrainingPlans } from "./TrainingPanel";
import { DutySupervisorPanel, monthSupervisorIssues, useDutySupervisors } from "./DutySupervisorPanel";
import { abilityMark, useAbilities } from "./useAbilities";
import { HolidayNote } from "./HolidayNote";
import { readLeaveReasons } from "@/data/leave-reason-store";
import { readLeaveApplications } from "@/data/leave-application-store";
import { readShiftRequests } from "@/data/shift-request-store";
import {
  ASSISTANT_IDS,
  ASSISTANT_NAMES,
  clampDay,
  clinicDayOf,
  holidayNote,
  FIRST_DAY,
  FIRST_MONTH,
  fullMonthLabel,
  LABOR_SETTINGS,
  monthDates,
  leaveLastDay,
  phaseText,
  shortDate,
} from "./schedule-settings";
import { MonthGrid } from "./MonthGrid";
import { DraggableNameCell, GroupHeaderRow, HideRowButton, useVisiblePeople } from "./RowVisibility";
import { useViewer } from "./ViewerProvider";
import { useDoctorSchedule } from "./useDoctorSchedule";
import { useDoctorSync } from "./DoctorScheduleSync";

/** 「醫師與人數」「管理者確認」用月曆或班表檢視；只記在這台瀏覽器。 */
type DemandView = "calendar" | "grid";
const DEMAND_VIEW_KEY = "clinic-schedule-workshop:demand-view";
function readDemandView(): DemandView {
  try {
    return window.localStorage.getItem(DEMAND_VIEW_KEY) === "grid" ? "grid" : "calendar";
  } catch {
    return "calendar";
  }
}

interface SelectedCell {
  date: string;
  personId: string;
}


const BASE_STAFFING_RULES = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
const DOCTOR_PEOPLE = courseProfile.people.filter((person) => person.role === "doctor");
const DOCTOR_ID_SET = new Set(DOCTOR_PEOPLE.map((doctor) => doctor.id));
/** 可以切換週班表的步驟：排班、班表確認、公告；前面的步驟都以整個月決定。 */
const WEEK_VIEW_STEPS: WorkflowStepId[] = ["schedule", "confirm", "publish"];
/** 班表頁與「排班」以後的步驟：上方切換「班表／工作分配」（使用者 2026-10-30）。 */
const BOARD_VIEWS = [
  ["table", "班表"],
  ["work", "工作分配"],
] as const;

const monthLabel = (month: string) => `${Number(month.slice(5))} 月`;
/** 手機班表標題的週：12/1–12/6。 */
const shortRange = (from: string, to: string) => `${Number(from.slice(5, 7))}/${Number(from.slice(8))}–${Number(to.slice(5, 7))}/${Number(to.slice(8))}`;

function DemandRow({ dates, demands }: { dates: string[]; demands: SessionDemand[] }) {
  return (
    <tr className="demand-row">
      <th scope="row">
        <span>助理需求</span>
        <small>已排／需求，點開看細項</small>
      </th>
      {dates.map((date) => (
        <td key={date}>
          {demands
            .filter((demand) => demand.date === date)
            .map((demand) => (
              <details
                className={`demand-item ${demand.scheduled < demand.total ? "is-short" : "is-ok"}`}
                key={demand.shiftId}
              >
                <summary>
                  {demand.shiftLabel.slice(0, 1)} {demand.scheduled}/{demand.total}
                </summary>
                <small>{describeDemand(demand)}</small>
              </details>
            ))}
        </td>
      ))}
      <td className="hours-cell" />
    </tr>
  );
}

const WEEKDAY_LABELS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

/** 「還差什麼」清單點了跳到要處理的地方；收起來的區塊（<details>）先打開。 */
function jumpTo(selector: string) {
  const target = document.querySelector(selector);
  if (target instanceof HTMLDetailsElement) target.open = true;
  target?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

const VIEW_MODES = [
  ["month", "月"],
  ["week", "週"],
] as const;

/** 班表上方的「⋯」選單：放不常用的跳到月份、存成圖片；點外面或按 Esc 收起。 */
function ToolbarMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="toolbar-more" ref={ref}>
      <button className="button button-quiet" aria-label="更多" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && <div className="toolbar-more-menu">{children}</div>}
    </div>
  );
}

function shiftOrder(shiftId: string | undefined): number {
  return courseProfile.shifts.findIndex((shift) => shift.id === shiftId);
}

/** all＝整份班表（判斷記的醫師這一診還在不在）；沒傳就不標提醒。 */
function EntryLabel({ entries, all }: { entries: ScheduleEntry[]; all?: ScheduleEntry[] }) {
  const abilities = useAbilities();
  if (entries.length === 0) return <span className="empty-label">＋ 排班</span>;
  const leave = entries.find((entry) => entry.state === "leave");
  if (leave) {
    const type = preLeaveType(leave);
    return type ? <span className="leave-label is-pre-leave" title={`排休：${type}`}>{type}</span> : <span className="leave-label">休假</span>;
  }
  const sorted = [...entries].sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId));
  return (
    <span className="shift-labels">
      {sorted.map((entry) => {
        const shift = courseProfile.shifts.find((item) => item.id === entry.shiftId);
        const limited = entry.note === LIMITED_BOOKING_NOTE;
        const flex = entry.note === FLEX_SHIFT_NOTE;
        const stale = !!all && isStaleTask(entry, all);
        const warn = all ? abilityMark(entry, all, abilities) : null;
        const taskTitle = entry.task ? `${taskLabel(entry.task)}${stale ? "（這位醫師這一診不看了）" : ""}` : undefined;
        return (
          <span
            className={`shift-label shift-${entry.shiftId} ${limited ? "is-limited" : ""} ${flex ? "is-flex" : ""} ${warn?.className ?? ""}`}
            key={entry.id}
            title={[limited ? LIMITED_BOOKING_NOTE : flex ? `${FLEX_SHIFT_NOTE}（補工時加排）` : "", taskTitle ?? "", warn?.title ?? ""].filter(Boolean).join("・") || undefined}
          >
            {limited ? `(${shift?.label ?? entry.shiftId})` : shift?.label ?? entry.shiftId}
            {flex && <small>{FLEX_SHIFT_NOTE}</small>}
            {entry.task && <small className={`task-tag ${stale ? "is-stale" : ""} ${isLearnerEntry(entry) ? "is-learner" : ""}`}>{taskShort(entry.task)}</small>}
          </span>
        );
      })}
    </span>
  );
}

/**
 * 每一診記做什麼工作（選填，沒選＝未分配）：只列那一診看診的醫師（跟診、學習）與流動、櫃台、預留。
 * 記的醫師後來不看這一診了：照樣保留並標提醒，由排班者決定要不要改。
 */
function TaskPicker(props: {
  shifts: ScheduleEntry[];
  entries: ScheduleEntry[];
  disabled: boolean;
  /** 這個月的能力表（沒有＝不提醒）。 */
  levels: AbilityGrid | null;
  shiftLabelOf(id?: string): string;
  onChange(entry: ScheduleEntry, task: string | undefined): void;
}) {
  if (props.shifts.length === 0) return null;
  const sorted = [...props.shifts].sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId));
  return (
    <div className="task-picker">
      <span className="task-picker-title">工作（選填）</span>
      {sorted.map((entry) => {
        const options = taskOptions(sessionDoctorIds(props.entries, entry.date, entry.shiftId!));
        const stale = isStaleTask(entry, props.entries);
        const missing = entry.task && !options.some((option) => option.id === entry.task);
        return (
          <label key={entry.id} className="task-row">
            <span>{props.shiftLabelOf(entry.shiftId)}</span>
            <select
              aria-label={`${props.shiftLabelOf(entry.shiftId)}的工作`}
              value={entry.task ?? ""}
              disabled={props.disabled}
              onChange={(event) => props.onChange(entry, event.target.value || undefined)}
            >
              <option value="">未分配</option>
              {missing && <option value={entry.task}>{taskLabel(entry.task!)}（醫師這一診不看了）</option>}
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            {stale && <small className="task-stale">醫師這一診不看了，請改</small>}
            {!stale && props.levels && unableLevel(entry, props.levels) && (
              <small className="task-stale">
                能力表：{ABILITY_LEVEL_LABELS[unableLevel(entry, props.levels)!]}，建議換人或改工作
              </small>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** 「希望不排」的診，例如「早晚」。 */
function requestLabel(shiftIds: string[]): string {
  return [...shiftIds]
    .sort((a, b) => shiftOrder(a) - shiftOrder(b))
    .map((id) => courseProfile.shifts.find((shift) => shift.id === id)?.label.slice(0, 1) ?? id)
    .join("");
}

function describeEntries(entries: ScheduleEntry[]): string {
  if (entries.length === 0) return "空白";
  const leave = entries.find((entry) => entry.state === "leave");
  if (leave) return preLeaveType(leave) ? `排休${preLeaveType(leave)}` : "休假";
  return entries
    .map(
      (entry) =>
        (entry.note === LIMITED_BOOKING_NOTE ? `(${entry.shiftId})` : entry.note === FLEX_SHIFT_NOTE ? `${entry.shiftId}${FLEX_SHIFT_NOTE}` : entry.shiftId) +
        (entry.task ? `（${taskLabel(entry.task)}）` : ""),
    )
    .join("、");
}

// 每天的固定診別都一樣時，濃縮成「週一至週五：早診、午診」。
function describeAvailability(person: CoursePerson): string {
  const availability = person.availability ?? [];
  const byDay = new Map<number, string[]>();
  availability.forEach((item) => byDay.set(item.weekday, [...(byDay.get(item.weekday) ?? []), item.shiftId]));
  const label = (shiftIds: string[]) =>
    shiftIds
      .sort((a, b) => shiftOrder(a) - shiftOrder(b))
      .map((id) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id)
      .join("、");
  const days = [...byDay.keys()].sort();
  const patterns = new Set(days.map((day) => label(byDay.get(day)!)));
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  if (patterns.size === 1 && consecutive && days.length > 1) {
    return `${WEEKDAY_LABELS[days[0]]}至${WEEKDAY_LABELS[days[days.length - 1]]}：${[...patterns][0]}`;
  }
  return days.map((day) => `${WEEKDAY_LABELS[day]}${label(byDay.get(day)!)}`).join("、");
}

function PersonRows({
  people,
  group,
  dates,
  entries,
  selected,
  onSelect,
  hours,
  requestedOf,
  reasonOf,
  unplacedOf,
  requestTextOf,
}: {
  people: CoursePerson[];
  /** 這一組的全部人（含隱藏的），拖動改順序時用。 */
  group: CoursePerson[];
  dates: string[];
  entries: ScheduleEntry[];
  selected: SelectedCell | null;
  onSelect(cell: SelectedCell): void;
  /** 最右欄（本月工時）；沒有時留空。 */
  hours?: (person: CoursePerson) => ReactNode;
  requestedOf?: (date: string, personId: string) => string[];
  /** 助理填的排休／希望不排理由（只給管理者看）。 */
  reasonOf?: (date: string, personId: string) => string | undefined;
  /** 助理申請了排休、但沒排在班表上的假別。 */
  unplacedOf?: (date: string, personId: string) => string | undefined;
  /** 「請假晚（特休）・希望不排早」這類標示；沒傳時只列希望不排的診。 */
  requestTextOf?: (date: string, personId: string) => string;
}) {
  return people.map((person) => (
    <tr key={person.id}>
      <DraggableNameCell person={person} group={group}>
        <span>{person.displayName}</span>
        <HideRowButton person={person} />
        <small>{person.role === "doctor" ? "醫師" : "助理"}</small>
        {person.availability && (
          <small className="availability-note">固定班：{describeAvailability(person)}</small>
        )}
      </DraggableNameCell>
      {dates.map((date) => {
        const cellEntries = findEntries(entries, date, person.id);
        const isSelected = selected?.date === date && selected.personId === person.id;
        const cellState = cellEntries.some((entry) => entry.state === "leave") ? "leave" : "shift";
        const requested = requestedOf?.(date, person.id) ?? [];
        const broken = cellEntries.some((entry) => entry.state === "shift" && requested.includes(entry.shiftId ?? ""));
        const reason = reasonOf?.(date, person.id);
        const unplaced = unplacedOf?.(date, person.id);
        const requestText = requested.length > 0 ? requestTextOf?.(date, person.id) ?? `希望不排${requestLabel(requested)}` : "";
        const day = clinicDayOf(date);
        const closed = !day.open;
        const extra = day.known && cellEntries.some((entry) => entry.state === "shift" && !day.shiftIds.includes(entry.shiftId ?? ""));
        return (
          <td key={date} className={closed ? "is-closed" : undefined}>
            <button
              className={`schedule-cell ${extra ? "is-extra-open" : ""} ${cellEntries.length > 0 ? `has-${cellState}` : ""} ${isSelected ? "is-selected" : ""} ${broken ? "is-request-broken" : ""} ${reason ? "has-reason" : ""} ${unplaced ? "has-unplaced" : ""}`}
              onClick={() => onSelect({ date, personId: person.id })}
              aria-label={`${person.displayName} ${formatDay(date)}：${describeEntries(cellEntries)}${requestText ? `；${requestText}` : ""}${unplaced ? `；排休申請${unplaced}未排入` : ""}`}
              title={reason ? `理由：${reason}` : undefined}
            >
              <EntryLabel entries={cellEntries} all={entries} />
              {requestText && <small className="request-tag">{requestText}</small>}
              {unplaced && <small className="unplaced-tag">申請{unplaced}（未排入）</small>}
            </button>
          </td>
        );
      })}
      <td className="hours-cell">{hours?.(person)}</td>
    </tr>
  ));
}

/** owner＝最高管理者（全部功能＋確認人數）；scheduler＝排班者（照步驟操作）。 */
type BoardRole = "owner" | "scheduler" | "clerk";
const ASSISTANT_SET = new Set(ASSISTANT_IDS);
/** workbench＝排班工作台（流程與修改）；view＝班表（只看，要改到工作台）。 */
export type BoardMode = "workbench" | "view";

/** 網址 `?month=2027-03&step=review`：從總覽點進來時直接到那個月份與步驟。 */
interface BoardTarget {
  month?: string;
  step?: WorkflowStepId;
}

function readTarget(params: URLSearchParams): BoardTarget {
  const month = params.get("month") ?? undefined;
  const step = params.get("step") ?? undefined;
  return {
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : undefined,
    step: WORKFLOW_STEPS.find((item) => item.id === step)?.id,
  };
}

function AdminBoard({ role, mode, target }: { role: BoardRole; mode: BoardMode; target: BoardTarget }) {
  const isOwner = role === "owner";
  const viewOnly = mode === "view";
  const router = useRouter();
  // 排休時程＝通則＋每月排班日程的調整。
  const { settings: leaveWindow, saveMonth: saveTimeline } = useLeaveWindow();
  // 醫師班表改了就重畫（診所列、醫師班自動同步都依它）。
  const doctorConfig = useDoctorSchedule();
  // 人數規則＋單日指定樓層（醫師班表的單日調整）。
  const staffingRules = useMemo(() => ({ ...BASE_STAFFING_RULES, sessionFloors: sessionFloorMap(doctorConfig) }), [doctorConfig]);
  // 依目前的「錨點日期」顯示該週或該月；預設月班表。
  // 班表從 FIRST_MONTH 開始，錨點日期不會早於第一天。
  const [anchor, setAnchorRaw] = useState(() => clampDay(target.month ? `${target.month}-01` : todayString()));
  const setAnchor = (date: string) => {
    const next = clampDay(date);
    // 換月份時清掉上個月的操作訊息，避免看錯月份。
    if (next.slice(0, 7) !== anchor.slice(0, 7)) setAutoMessage(null);
    setAnchorRaw(next);
  };
  // 月／週：只有第 5～7 步（排班、確認、公告）才能切週，前面的步驟一律以月顯示。
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const monday = startOfWeek(anchor);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  // 手機上格子視窗是下方視窗：往下拉、點變暗的地方關閉（`useSheetDrag`）。
  const cellEditorRef = useRef<HTMLElement>(null);
  const closeCellEditor = useMemo(() => () => setSelected(null), []);
  useSheetDrag(cellEditorRef, closeCellEditor, { enabled: !!selected });
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [preLeaveChoice, setPreLeaveChoice] = useState<string>(leaveTypes[0]);
  const [unlockedMonths, setUnlockedMonths] = useState<string[]>([]);
  // 手機上第一步的說明先收成兩行，點一下展開。
  // 手機看班表：預設「單日」（週條＋診次卡），可切到「月曆」（每天三條人數）或「總表」；
  // 在月曆點某一天＝切回「單日」看那一天（mobileDay）。
  const [mobileView, setMobileView] = useState<"day" | "calendar" | "table">("day");
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const mobileTable = mobileView === "table";
  const today = todayString();
  const { entries, syncState, error, toggleShift, saveLeave, clearEntry, saveEntries, replaceEntries } = useSchedule();
  const dates = useMemo(() => {
    if (viewMode === "week") return weekDates(startOfWeek(anchor)).filter((date) => date >= FIRST_DAY);
    const first = `${anchor.slice(0, 7)}-01`;
    return Array.from({ length: 31 }, (_, index) => addDays(first, index)).filter((date) => date.startsWith(anchor.slice(0, 7)));
  }, [anchor, viewMode]);
  const shiftMonth = (offset: number) => {
    const [year, month] = anchor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
    setAnchor(next);
  };
  const months = useMemo(() => [...new Set(dates.map(monthOf))], [dates]);
  const scheduleOf = (month: string) => monthSchedule(month, today, leaveWindow);
  const { publicationOf, savePublication } = usePublications();
  const { reviews, saveReview } = useScheduleReviews();
  const { member } = useViewer();
  const { requests, saveShiftRequests } = useShiftRequests();
  /** 格子上「希望不排／診次請假」的標示，例如「請假晚（特休）・希望不排早」。 */
  const requestTextOf = (date: string, personId: string) => {
    const own = requestedOf(date, personId).map((shiftId) => shiftRequestOf(requests, date, personId, shiftId)!);
    const wishes = own.filter((request) => !request.leaveType).map((request) => request.shiftId);
    const leaves = own.filter((request) => request.leaveType);
    return [
      ...leaves.map((request) => `請假${requestLabel([request.shiftId])}（${request.leaveType}${request.restInstead ? "→休" : ""}）`),
      ...(wishes.length > 0
        ? [leaves.length === 0 && clinicDayOf(date).shiftIds.every((id) => wishes.includes(id)) ? "希望整天休" : `希望不排${requestLabel(wishes)}`]
        : []),
    ].join("・");
  };
  const requestedOf = (date: string, personId: string) => requestedShiftsOn(requests, date, personId);
  const { reasons, saveLeaveReasons, enabled: reasonsEnabled } = useLeaveReasons();
  // 助理的排休申請：管理者改班表不會刪除，沒排在班表上的標「未排入」。
  const { stored: storedApplications, saveLeaveApplications } = useLeaveApplications();
  const applications = useMemo(() => withLegacyApplications(storedApplications, entries), [storedApplications, entries]);
  const applicationOf = (date: string, personId: string) => applications[leaveApplicationKey(date, personId)];
  const unplacedOf = (date: string, personId: string) => {
    const application = applicationOf(date, personId);
    return application && applicationStatus(application, entries) === "unplaced" ? application.leaveType : undefined;
  };
  // 只列出仍有排休申請／希望不排的理由，避免顯示已取消的舊理由。
  const reasonLines = (date: string, personId: string): string[] => {
    if (!reasonsEnabled) return [];
    const lines: string[] = [];
    const dayReason = reasons[dayReasonKey(date, personId)];
    if (dayReason && applicationOf(date, personId)) lines.push(`排休：${formatReason(dayReason)}`);
    requestedOf(date, personId).forEach((shiftId) => {
      const reason = reasons[shiftReasonKey(date, personId, shiftId)];
      const kind = shiftRequestOf(requests, date, personId, shiftId)?.leaveType ? "請假" : "不排";
      if (reason) lines.push(`${kind}${requestLabel([shiftId])}：${formatReason(reason)}`);
    });
    return lines;
  };
  const reasonOf = (date: string, personId: string) => reasonLines(date, personId).join("；") || undefined;
  // 管理者改動有排休的格子時，先把排休存成申請紀錄（舊資料還沒有紀錄），申請與理由都保留。
  const keepApplication = (date: string, personId: string) => {
    const pre = findEntries(entries, date, personId).find(isPreLeave);
    const current = readLeaveApplications();
    if (pre && !(leaveApplicationKey(date, personId) in current)) {
      saveLeaveApplications(setApplication(current, date, personId, preLeaveType(pre)!, ""));
    }
  };
  // 管理者刪除申請（例如助理當面撤回）：申請與理由一起刪掉，班表上的排休也清除。
  const deleteApplication = (date: string, personId: string) => {
    saveLeaveApplications(removeApplication(readLeaveApplications(), date, personId));
    if (reasonsEnabled) saveLeaveReasons(removeReason(readLeaveReasons(), dayReasonKey(date, personId)));
  };
  const viewDates = new Set(dates);
  const brokenRequests = brokenShiftRequests(requests, entries).filter((request) => viewDates.has(request.date));
  // 班表只有在「正式公告」後才鎖定；排休截止只鎖定排休申請。
  const isLocked = (month: string) => publicationOf(month).status === "published" && !unlockedMonths.includes(month);
  const shiftLabelOf = (id?: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? "整天";
  const deadlineText = (value?: string) => (value ? `${shortDate(value.slice(0, 10))} ${value.slice(11)}` : "");
  const editableMonths = months.filter((month) => !isLocked(month));
  const editableDates = dates.filter((date) => !isLocked(monthOf(date)));
  const laborIssues = useMemo(
    () => evaluateLaborIssues(entries, ASSISTANT_IDS, months, LABOR_SETTINGS, requests),
    [entries, months, requests],
  );
  const { targets: laborTargets, setTarget: setLaborTarget } = useLaborTargets();
  const abilities = useAbilities();
  const trainingPlans = useTrainingPlans();
  const dutySupervisors = useDutySupervisors();
  /** 月班表最右欄：本月工時（上班＋請假）／上限、休假天數；三診、晚診次數與請假時數放在提示文字。 */
  const laborCell = (person: CoursePerson) =>
    months.map((month) => {
      const summary = summarizeMonth(entries, person.id, month, LABOR_SETTINGS, requests);
      const over = summary.normalCapMinutes !== undefined && summary.paidMinutes > summary.normalCapMinutes;
      const target = targetRange(month, LABOR_SETTINGS, laborTargets[month]);
      const under = !over && target !== undefined && summary.paidMinutes < target.minMinutes;
      const patterns = countShiftPatterns(entries, person.id, month, schedulingPreferences.eveningShiftId);
      const leaveText = summary.leaveMinutes > 0 ? `・含請假 ${formatHours(summary.leaveMinutes)} 小時` : "";
      const targetText = target ? `・目標 ${formatHours(target.minMinutes)}～${formatHours(target.maxMinutes)}` : "";
      return (
        <span
          className={`hours-value ${over ? "is-over" : under ? "is-under" : ""}`}
          key={month}
          title={`${Number(month.slice(5))} 月：三診 ${patterns.tripleDays} 天・晚診 ${patterns.evenings} 次${leaveText}${targetText}`}
        >
          <strong>{formatHours(summary.paidMinutes)}</strong>
          {summary.normalCapMinutes === undefined ? "／未設定" : `／${formatHours(summary.normalCapMinutes)}`}
          <small>休 {summary.restDays} 天</small>
        </span>
      );
    });
  // 推算人數的手動調整：送審、排休熱門度、一鍵排班都用調整後的人數。
  const { adjustments, record: adjustmentRecord } = useDemandAdjustments();
  // 「醫師與人數」整頁草稿：醫師班表與人數調整先改在草稿，按「儲存」才寫入（班表也才會跟著變）。
  const draft = useDemandDraft(doctorConfig, adjustmentRecord);
  const draftStaffingRules = useMemo(() => ({ ...BASE_STAFFING_RULES, sessionFloors: sessionFloorMap(draft.config) }), [draft.config]);
  const draftAdjustments = useMemo(() => adjustmentMap(draft.adjustments), [draft.adjustments]);
  const demands = useMemo(
    () =>
      evaluateSessionDemand(
        entries,
        courseProfile.people,
        dates,
        courseProfile.shifts,
        staffingRules,
        adjustments,
      ),
    [entries, dates, adjustments, staffingRules],
  );
  const doctors = DOCTOR_PEOPLE;
  const doctorIds = DOCTOR_ID_SET;

  // 每月排班流程：以畫面錨點日期所在月份為準。
  const focusMonth = anchor.slice(0, 7);
  const { approvals, saveDemandApproval } = useDemandApprovals();
  const [pickedStep, setPickedStep] = useState<{ month: string; step: WorkflowStepId } | null>(() =>
    target.month && target.step ? { month: target.month, step: target.step } : null,
  );
  const [returnReason, setReturnReason] = useState("");
  // 撤銷同意、撤回正式公告要填的原因。
  const [withdrawReason, setWithdrawReason] = useState("");
  // 管理者退回前寫的逐日意見（key 為日期）；退回時才存進送審紀錄。
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  // 完整班表：第 3～5 步預設收起、第 6～8 步預設打開，都可以切換；第 1、2 步改用月曆／班表切換。
  const [gridOpen, setGridOpen] = useState({ early: false, late: true });
  const [demandView, setDemandViewRaw] = useState<DemandView>(readDemandView);
  const setDemandView = (view: DemandView) => {
    setDemandViewRaw(view);
    try {
      window.localStorage.setItem(DEMAND_VIEW_KEY, view);
    } catch {
      // 無法記住也沒關係，只是下次回到月曆。
    }
  };
  // 班表檢視正在修改的那一天（修改視窗浮在那一欄旁邊）。
  // personId：點的是某位醫師的格子（打開醫師單日視窗）；shiftId：整天視窗先開哪一診。
  const [gridEdit, setGridEdit] = useState<{ date: string; anchor: HTMLElement; personId?: string; shiftId?: ShiftKey } | null>(null);
  const visiblePeople = useVisiblePeople();
  const focusDemands = useMemo(
    () =>
      evaluateSessionDemand(entries, courseProfile.people, monthDates(focusMonth), courseProfile.shifts, staffingRules, adjustments),
    [entries, focusMonth, adjustments, staffingRules],
  );
  // 手機「單日」的日期帶（使用者 2026-10-30）：週檢視也能整個月左右滑，點別週的日子＝換到那一週（上面的週跟著換）。
  // 點得到的日子＝這個月＋這一週跨到別月的日子；圓點用整個月的人數。
  const mobileStripDates = useMemo(() => [...new Set([...monthDates(focusMonth), ...dates])].filter((date) => date >= FIRST_DAY).sort(), [focusMonth, dates]);
  const mobileStripDemands = useMemo(
    () => [...focusDemands, ...demands.filter((demand) => monthOf(demand.date) !== focusMonth)],
    [focusDemands, demands, focusMonth],
  );
  const mobileSelected =
    mobileDay && dates.includes(mobileDay)
      ? mobileDay
      : dates.includes(today)
        ? today
        : (dates.find((date) => demands.some((demand) => demand.date === date)) ?? dates[0]);
  const pickMobileDay = (date: string) => {
    setMobileDay(date);
    setAnchor(date);
  };
  // 第一步月曆上的人數直接依醫師班表草稿算（不等儲存與班表同步），勾醫師後馬上更新；
  // 已正式公告或行事曆範圍外的月份，班表不會跟著醫師班表變，就用班表上的醫師。
  const focusPublished = publicationOf(focusMonth).status === "published";
  // 班表套用醫師班表草稿後的樣子（月曆與班表檢視共用，未儲存的修改也看得到）。
  const previewEntries = useMemo(() => {
    const sessions = sessionsForMonth(draft.config, focusMonth);
    if (!sessions || focusPublished) return entries;
    const plan = planDoctorScheduleReload(entries, sessions, [focusMonth], DOCTOR_ID_SET);
    const removed = new Set(plan.remove);
    return [...entries.filter((entry) => !removed.has(entry)), ...plan.add];
  }, [draft.config, focusMonth, focusPublished, entries]);
  const calendarDemands = useMemo(
    () =>
      evaluateSessionDemand(previewEntries, courseProfile.people, monthDates(focusMonth), courseProfile.shifts, draftStaffingRules, draftAdjustments),
    [previewEntries, focusMonth, draftAdjustments, draftStaffingRules],
  );
  const changedDates = useMemo(
    () =>
      changedDatesInMonth(
        { config: doctorConfig, adjustments: adjustmentRecord },
        { config: draft.config, adjustments: draft.adjustments },
        focusMonth,
      ),
    [doctorConfig, adjustmentRecord, draft.config, draft.adjustments, focusMonth],
  );
  const [settingFocus, setSettingFocus] = useState<SettingFocus | null>(null);
  const focusApproval = approvals[focusMonth];
  const mismatches = focusApproval ? demandMismatches(focusApproval, focusDemands) : [];
  // 每月排班日程（通則＋這個月的調整）；預約發布到「人數發布」日就算已發布。
  const focusTimeline = timelineFor(focusMonth, leaveWindow);
  const focusReleasedAt = effectiveReleasedAt(focusApproval, today, focusTimeline.release);
  const focusTimelineStates = timelineStates(focusTimeline, today, {
    prepared: !!focusApproval && (focusApproval.status !== "returned" || !!focusReleasedAt),
    released: !!focusReleasedAt,
    preannounced: publicationOf(focusMonth).status !== "draft",
    published: publicationOf(focusMonth).status === "published",
  });
  const workflowInput: WorkflowInput = {
    demandStatus: focusApproval?.status,
    demandReleased: !!focusReleasedAt,
    demandMismatchCount: mismatches.length,
    leavePhase: scheduleOf(focusMonth).phase,
    publication: publicationOf(focusMonth).status,
    review: reviews[focusMonth] ?? null,
  };
  const nowStep = currentStep(workflowInput);
  // 照順序走：還沒輪到的步驟只有最高管理者能打開（預覽）；其他人（含網址直接帶 step）回到目前那一步。
  const pickedAllowed = pickedStep?.month === focusMonth && (isOwner || stepAccess(pickedStep.step, workflowInput) !== "locked");
  const activeStep = pickedAllowed && pickedStep ? pickedStep.step : nowStep;
  const activeAccess = stepAccess(activeStep, workflowInput);
  // 不是目前那一步＝只能看（已完成的要改先退回；還沒輪到的只能預覽）。
  // 不是這個月的排班負責人（有登入時）或行政專員：班表整個月只能看。
  // 行政檢查、確認班表兩步的審核區塊另外依身分判斷（行政專員要能提出建議），不放在唯讀範圍裡。
  const { canManage } = useMonthAccess();
  const monthReadOnly = !viewOnly && (role === "clerk" || !canManage(focusMonth));
  const reviewStep = activeStep === "clerkCheck" || activeStep === "ownerCheck";
  const stepReadOnly = !viewOnly && (activeAccess !== "current" || (monthReadOnly && !reviewStep));
  const gridReadOnly = stepReadOnly || monthReadOnly;
  const actorName = member?.name ?? (role === "owner" ? "最高管理者" : role === "clerk" ? "行政專員" : "排班者");
  const reviewActor: ReviewActor = {
    kind: role === "owner" ? "owner" : role === "clerk" ? "clerk" : canManage(focusMonth) ? "lead" : "other",
    name: actorName,
  };
  const stepBodyRef = useReadOnlyZone<HTMLDivElement>(stepReadOnly);
  // 「存成圖片」存的範圍：整張班表卡（流程與按鈕標了 print-only-hide，不放進圖）。
  const scheduleCardRef = useRef<HTMLElement>(null);
  // 流程側欄選了「班表日程」的月份（換月就回到步驟）。
  const [timelineMonth, setTimelineMonth] = useState<string | null>(null);
  const showTimeline = timelineMonth === focusMonth;
  // 電腦版流程列「調整日程」打開的月份。
  const [timelineEditMonth, setTimelineEditMonth] = useState<string | null>(null);
  // 班表（只看）頁不跟流程走，月／週都可以切。
  const weekAllowed = viewOnly || WEEK_VIEW_STEPS.includes(activeStep);
  // 回到前面的步驟時改回月檢視（在畫面送出前就改好，不會先閃一下週班表）。
  if (!weekAllowed && viewMode === "week") setViewMode("month");
  const preLeaveCounts = (month: string) => {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      if (isPreLeave(entry) && entry.date.startsWith(month)) counts.set(entry.personId, (counts.get(entry.personId) ?? 0) + 1);
    });
    return [...counts.entries()].map(([id, count]) => `${ASSISTANT_NAMES.get(id) ?? id} ${count} 天`);
  };
  // 每天加總沒有意義（每一診各自要滿），只說幾診、手動調整了幾診。
  const adjustedCount = focusDemands.filter((demand) => demand.adjustment !== 0).length;
  const demandTotals = `${focusDemands.length} 診${adjustedCount > 0 ? `，其中 ${adjustedCount} 診手動調整` : ""}`;
  const unsavedAlert = () => {
    if (!draft.dirty) return false;
    window.alert("醫師與人數還有沒儲存的修改，請先按「儲存」或「放棄修改」。");
    return true;
  };
  const doSaveDraft = () => {
    if (!draft.save()) return window.alert("無法儲存（瀏覽器不允許寫入）。");
    // 管理者在確認步驟改完存檔：人數和送出時不同，留在這一步直接同意。
    if (activeStep === "review") setPickedStep({ month: focusMonth, step: "review" });
  };
  const doDiscardDraft = () => {
    if (window.confirm(`放棄 ${draft.changes.length} 項還沒儲存的修改？會回到上次儲存的內容。`)) draft.discard();
  };
  const doSubmitDemand = () => {
    if (unsavedAlert()) return;
    // 往前一步不再跳「確定嗎？」（使用者 2026-11-01，照 Apple HIG：送出後還能「撤回送出」）
    saveDemandApproval(submitDemand(focusMonth, focusDemands, nowString(), focusApproval));
    showToast(`已把${fullMonthLabel(focusMonth)}人數送給管理者`);
  };
  const doApprove = () => {
    if (!focusApproval || unsavedAlert()) return;
    const edited = mismatches.length > 0 ? `其中 ${mismatches.length} 診和送出時不同，會用現在的人數。` : "";
    // 和送出時不同才問（會用現在的人數）；一般同意不問，同意後還能「撤銷同意」
    if (edited && !window.confirm(`同意${fullMonthLabel(focusMonth)}助理人數（${demandTotals}）？${edited}`)) return;
    // 用現在的人數同意：管理者自己改過醫師或人數，也不必退回重送。
    saveDemandApproval(approveDemand(focusApproval, nowString(), focusDemands));
    showToast(`已同意${fullMonthLabel(focusMonth)}人數`);
    setPickedStep(null);
  };
  const monthNotes = Object.entries(reviewNotes)
    .filter(([date, text]) => date.startsWith(focusMonth) && text.trim())
    .map(([date, text]) => ({ date, text }));
  const doReturn = () => {
    if (!focusApproval || (!returnReason.trim() && monthNotes.length === 0)) return;
    if (!window.confirm(`退回給排班者？${monthNotes.length > 0 ? `含 ${monthNotes.length} 天的意見。` : ""}`)) return;
    saveDemandApproval(returnDemand(focusApproval, returnReason, nowString(), monthNotes));
    setReturnReason("");
    setReviewNotes((current) => Object.fromEntries(Object.entries(current).filter(([date]) => !date.startsWith(focusMonth))));
  };
  const doWithdrawDemand = () => {
    if (focusApproval?.status !== "submitted") return;
    if (!window.confirm(`撤回${fullMonthLabel(focusMonth)}送出的人數，回到「醫師與人數」繼續修改？`)) return;
    saveDemandApproval(withdrawDemand(focusApproval, nowString()));
    setPickedStep(null);
  };
  // 撤銷同意（原因選填）：最高管理者＝退回排班者；排班者＝自己撤回重新編輯。
  const doRevokeApproval = () => {
    if (focusApproval?.status !== "approved") return;
    const released = focusReleasedAt ? "已發布到助理排休頁的人數不收回，助理仍可繼續申請排休。" : "";
    const action = isOwner ? "退回給排班者修改" : "回到「醫師與人數」修改，改完要重新送給管理者確認";
    if (!window.confirm(`撤銷同意${fullMonthLabel(focusMonth)}助理人數，${action}？${released}`)) return;
    const reopened = returnDemand(focusApproval, withdrawReason, nowString());
    saveDemandApproval(isOwner ? reopened : { ...reopened, withdrawn: true });
    setWithdrawReason("");
    setPickedStep(null);
  };
  const revokeForm = (approval: NonNullable<typeof focusApproval>) => (
    <div className="review-form">
      <label>
        要再調整的話，可以撤銷同意、回到編輯（原因可不填）
        <textarea
          value={withdrawReason}
          maxLength={200}
          placeholder="例如：2 月醫師班有變動，請重新確認人數"
          onChange={(event) => setWithdrawReason(event.target.value)}
        />
      </label>
      <button className="button button-quiet" onClick={doRevokeApproval}>
        {isOwner ? "撤銷同意，退回排班者" : "撤銷同意，回到編輯"}
      </button>
      {focusReleasedAt && approval.month === focusMonth && <p className="assistant-hint">已發布到助理排休頁的人數不收回，助理仍可繼續申請排休。</p>}
    </div>
  );
  const returnedText = (approval: NonNullable<typeof focusApproval>) =>
    approval.withdrawn
      ? `已於 ${deadlineText(approval.returnedAt)} 撤回${approval.returnReason ? `：${approval.returnReason}` : ""}，修改後再送出。`
      : `管理者於 ${deadlineText(approval.returnedAt)} 退回${approval.returnReason ? `：${approval.returnReason}` : "。"}`;
  // 「發布與排休」：收回發布、暫停排休的原因（選填），重新發布／恢復時原本排休的處理方式。
  const [releaseReason, setReleaseReason] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [handling, setHandling] = useState<PreLeaveHandling>("keep");
  const handlingText = (value: PreLeaveHandling) =>
    value === "keep" ? "原本已登記的排休照常有效。" : "請助理重新確認原本的排休，人數不足的日子要先改掉。";
  const doRelease = () => {
    if (!focusApproval || unsavedAlert()) return;
    const again = focusApproval.releaseRevokedAt ? handlingText(handling) : "";
    if (!window.confirm(`發布${fullMonthLabel(focusMonth)}每診人數到助理排休頁？發布後，排休依日期開放。${again}`)) return;
    saveDemandApproval(releaseDemand(focusApproval, nowString(), handling));
    setHandling("keep");
  };
  const doRevokeRelease = () => {
    if (!focusApproval || !focusReleasedAt) return;
    if (!window.confirm(`收回${fullMonthLabel(focusMonth)}的人數發布？助理頁會回到「尚未開放」，看不到每診人數與熱門度；已登記的排休先保留，重新發布時再決定。`)) return;
    saveDemandApproval(revokeRelease(focusApproval, nowString(), releaseReason));
    setReleaseReason("");
  };
  const doPauseLeave = () => {
    if (!focusApproval) return;
    if (!window.confirm(`暫停${fullMonthLabel(focusMonth)}的排休？暫停中助理不能新增或取消排休申請；已登記的先保留，恢復時再決定。`)) return;
    saveDemandApproval(pauseLeave(focusApproval, nowString(), pauseReason));
    setPauseReason("");
  };
  // 第 4 步：大家都先確認過時，可以比日程提早截止排休，不必回去改日程。
  const doCloseLeaveEarly = (unconfirmedNames: string) => {
    if (!focusApproval) return;
    const info = scheduleOf(focusMonth);
    const waiting = unconfirmedNames ? `\n還沒重新確認排休：${unconfirmedNames}。` : "";
    if (
      !window.confirm(
        `日程上一般排休要到 ${leaveLastDay(info)} 才截止，現在還沒到。\n提早截止後，助理就不能再新增、修改或取消排休申請。${waiting}\n確定要提早完成這一步嗎？`,
      )
    )
      return;
    saveDemandApproval(closeLeaveEarly(focusApproval, nowString()));
    setPickedStep(null);
  };
  const doReopenLeave = () => {
    if (!focusApproval?.leaveClosedAt) return;
    if (!window.confirm(`重新開放${fullMonthLabel(focusMonth)}的排休？助理可以再新增、修改或取消排休申請，到日程原本的最後一天 ${leaveLastDay(scheduleOf(focusMonth))} 截止。`)) return;
    saveDemandApproval(reopenLeave(focusApproval));
    setPickedStep(null);
  };
  const doResumeLeave = () => {
    if (!focusApproval?.leavePausedAt) return;
    if (!window.confirm(`恢復${fullMonthLabel(focusMonth)}的排休？${handlingText(handling)}`)) return;
    saveDemandApproval(resumeLeave(focusApproval, nowString(), handling));
    setHandling("keep");
  };
  const doApproveAndRelease = () => {
    if (unsavedAlert()) return;
    if (!window.confirm(`直接用系統目前算的人數（${demandTotals}）核定並發布${fullMonthLabel(focusMonth)}？發布後，排休依日期開放。`)) return;
    saveDemandApproval(approveAndRelease(focusMonth, focusDemands, nowString(), focusApproval));
  };
  const goToStep = (month: string, step: WorkflowStepId) => {
    if (viewOnly) return router.push(`/workbench?month=${month}&step=${step}`);
    setAnchor(`${month}-01`);
    setViewMode("month");
    setPickedStep({ month, step });
  };

  const assistants = courseProfile.people.filter((person) => person.role === "assistant");
  const selectedPerson = courseProfile.people.find((person) => person.id === selected?.personId);
  const selectedEntries = selected ? findEntries(entries, selected.date, selected.personId) : [];

  // 醫師班自動依醫師班表同步（DoctorScheduleSync）；會移除助理班的月份要管理者按下才套用。
  const doctorSync = useDoctorSync();
  async function applyDoctorSync(month: string) {
    const item = doctorSync.plan.blocked.find((blocked) => blocked.month === month);
    if (!item) return;
    if (
      !window.confirm(
        `套用醫師班表的變更到${fullMonthLabel(month)}？有些診已經沒有醫師，會一起移除那些診的助理班 ${item.assistantRemoved} 人次（休假不變）。`,
      )
    ) {
      return;
    }
    setAutoBusy(true);
    await doctorSync.apply(month);
    setAutoBusy(false);
    setAutoMessage(`已套用${fullMonthLabel(month)}的醫師班表變更，移除助理班 ${item.assistantRemoved} 人次；缺人的診請再按一鍵排班補齊。`);
  }

  async function runAutoSchedule() {
    const demandFor = (date: string, shiftId: string, current: ScheduleEntry[]) =>
      evaluateSessionDemand(
        current,
        courseProfile.people,
        [date],
        courseProfile.shifts.filter((shift) => shift.id === shiftId),
        staffingRules,
        adjustments,
      )[0]?.total ?? 0;
    const stats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0, splitWeek: 0, requested: 0 };
    if (editableDates.length === 0) {
      setAutoMessage(`${viewMode === "month" ? "本月" : "本週的月份"}班表已正式公告並鎖定，不能再排班。`);
      return;
    }
    // 能力排班（第 5 階段）：有能力表的月份才照能力排；指定安排不管有沒有能力表都先排。
    const assistantSet = new Set(ASSISTANT_IDS);
    const shiftIds = courseProfile.shifts.map((shift) => shift.id);
    const levelsFor = (date: string) => abilityFor(abilities, monthOf(date))?.levels ?? null;
    const placement = {
      canAssign: (personId: string, date: string, shiftId: string, current: ScheduleEntry[]) =>
        canAssignShift(current, personId, date, shiftId, LABOR_SETTINGS, undefined, requests),
      leaveOff: (personId: string, date: string, shiftId: string) => isSessionLeave(requests, date, personId, shiftId),
      requestedOff: (personId: string, date: string, shiftId: string) => hasShiftRequest(requests, date, personId, shiftId),
      doctorIds: DOCTOR_ID_SET,
    };
    const editableSet = new Set(editableDates);
    const pre: ScheduleEntry[] = [];
    for (const month of months) {
      pre.push(...placeAssignments([...entries, ...pre], trainingPlans[month]?.assignments ?? [], editableSet, placement));
    }
    for (const month of months) {
      const levels = abilityFor(abilities, month)?.levels ?? null;
      if (!levels) continue;
      const learners = doctorTargets(trainingPlans[month], levels).learner;
      pre.push(...placeLearners([...entries, ...pre], learners, editableDates.filter((date) => monthOf(date) === month), shiftIds, placement));
    }
    const hooks = abilityHooks({ levelsFor, planFor: (date) => trainingPlans[monthOf(date)], doctorIds: DOCTOR_ID_SET, assistantIds: assistantSet });
    const base = [...entries, ...pre];
    const planned = planAutoSchedule(base, courseProfile.people, editableDates, courseProfile.shifts, demandFor, undefined, 3, {
      preferences: schedulingPreferences,
      stats,
      canAssign: placement.canAssign,
      loadOf: (personId, current) =>
        months.reduce((sum, month) => sum + summarizeMonth(current, personId, month, LABOR_SETTINGS, requests).paidMinutes, 0),
      requestedOff: placement.requestedOff,
      leaveOff: placement.leaveOff,
      excludeFromDemand: isLearnerEntry,
      coverageOf: hooks.coverageOf,
      trainingOf: hooks.trainingOf,
    });
    // 第二輪補工時：只補整個月都能編輯的月份（週檢視不補，避免整月的工時塞進同一週）。
    const topUpStats: RelaxStats = { triple: 0, consecutiveTriple: 0, eveningStreak: 0, splitWeek: 0 };
    const topUpMonths = months.filter((month) => monthDates(month).every((date) => editableSet.has(date)));
    const topUpDates = editableDates.filter((date) => topUpMonths.includes(monthOf(date)));
    const flexPlanned =
      topUpDates.length === 0
        ? []
        : planHourTopUp([...base, ...planned], courseProfile.people, topUpDates, courseProfile.shifts, {
            targetOf: (_personId, month) => targetRange(month, LABOR_SETTINGS, laborTargets[month]),
            paidOf: (personId, month, current) => summarizeMonth(current, personId, month, LABOR_SETTINGS, requests).paidMinutes,
            canAssign: (personId, date, shiftId, current, limit) =>
              canAssignShift(current, personId, date, shiftId, LABOR_SETTINGS, limit, requests),
            preferences: schedulingPreferences,
            requestedOff: (personId, date, shiftId) => hasShiftRequest(requests, date, personId, shiftId),
            note: FLEX_SHIFT_NOTE,
            stats: topUpStats,
          });
    // 排完後同一天交換午診與晚診（一樣長，工時不變）：先讓兩頭班變少、變平均，再打散連續晚診。
    const repairOptions = {
      assistantIds: new Set(ASSISTANT_IDS),
      eveningShiftId: schedulingPreferences.eveningShiftId,
      maxConsecutiveEvenings: schedulingPreferences.maxConsecutiveEvenings,
      blocked: (personId: string, date: string, shiftId: string) => hasShiftRequest(requests, date, personId, shiftId),
      // 交換後，配得到可獨立的人不能變少。
      canSwap: hooks.canSwap,
    };
    const balanced = balanceSplitShifts(entries, [...pre, ...planned, ...flexPlanned], courseProfile.shifts, {
      ...repairOptions,
      maxSplitDaysPerWeek: schedulingPreferences.maxSplitDaysPerWeek,
    });
    const swapped = breakEveningStreaks(entries, balanced, courseProfile.shifts, repairOptions);
    // 最後替新排的班記工作（跟哪位醫師、櫃台、流動）；培訓目標的人優先配給他要跟的醫師；
    // 櫃台、流動照每診需求的組成排，以那個崗位為主的人先拿（使用者 2026-10-31）。
    const postsBySession = new Map(demands.map((demand) => [`${demand.date}|${demand.shiftId}`, postSlotsOf(demand)]));
    const allPlanned = assignTasks(entries, swapped, levelsFor, DOCTOR_ID_SET, assistantSet, hooks.prefer, {
      postsFor: (date, shiftId) => postsBySession.get(`${date}|${shiftId}`),
      postRank: hooks.postRank,
      holdBack: hooks.holdBack,
    });
    const underTarget = topUpMonths.flatMap((month) => {
      const target = targetRange(month, LABOR_SETTINGS, laborTargets[month]);
      if (!target) return [];
      return ASSISTANT_IDS.filter(
        (id) => summarizeMonth([...entries, ...allPlanned], id, month, LABOR_SETTINGS, requests).paidMinutes < target.minMinutes,
      ).map((id) => ASSISTANT_NAMES.get(id) ?? id);
    });
    const after = evaluateSessionDemand(
      [...entries, ...allPlanned],
      courseProfile.people,
      editableDates,
      courseProfile.shifts,
      staffingRules,
      adjustments,
    );
    const missing = after.reduce((sum, demand) => sum + Math.max(0, demand.total - demand.scheduled), 0);
    const scope = viewMode === "month" ? "本月" : "本週";
    const shortNote =
      missing > 0
        ? `助理人數或正常工時不足，仍缺 ${missing} 人次（紅色診次）；不足的部分請手動安排或加班。`
        : `${scope}所有診次都已補齊。`;
    // 用排完的實際結果計算（同排班統計），不是排的過程中放寬的次數。
    const finalEntries = [...entries, ...allPlanned].filter((entry) => months.includes(monthOf(entry.date)));
    const tripleDays = months.reduce(
      (sum, month) =>
        sum + ASSISTANT_IDS.reduce((count, id) => count + countShiftPatterns(finalEntries, id, month, schedulingPreferences.eveningShiftId).tripleDays, 0),
      0,
    );
    const splitDays = ASSISTANT_IDS.reduce(
      (sum, id) => sum + splitDaysOf(finalEntries, id, schedulingPreferences.shiftOrder).length,
      0,
    );
    const streakDays = ASSISTANT_IDS.reduce(
      (sum, id) => sum + eveningStreakExcess(finalEntries, id, schedulingPreferences.eveningShiftId, schedulingPreferences.maxConsecutiveEvenings),
      0,
    );
    const relaxNote =
      `排完後共 ${tripleDays} 人次三診、${splitDays} 人次兩頭班` +
      (streakDays > 0 ? `、${streakDays} 天晚診連續超過 ${schedulingPreferences.maxConsecutiveEvenings} 天` : `，沒有晚診連續超過 ${schedulingPreferences.maxConsecutiveEvenings} 天`) +
      "（詳見排班統計）。" +
      (stats.requested ? `有 ${stats.requested} 人次排到助理「希望不排」的診（班表上方塊裡有「!」），請確認。` : "");
    const topUpNote =
      topUpMonths.length === 0
        ? "補工時（機動）請切到月檢視再按一次。"
        : (flexPlanned.length > 0 ? `為了補到目標工時，加排 ${flexPlanned.length} 診「${FLEX_SHIFT_NOTE}」。` : "") +
          (underTarget.length > 0 ? `仍低於目標下限：${underTarget.join("、")}（可排的診不夠，請手動調整）。` : "");
    const abilityNote = abilityWarnings([...entries, ...allPlanned]);
    if (allPlanned.length === 0) {
      setAutoMessage(`沒有可再補的助理，已排的班與休假都保持不變。${shortNote}${topUpNote}${abilityNote}`);
      return;
    }
    setAutoBusy(true);
    await saveEntries(allPlanned);
    setAutoBusy(false);
    const preNote = pre.length > 0 ? `（含指定安排、帶新手 ${pre.length} 人次）` : "";
    setAutoMessage(`已依需求補上 ${planned.length + pre.length} 人次助理${preNote}，請人工確認。${shortNote}${topUpNote}${relaxNote}${abilityNote}`);

    /** 能力與培訓清單：沒排到的指定安排、沒達到的培訓目標、沒有可獨立的人跟的醫師。 */
    function abilityWarnings(final: ScheduleEntry[]): string {
      const name = (id: string) => ASSISTANT_NAMES.get(id) ?? id;
      const doctorName = (id: string) => courseProfile.people.find((person) => person.id === id)?.displayName ?? id;
      const missed = months.flatMap((month) =>
        (trainingPlans[month]?.assignments ?? []).filter((item) => editableSet.has(item.date) && assignmentStatus(item, final) !== "done"),
      );
      const short = months.flatMap((month) =>
        (trainingPlans[month]?.targets ?? []).flatMap((target) => {
          const progress = targetProgress(target, final, month);
          return progress.short > 0 ? [`${name(target.personId)} 少 ${progress.short} 診`] : [];
        }),
      );
      const uncovered = uncoveredSessions(final, editableDates, shiftIds, levelsFor, DOCTOR_ID_SET, assistantSet);
      const postNames: Record<string, string> = { counter: "櫃台", "float-1": "流動 1F", "float-2": "流動 2F" };
      // 只看這次有新排的診（舊的班沒記工作，不算）。
      const touched = new Set(allPlanned.map((entry) => `${entry.date}|${entry.shiftId}`));
      const unfilled = unfilledPostSessions(final, editableDates, shiftIds, (date, shiftId) => postsBySession.get(`${date}|${shiftId}`), levelsFor, assistantSet).filter(
        (item) => touched.has(`${item.date}|${item.shiftId}`),
      );
      const sample = <T,>(list: T[], text: (item: T) => string) =>
        list.slice(0, 5).map(text).join("、") + (list.length > 5 ? ` 等 ${list.length} 項` : "");
      return (
        (missed.length > 0
          ? `指定安排有 ${missed.length} 項沒排上：${sample(missed, (item) => `${name(item.personId)} ${formatDay(item.date)} ${shiftLabelOf(item.shiftId)}`)}（休假、請假或超過工時規定）。`
          : "") +
        (short.length > 0 ? `培訓目標沒達到：${sample(short, (text) => text)}。` : "") +
        (uncovered.length > 0
          ? `有 ${uncovered.length} 診的醫師沒有可獨立的人跟：${sample(uncovered, (item) => `${formatDay(item.date)} ${shiftLabelOf(item.shiftId)} ${item.doctorIds.map(doctorName).join("、")}`)}，請手動調整。`
          : "") +
        (unfilled.length > 0
          ? `有 ${unfilled.length} 診的櫃台或流動沒排滿（那一診會的人不夠或人數不夠）：${sample(unfilled, (item) => `${formatDay(item.date)} ${shiftLabelOf(item.shiftId)} ${[...new Set(item.posts)].map((post) => postNames[post]).join("、")}`)}。`
          : "")
      );
    }
  }

  const showWarnings = !viewOnly && (activeStep === "schedule" || reviewStep || activeStep === "confirm" || activeStep === "publish");
  // 完整班表（含助理）到「排班」以後才需要；之前的步驟可自行展開。
  const gridGroup = activeStep === "demand" || activeStep === "review" ? null : showWarnings ? "late" : "early";
  const [boardView, setBoardView] = useState<"table" | "work">("table");
  const workAllowed = viewOnly || activeStep === "schedule" || reviewStep || activeStep === "confirm" || activeStep === "publish";
  const showWork = workAllowed && boardView === "work";
  const gridVisible = !showWork && (viewOnly || (gridGroup !== null && gridOpen[gridGroup]));
  const toggleGrid = () => {
    if (!gridGroup) return;
    if (gridVisible) setSelected(null);
    setGridOpen({ ...gridOpen, [gridGroup]: !gridVisible });
  };

  /** 第 1、2 步：月曆／班表切換。班表檢視點日期會切回月曆並展開那一天。 */
  const demandArea = (calendarProps: ComponentProps<typeof DemandCalendar>) => (
    <>
      <Segmented options={DEMAND_VIEWS} value={demandView} onChange={setDemandView} label="醫師與人數檢視方式" className="demand-view-toggle" />
      {demandView === "calendar" ? (
        <DemandCalendar {...calendarProps} />
      ) : (
        <>
          <p className="assistant-hint help-line">
            點日期或格子{calendarProps.editing ? "修改那一天" : "看那一天"}。
            <HelpTip title="班表檢視" guide="step-demand">
              <p>
                {calendarProps.editing
                  ? "點日期或那一欄的格子，就地修改那天的醫師、人數、加開或休診；改過的日子標「未存」，按「儲存」才生效。"
                  : "點日期或那一欄的格子，看那天的醫師與人數算法。"}
              </p>
            </HelpTip>
          </p>
          <MonthGrid
            dates={monthDates(calendarProps.month)}
            doctors={doctors}
            assistants={assistants}
            entries={previewEntries}
            demands={calendarDemands}
            selected={null}
            onSelect={() => undefined}
            describe={describeEntries}
            formatDay={formatDay}
            requestedOf={requestedOf}
            reasonOf={reasonOf}
            demandOnly
            editingDate={gridEdit?.date}
            changedDates={calendarProps.changedDates}
            hoverTip={(date, personId) => {
              const tipProps = {
                date,
                today: calendarProps.demands.filter((demand) => demand.date === date),
                sessions: calendarProps.sessions,
                closureLabel: calendarProps.editing?.config.closures.find((closure) => closure.date === date)?.label,
                hint: calendarProps.editing || calendarProps.noteEditor ? "點一下可以修改" : "點一下看詳細",
              };
              return personId ? <DoctorHoverContent {...tipProps} personId={personId} /> : <DayHoverContent {...tipProps} />;
            }}
            onDateClick={(date, anchor, personId) =>
              setGridEdit(gridEdit?.date === date && gridEdit.personId === personId ? null : { date, anchor, personId })
            }
          />
          {gridEdit?.date.startsWith(calendarProps.month) && (
            <FloatingPanel anchor={gridEdit.anchor} onClose={() => setGridEdit(null)}>
              {gridEdit.personId && DOCTOR_ID_SET.has(gridEdit.personId) ? (
                <DoctorDayEditor
                  key={`${gridEdit.date}_${gridEdit.personId}`}
                  date={gridEdit.date}
                  personId={gridEdit.personId}
                  demands={calendarProps.demands.filter((demand) => demand.date === gridEdit.date)}
                  sessions={calendarProps.sessions}
                  editing={calendarProps.editing}
                  onClose={() => setGridEdit(null)}
                  onOpenDay={(shiftId) => setGridEdit({ ...gridEdit, personId: undefined, shiftId })}
                />
              ) : (
                <DemandDayEditor
                  key={`${gridEdit.date}_${gridEdit.shiftId ?? ""}`}
                  date={gridEdit.date}
                  initialShift={gridEdit.shiftId}
                  demands={calendarProps.demands.filter((demand) => demand.date === gridEdit.date)}
                  sessions={calendarProps.sessions}
                  editing={calendarProps.editing}
                  onAdjust={calendarProps.onAdjust}
                  note={calendarProps.notes?.[gridEdit.date]}
                  noteEditor={calendarProps.noteEditor}
                  onClose={() => setGridEdit(null)}
                />
              )}
            </FloatingPanel>
          )}
        </>
      )}
    </>
  );

  // 流程各步驟的內容：只顯示這一步要用的資訊與按鈕。
  function workflowBody(): ReactNode {
    const month = focusMonth;
    const info = scheduleOf(month);
    const publication = publicationOf(month);
    const locked = isLocked(month);
    const summary = summarizeResponses(publication, ASSISTANT_IDS, nowString());
    const names = (ids: string[]) => ids.map((id) => ASSISTANT_NAMES.get(id) ?? id).join("、");
    const preLeaves = preLeaveCounts(month);
    const review = reviews[month] ?? null;
    // 值班主管：送行政檢查前每一診都要有主管。
    const noSupervisor = monthSupervisorIssues(entries, month, dutySupervisors).filter((issue) => issue.reason === "none").length;
    const supervisorTool = (
      <DutySupervisorPanel id="step-supervisor" collapsible month={month} entries={entries} editable={!stepReadOnly} actorName={actorName} />
    );
    const doSendToClerk = () => {
      if (noSupervisor > 0) return;
      saveReview(sendToClerk(review, month, nowString(), actorName));
      showToast(`已送行政專員檢查；檢查期間仍可以改班表`);
    };
    const doPreannounce = () => {
      const deadline = confirmDeadlineFor(today, entries, courseProfile.people, courseProfile.shifts);
      if (!window.confirm(`預公告${fullMonthLabel(month)}班表？助理需在 ${deadlineText(deadline)} 前確認。`)) return;
      savePublication(preannounce(publication, nowString(), deadline));
    };
    // 確認期限還沒到也可以提早結束確認、正式公告（例如大家都先確認過了）。
    const beforeConfirmDeadline = !!publication.confirmDeadline && nowString() <= publication.confirmDeadline;
    const doPublish = () => {
      const waiting = summary.pending.length;
      const message = beforeConfirmDeadline
        ? `確認期限還沒到（期限 ${deadlineText(publication.confirmDeadline)}）${waiting > 0 ? `，還有 ${waiting} 位助理沒回覆` : ""}。\n正式公告後班表會鎖定，助理不能再提出問題。\n確定要提早完成確認、正式公告${fullMonthLabel(month)}班表嗎？`
        : `${waiting > 0 ? `還有 ${waiting} 位助理未回覆。` : ""}正式公告${fullMonthLabel(month)}班表？公告後班表會鎖定。`;
      if (!window.confirm(message)) return;
      savePublication(publish(publication, nowString()));
    };
    // 請助理重新確認排休時，還沒確認的人（只算這個月有排休的）。
    const unconfirmed = ASSISTANT_IDS.filter(
      (id) => needsReconfirm(focusApproval, id) && entries.some((entry) => entry.personId === id && isPreLeave(entry) && entry.date.startsWith(month)),
    );
    const reconfirmWarn = unconfirmed.length > 0 && (
      <p className="month-status-warn">還沒重新確認排休：{names(unconfirmed)}（請提醒他們打開排休頁確認）。</p>
    );
    const doWithdrawPreannounce = () => {
      const answered = summary.confirmed.length + summary.issues.length;
      const note = answered > 0 ? `已有 ${answered} 位助理回覆，撤回後會清掉，下次預公告時要重新確認。` : "";
      if (!window.confirm(`撤回${fullMonthLabel(month)}預公告，回到「排班」繼續修改？撤回後助理暫時看不到這個月班表。${note}`)) return;
      savePublication(withdrawPublication(publication, nowString()));
      setPickedStep(null);
    };
    const doWithdrawPublished = () => {
      if (!withdrawReason.trim()) return;
      if (!window.confirm(`撤回${fullMonthLabel(month)}正式公告，回到「排班」？班表會解除鎖定，助理暫時看不到這個月班表；改好後要重新預公告、確認、公告。`)) return;
      savePublication(withdrawPublication(publication, nowString(), withdrawReason));
      setWithdrawReason("");
      setPickedStep(null);
    };
    const withdrawnLine = publication.status === "draft" && publication.withdrawnAt && (
      <p className="month-status-warn">
        已於 {deadlineText(publication.withdrawnAt)} 撤回{publication.withdrawnFrom === "published" ? "正式公告" : "預公告"}
        {publication.withdrawReason ? `：${publication.withdrawReason}` : ""}。改好後請重新預公告。
      </p>
    );
    const mismatchList = () => (
      <ul className="issue-list">
        {mismatches.map((item) => (
          <li key={`${item.date}_${item.shiftId}`}>
            {formatDay(item.date)} {shiftLabelOf(item.shiftId)}：
            {item.approved === undefined ? "新的診" : `送出 ${item.approved} 人`}，
            {item.current === undefined ? "現在已沒有醫師" : `現在 ${item.current} 人`}
          </li>
        ))}
      </ul>
    );
    // 整頁草稿：列出還沒儲存的修改；改回原樣的項目自動消失。
    const draftBar = () =>
      draft.dirty ? (
        <div className="draft-bar" role="status">
          <strong>還沒儲存的修改（{draft.changes.length} 項）</strong>
          <ul className="issue-list">
            {draft.changes.map((change) => <li key={change.key}>{change.text}</li>)}
          </ul>
          <div className="workflow-actions">
            <button className="button" onClick={doSaveDraft}>儲存</button>
            <button className="button button-quiet" onClick={doDiscardDraft}>放棄修改</button>
          </div>
        </div>
      ) : (
        <div className="draft-bar is-clean" role="status">
          <strong>所有修改都已儲存。</strong>
        </div>
      );
    const unsavedWarn = () =>
      draft.dirty && (
        <p className="month-status-warn">
          「醫師與人數」還有 {draft.changes.length} 項沒儲存的修改，請先回第一步儲存或放棄，才能繼續。
        </p>
      );
    const editingProps = {
      config: draft.config,
      onChange: draft.setConfig,
      openSetting: (target: SettingTarget, date: string) => setSettingFocus({ target, date, nonce: Date.now() }),
    };
    const settingsPanel = (
      <DoctorScheduleSettings
        config={draft.config}
        month={month}
        focus={settingFocus}
        onChange={draft.setConfig}
        dirty={draft.dirty}
        onDiscard={draft.discard}
      />
    );
    switch (activeStep) {
      case "demand": {
        // 版面（使用者 2026-10-30，第 3 輪）：最上面一個主要按鈕（排班者＝送給管理者確認、最高管理者＝核定並發布）→「還差什麼」→ 月曆 → 收起來的長期設定。
        const sessionCount = calendarDemands.length;
        const monthSessions = sessionsForMonth(draft.config, month);
        const returned = focusApproval?.status === "returned";
        const canSubmit = !focusApproval || returned || mismatches.length > 0;
        const returnNotes = returned ? focusApproval.returnNotes ?? [] : [];
        const showSubmit = canSubmit && !isOwner;
        const showOwnerApprove = isOwner && !(focusApproval?.status === "approved" && focusReleasedAt && mismatches.length === 0);
        const checklist: ChecklistItem[] = [
          {
            id: "doctors",
            ok: sessionCount > 0,
            level: "block",
            title: "醫師看診",
            detail:
              sessionCount > 0
                ? `本月共 ${demandTotals}`
                : monthSessions
                  ? "這個月還沒有醫師看診：點月曆日期勾醫師，或到「每週固定班」設定"
                  : "不在醫師行事曆範圍內：到下面「行事曆範圍」延長",
            actionLabel: "長期設定",
            onAction: sessionCount > 0 ? undefined : () => jumpTo(".doctor-settings"),
          },
          {
            id: "saved",
            ok: !draft.dirty,
            level: "block",
            title: "修改",
            detail: draft.dirty ? `${draft.changes.length} 項還沒儲存` : "都已儲存",
            actionLabel: "儲存",
            onAction: draft.dirty ? () => jumpTo(".draft-bar") : undefined,
          },
          ...(focusApproval && mismatches.length > 0
            ? [{ id: "mismatch", ok: false, level: "warn" as const, title: "和送出時不同", detail: `${mismatches.length} 診，要重新送出`, actionLabel: "看哪幾診", onAction: () => jumpTo(".mismatch-box") }]
            : []),
          ...(returned
            ? [{
                id: "returned",
                ok: false,
                level: "warn" as const,
                title: "管理者退回",
                detail: returnNotes.length > 0 ? `${returnNotes.length} 天有意見，改好後重新送出` : "改好後重新送出",
                actionLabel: "看意見",
                onAction: () => jumpTo(".return-box"),
              }]
            : []),
        ];
        return (
          <>
            <div className="step-head-actions">
              {(showSubmit || showOwnerApprove) && sessionCount > 0 && (
                <div className={`step-head-buttons ${draft.dirty ? "" : "workflow-cta"}`}>
                  {showSubmit && (
                    <button className="button" disabled={draft.dirty} title={draft.dirty ? "請先儲存修改" : ""} onClick={doSubmitDemand}>
                      {focusApproval ? "重新送給管理者確認" : "送給管理者確認"}
                    </button>
                  )}
                  {showOwnerApprove && (
                    <button className="button" disabled={draft.dirty} title={draft.dirty ? "請先儲存修改" : ""} onClick={doApproveAndRelease}>
                      核定並發布
                    </button>
                  )}
                  {draft.dirty && <span className="disabled-reason">請先儲存修改</span>}
                </div>
              )}
              <HelpTip title="醫師與人數" guide="step-demand">
                <p>先確認每天每一診的醫師，系統依醫師人數、樓層與兒牙醫師，算出每一診最少需要的助理人數。</p>
                <p>點日期可以改那天的醫師、按 ＋／－ 調整人數；調整過的標「調」，可恢復。整頁改完按一次「儲存」，再送出。</p>
                {isOwner && <p>最高管理者按「核定並發布」＝直接同意這份人數並發布到助理排休頁，不用另外送審。</p>}
              </HelpTip>
            </div>
            <ScheduleChecklist items={checklist} />
            {draft.dirty && draftBar()}
            {returned && (
              <div className="return-box">
                <p className="month-status-warn">{returnedText(focusApproval)}</p>
                {returnNotes.length > 0 && (
                  <ul className="issue-list">
                    {returnNotes.map((note) => (
                      <li key={note.date}>{formatDay(note.date)}：{note.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {focusApproval && mismatches.length > 0 && (
              <div className="mismatch-box">
                <p className="month-status-warn">醫師班或人數調整後，有 {mismatches.length} 診的人數和送出時不同，需重新送出確認：</p>
                {mismatchList()}
              </div>
            )}
            {!canSubmit && focusApproval?.status === "submitted" && (
              <p className="month-status-item">
                已於 {deadlineText(focusApproval.submittedAt)} 送出，等管理者核准。
                <button className="button button-quiet" onClick={doWithdrawDemand}>撤回送出，繼續修改</button>
              </p>
            )}
            {!canSubmit && focusApproval?.status === "approved" && (
              <>
                <p className="month-status-item">管理者已於 {deadlineText(focusApproval.approvedAt)} 同意人數。</p>
                {revokeForm(focusApproval)}
              </>
            )}
            {monthSessions &&
              demandArea({
                month,
                demands: calendarDemands,
                sessions: monthSessions,
                editing: editingProps,
                onAdjust: draft.setAdjustment,
                changedDates,
                notes: Object.fromEntries(returnNotes.map((note) => [note.date, note.text])),
              })}
            {settingsPanel}
          </>
        );
      }
      case "review": {
        if (!focusApproval || focusApproval.status === "returned") {
          return (
            <p className="month-status-item">
              {focusApproval?.status === "returned"
                ? `${returnedText(focusApproval)}排班者修改後會重新送出。`
                : "排班者還沒送出這個月的人數，請到「醫師與人數」。"}
            </p>
          );
        }
        if (focusApproval.status === "approved" && mismatches.length === 0 && !draft.dirty) {
          return (
            <>
              <p className="month-status-item">管理者已於 {deadlineText(focusApproval.approvedAt)} 同意人數（{demandTotals}）。</p>
              {revokeForm(focusApproval)}
              {sessionsForMonth(draft.config, month) &&
                demandArea({ month, demands: calendarDemands, sessions: sessionsForMonth(draft.config, month) ?? undefined })}
            </>
          );
        }
        if (!isOwner) {
          return (
            <p className="month-status-item">
              {mismatches.length > 0
                ? "人數和送出時不同，請到「醫師與人數」重新送出。"
                : `排班者已於 ${deadlineText(focusApproval.submittedAt)} 送出${fullMonthLabel(month)}人數（${demandTotals}），等管理者確認。`}
            </p>
          );
        }
        const reviewSessions = sessionsForMonth(draft.config, month);
        // 版面（第 3 輪）：最上面「同意人數」（主要）＋「退回給排班者」（打開下面的意見欄）→「還差什麼」→ 收起來的意見欄 → 月曆。
        const reviewChecklist: ChecklistItem[] = [
          {
            id: "saved",
            ok: !draft.dirty,
            level: "block",
            title: "修改",
            detail: draft.dirty ? `${draft.changes.length} 項還沒儲存` : "都已儲存（同意時用現在的人數）",
            actionLabel: "儲存",
            onAction: draft.dirty ? () => jumpTo(".draft-bar") : undefined,
          },
          ...(mismatches.length > 0
            ? [{ id: "mismatch", ok: false, level: "warn" as const, title: "和送出時不同", detail: `${mismatches.length} 診（同意時會用現在的人數）`, actionLabel: "看哪幾診", onAction: () => jumpTo(".mismatch-box") }]
            : []),
          ...(monthNotes.length > 0
            ? [{ id: "notes", ok: false, level: "warn" as const, title: "逐日意見", detail: `已寫 ${monthNotes.length} 天，按「退回給排班者」才會送出`, actionLabel: "看意見", onAction: () => jumpTo(".return-form") }]
            : []),
        ];
        return (
          <>
            <p className="month-status-item">
              排班者已於 {deadlineText(focusApproval.submittedAt)} 送出{fullMonthLabel(month)}人數（{demandTotals}），請確認人數是否合理。
              <HelpTip title="管理者核准人數" guide="step-review">
                <p>兩種做法擇一：</p>
                <p>① 直接在月曆上改醫師或人數，按「儲存」後「同意人數」。</p>
                <p>② 點日期寫那天的意見，按「退回給排班者」請他修改。</p>
              </HelpTip>
            </p>
            <div className="step-head-actions">
              <div className={`step-head-buttons ${draft.dirty ? "" : "workflow-cta"}`}>
                <button className="button" disabled={draft.dirty} title={draft.dirty ? "請先儲存修改" : ""} onClick={doApprove}>
                  同意人數
                </button>
                {draft.dirty && <span className="disabled-reason">請先儲存修改</span>}
                <button className="button button-quiet" onClick={() => jumpTo(".return-form")}>
                  退回給排班者
                </button>
              </div>
            </div>
            <ScheduleChecklist items={reviewChecklist} />
            {draft.dirty && draftBar()}
            {mismatches.length > 0 && (
              <div className="mismatch-box">
                <p className="month-status-item">有 {mismatches.length} 診和排班者送出時不同（同意時會用現在的人數）：</p>
                {mismatchList()}
              </div>
            )}
            <details className="tool-details review-form return-form">
              <summary className="help-line">
                <strong>退回給排班者</strong>
                <small className="assistant-hint">{monthNotes.length > 0 ? `已寫 ${monthNotes.length} 天意見` : "寫整體說明，或點月曆日期寫逐日意見"}</small>
              </summary>
              {monthNotes.length > 0 && (
                <ul className="issue-list">
                  {monthNotes.map((note) => (
                    <li key={note.date}>
                      {formatDay(note.date)}：{note.text}
                      <button className="link-button" onClick={() => setReviewNotes((current) => ({ ...current, [note.date]: "" }))}>刪除</button>
                    </li>
                  ))}
                </ul>
              )}
              <label>
                整體說明（可不填；點日期可寫逐日意見）
                <textarea
                  value={returnReason}
                  maxLength={200}
                  placeholder="例如：週六早診都太多，請改 3 人"
                  onChange={(event) => setReturnReason(event.target.value)}
                />
              </label>
              <button
                className="button button-quiet"
                disabled={!returnReason.trim() && monthNotes.length === 0}
                onClick={doReturn}
              >
                確定退回{monthNotes.length > 0 ? `（${monthNotes.length} 天意見）` : ""}
              </button>
            </details>
            {reviewSessions &&
              demandArea({
                month,
                demands: calendarDemands,
                sessions: reviewSessions,
                editing: editingProps,
                onAdjust: draft.setAdjustment,
                changedDates,
                noteEditor: {
                  notes: reviewNotes,
                  onChange: (date, text) => setReviewNotes((current) => ({ ...current, [date]: text })),
                },
              })}
            {settingsPanel}
          </>
        );
      }
      case "release": {
        const released = !!focusReleasedAt;
        const canRelease = focusApproval?.status === "approved" && mismatches.length === 0;
        const preLeavePeople = ASSISTANT_IDS.filter((id) =>
          entries.some((entry) => entry.personId === id && isPreLeave(entry) && entry.date.startsWith(month)),
        );
        const handlingChoice = preLeavePeople.length > 0 && (
          <fieldset className="handling-choice">
            <legend>已有 {preLeavePeople.length} 位助理登記排休，要怎麼處理？</legend>
            <label>
              <input type="radio" name="pre-leave-handling" checked={handling === "keep"} onChange={() => setHandling("keep")} />
              保留：原本的排休照常有效
            </label>
            <label>
              <input type="radio" name="pre-leave-handling" checked={handling === "reconfirm"} onChange={() => setHandling("reconfirm")} />
              請助理重新確認：打開排休頁時列出原本的排休，人數不足的日子要先改掉才能確認
            </label>
          </fieldset>
        );
        // 版面（第 4 輪）：最上面主要按鈕（發布／恢復排休）→「目前狀況」清單 → 月曆；收回發布、暫停排休收進「需要修改時」。
        const paused = !!focusApproval?.leavePausedAt;
        const canSchedule = !focusApproval?.releaseScheduled && !focusApproval?.releaseRevokedAt && today < focusTimeline.release;
        const releaseItems: ChecklistItem[] = [
          {
            id: "approved",
            ok: canRelease || released,
            level: "block",
            title: "人數核准",
            detail: canRelease || released ? "管理者已同意人數" : "管理者同意人數後才能發布",
          },
          {
            id: "released",
            ok: released,
            level: "block",
            title: "發布到助理排休頁",
            detail: released
              ? `已於 ${deadlineText(focusReleasedAt)} 發布${focusApproval?.releasedAt ? "" : "（預約發布）"}`
              : focusApproval?.releaseScheduled
                ? `已預約 ${shortDate(focusTimeline.release)} 自動發布`
                : focusApproval?.releaseRevokedAt
                  ? `已於 ${deadlineText(focusApproval.releaseRevokedAt)} 收回${focusApproval.releaseRevokeReason ? `：${focusApproval.releaseRevokeReason}` : ""}，改好後重新發布`
                  : "還沒發布，助理還不能申請排休",
          },
          {
            id: "leave",
            ok: released && !paused,
            level: "warn",
            title: "排休",
            detail: paused
              ? `已暫停${focusApproval?.leavePauseReason ? `：${focusApproval.leavePauseReason}` : ""}，助理不能新增或取消`
              : phaseText(info),
          },
          {
            id: "applied",
            ok: true,
            level: "warn",
            title: "已申請排休",
            detail: preLeaves.length > 0 ? preLeaves.join("、") : "目前沒有",
          },
          ...(focusApproval?.reconfirm
            ? [{
                id: "reconfirm",
                ok: unconfirmed.length === 0,
                level: "warn" as const,
                title: "重新確認排休",
                detail: unconfirmed.length > 0 ? `還沒確認：${names(unconfirmed)}` : "有排休的助理都已確認",
              }]
            : []),
        ];
        return (
          <>
            <div className="step-head-actions">
              {!released && canRelease && !focusApproval?.releaseScheduled && (
                <button className="button" disabled={draft.dirty} onClick={doRelease}>
                  {focusApproval?.releaseRevokedAt ? "重新發布到助理排休頁" : "立即發布到助理排休頁"}
                </button>
              )}
              {!released && canRelease && canSchedule && (
                <button
                  className="button button-quiet"
                  disabled={draft.dirty}
                  onClick={() => {
                    if (!focusApproval) return;
                    if (!window.confirm(`預約在 ${shortDate(focusTimeline.release)} 自動發布${fullMonthLabel(month)}人數？日期到了助理就看得到；之前仍可立即發布或取消預約。`)) return;
                    saveDemandApproval(scheduleRelease(focusApproval, true));
                  }}
                >
                  預約在 {shortDate(focusTimeline.release)} 發布
                </button>
              )}
              {!released && canRelease && focusApproval?.releaseScheduled && (
                <>
                  <button className="button" disabled={draft.dirty} onClick={doRelease}>立即發布</button>
                  <button className="button button-quiet" onClick={() => focusApproval && saveDemandApproval(scheduleRelease(focusApproval, false))}>
                    取消預約
                  </button>
                </>
              )}
              {released && paused && <button className="button" onClick={doResumeLeave}>恢復排休</button>}
              <HelpTip title="發布與排休" guide="step-release">
                <p>發布後，助理的排休頁會顯示每一診需要的人數與熱門時段，排休依日期開放（人數發布後、而且日期到了才開放）。</p>
                <p>日期在流程列右上角「調整日程」調整。</p>
              </HelpTip>
            </div>
            <ScheduleChecklist label="目前狀況" items={releaseItems} />
            {unsavedWarn()}
            {((!released && canRelease && focusApproval?.releaseRevokedAt) || (released && paused)) && handlingChoice}
            {released && (
              <details className="tool-details review-form undo-tools">
                <summary className="help-line">
                  <strong>需要修改時</strong>
                  <small className="assistant-hint">{info.phase !== "closed" && !paused ? "暫停排休、收回發布" : "收回發布"}</small>
                </summary>
                {info.phase !== "closed" && !paused && (
                  <>
                    <label>
                      暫停排休（原因可不填）：暫停中助理不能新增或取消排休申請
                      <textarea
                        value={pauseReason}
                        maxLength={200}
                        placeholder="例如：人數有誤，修正後再開放"
                        onChange={(event) => setPauseReason(event.target.value)}
                      />
                    </label>
                    <button className="button button-quiet" onClick={doPauseLeave}>暫停排休</button>
                  </>
                )}
                <label>
                  收回發布（原因可不填）：助理頁回到尚未開放，已登記的排休保留
                  <textarea
                    value={releaseReason}
                    maxLength={200}
                    placeholder="例如：2 月醫師班有變動，人數要重算"
                    onChange={(event) => setReleaseReason(event.target.value)}
                  />
                </label>
                <button className="button button-quiet" onClick={doRevokeRelease}>收回發布</button>
              </details>
            )}
            {sessionsForMonth(draft.config, month) &&
              demandArea({ month, demands: calendarDemands, sessions: sessionsForMonth(draft.config, month) ?? undefined })}
          </>
        );
      }
      case "leaveClosed": {
        const shortOnes =
          info.phase === "longLeaveOnly" ? shortLongLeaveRequests(entries, month, leaveWindow.longLeaveMinDays) : [];
        const closedItems: ChecklistItem[] = [
          {
            id: "closed",
            ok: info.phase === "closed",
            level: "warn",
            title: "排休截止",
            detail: info.closedEarlyAt
              ? `已於 ${deadlineText(info.closedEarlyAt)} 提早截止（原訂最後一天 ${leaveLastDay(info)}）`
              : info.phase === "closed"
                ? `已截止（最後一天 ${leaveLastDay(info)}）`
                : `一般排休最後一天 ${leaveLastDay(info)}，之後自動截止；目前：${phaseText(info)}`,
          },
          {
            id: "applied",
            ok: true,
            level: "warn",
            title: "已申請排休",
            detail: preLeaves.length > 0 ? preLeaves.join("、") : "目前沒有",
          },
          ...(shortOnes.length > 0
            ? [{ id: "short", ok: false, level: "warn" as const, title: "長假只排 1 天", detail: `長假需 2 天以上：${names(shortOnes)}` }]
            : []),
          ...(focusApproval?.reconfirm && unconfirmed.length > 0
            ? [{ id: "reconfirm", ok: false, level: "warn" as const, title: "重新確認排休", detail: `還沒確認：${names(unconfirmed)}` }]
            : []),
        ];
        return (
          <>
            <div className="step-head-actions">
              {info.phase !== "closed" && focusApproval && (
                <button className="button" onClick={() => doCloseLeaveEarly(names(unconfirmed))}>提早截止排休</button>
              )}
              <HelpTip title="排休截止" guide="step-leaveClosed">
                <p>到了一般排休最後一天的隔天自動截止。已經和大家確認好時，可以按「提早截止排休」，不必等日程。</p>
                <p>要延後就用流程列右上角「調整日程」。</p>
              </HelpTip>
            </div>
            <ScheduleChecklist label="目前狀況" items={closedItems} />
          </>
        );
      }
      case "schedule": {
        // 版面（使用者 2026-10-30）：最上面兩個按鈕（送行政專員檢查＝主要、一鍵排班＝次要）→「還差什麼」清單 → 收起來的工具。
        const shortSessions = focusDemands.filter((demand) => demand.scheduled < demand.total).length;
        const hoursRange = targetRange(month, LABOR_SETTINGS, laborTargets[month]);
        const offTarget = hoursRange
          ? assistants.filter((person) => {
              const paid = summarizeMonth(entries, person.id, month, LABOR_SETTINGS, requests).paidMinutes;
              return paid < hoursRange.minMinutes || paid > hoursRange.maxMinutes;
            }).length
          : 0;
        const trainingLeft = trainingIssueCount(trainingPlans[month], entries, month);
        const checklist: ChecklistItem[] = [
          {
            id: "leave",
            ok: info.phase === "closed",
            level: "block",
            title: "排休截止",
            detail: info.phase === "closed" ? "已截止" : `截止後才能送檢查（${shortDate(info.deadline)} 截止）`,
          },
          {
            id: "supervisor",
            ok: noSupervisor === 0,
            level: "block",
            title: "值班主管",
            detail: noSupervisor === 0 ? "每一診都有" : `${noSupervisor} 診還沒有`,
            actionLabel: "指定",
            onAction: () => jumpTo("#step-supervisor"),
          },
          {
            id: "short",
            ok: shortSessions === 0,
            level: "warn",
            title: "每診人數",
            detail: shortSessions === 0 ? "每一診都補齊了" : `${shortSessions} 診缺人`,
            actionLabel: "補人",
            onAction: shortSessions > 0 ? () => jumpTo(".assign-panel") : undefined,
          },
          {
            id: "hours",
            ok: offTarget === 0,
            level: "warn",
            title: "工時",
            detail: !hoursRange ? "這個月還沒設定應上班天數" : offTarget === 0 ? `都在 ${formatHours(hoursRange.minMinutes)}～${formatHours(hoursRange.maxMinutes)} 小時內` : `${offTarget} 人不在目標內`,
            actionLabel: "看工時",
            onAction: () => jumpTo("#step-hours"),
          },
          ...(brokenRequests.length > 0
            ? [{
                id: "requests",
                ok: false,
                level: "warn" as const,
                title: "希望不排卻排入",
                detail: `${brokenRequests.length} 診（班表上方塊裡有「!」）：${brokenRequests
                  .slice(0, 3)
                  .map((request) => `${ASSISTANT_NAMES.get(request.personId)} ${formatDay(request.date)} ${shiftLabelOf(request.shiftId)}`)
                  .join("、")}${brokenRequests.length > 3 ? "…" : ""}`,
              }]
            : []),
          ...(trainingLeft > 0
            ? [{ id: "training", ok: false, level: "warn" as const, title: "培訓清單", detail: `${trainingLeft} 項沒照排`, actionLabel: "看清單", onAction: () => jumpTo(".training-panel") }]
            : []),
          ...(focusApproval?.status !== "approved"
            ? [{ id: "approval", ok: false, level: "warn" as const, title: "人數", detail: "還沒經管理者核准，建議先完成「人數」段" }]
            : []),
        ];
        const canSend = info.phase === "closed" && noSupervisor === 0;
        return (
          <>
            <div className="step-head-actions">
              {/* 已完成、只能看時不放按鈕（上方已有「退回到這一步」）。 */}
              {publication.status === "draft" && !stepReadOnly && (
                <button
                  className="button"
                  disabled={!canSend}
                  title={!canSend ? "清單裡打叉的項目處理完才能送" : ""}
                  onClick={doSendToClerk}
                >
                  送行政專員檢查
                </button>
              )}
              {!stepReadOnly && (
                <button className={`button ${publication.status === "draft" ? "button-quiet" : ""}`} onClick={runAutoSchedule} disabled={autoBusy || editableMonths.length === 0}>
                  {autoBusy ? "排班中…" : "一鍵排班"}
                </button>
              )}
              <HelpTip title="排班" guide="step-schedule">
                <p>一鍵排班依「助理需求」補齊畫面上整月（或整週）助理：盡量不排三診與連續晚診，不超過每月正常工時與休息規定。</p>
                <p>再補工時到目標區間；不覆蓋已排的班與休假。結果請人工確認，下面清單打叉的處理完才能送行政專員檢查。</p>
              </HelpTip>
            </div>
            {withdrawnLine}
            {reconfirmWarn}
            {review?.status === "returned" && (
              <p className="month-status-warn">最高管理者退回{review.returnReason ? `：${review.returnReason}` : ""}。改好後重新送行政專員檢查。</p>
            )}
            {review?.status === "editing" && <p className="month-status-item">已撤回送審，改好後重新送行政專員檢查。</p>}
            {publication.status === "draft" && <ScheduleChecklist items={checklist} />}
            {/* 不常改的工具收起來，要用再點開（培訓清單、值班主管、目標工時）。 */}
            <div className="step-tools">
              <TrainingPanel month={month} entries={entries} editable={!locked && !stepReadOnly} actorName={actorName} />
              {supervisorTool}
              <LaborTargetPanel
                id="step-hours"
                month={month}
                assistants={assistants}
                entries={entries}
                custom={laborTargets[month]}
                editable={!locked}
                onSave={(target) => setLaborTarget(month, target)}
              />
            </div>
          </>
        );
      }
      case "clerkCheck":
      case "ownerCheck":
        return (
          <ScheduleReviewPanel
            key={`${month}-${activeStep}-${review?.log.length ?? 0}`}
            step={activeStep}
            monthDates={monthDates(month)}
            review={review}
            actor={reviewActor}
            current={activeAccess === "current" && !viewOnly}
            snapshot={() => snapshotOf(entries, month, ASSISTANT_SET)}
            onSave={saveReview}
          />
        );
      case "confirm": {
        // 版面（第 4 輪）：最上面主要按鈕（預公告／正式公告）→「目前狀況」清單 → 有問題的回覆；撤回預公告收進「需要修改時」。
        const snapshotNote = review && <SnapshotChanges review={review} current={snapshotOf(entries, month, ASSISTANT_SET)} title="最高管理者核准之後" />;
        if (publication.status === "draft") {
          const approvedReview = reviewApproved(review);
          return (
            <>
              <div className="step-head-actions">
                {approvedReview && <button className="button" onClick={doPreannounce}>預公告給助理確認</button>}
              </div>
              {withdrawnLine}
              <ScheduleChecklist
                label="目前狀況"
                items={[
                  {
                    id: "approved",
                    ok: approvedReview,
                    level: "block",
                    title: "管理者核准班表",
                    detail: approvedReview ? "最高管理者已同意，可以預公告給助理確認" : "行政檢查、管理者核准都完成後才能預公告（助理還看不到）",
                  },
                ]}
              />
              {approvedReview && snapshotNote}
            </>
          );
        }
        if (publication.status === "published") {
          return <p className="month-status-item">助理確認已結束，已正式公告。</p>;
        }
        const noReply = summary.pending.length + summary.expired.length;
        return (
          <>
            <div className="step-head-actions">
              <button className="button" onClick={doPublish}>{beforeConfirmDeadline ? "提早結束確認，正式公告" : "正式公告"}</button>
            </div>
            <ScheduleChecklist
              label="目前狀況"
              items={[
                {
                  id: "deadline",
                  ok: !beforeConfirmDeadline,
                  level: "warn",
                  title: "確認期限",
                  detail: `${deadlineText(publication.confirmDeadline)}${beforeConfirmDeadline ? "（還沒到）" : "（已過）"}`,
                },
                { id: "confirmed", ok: true, level: "warn", title: "已確認", detail: `${summary.confirmed.length} 位` },
                {
                  id: "issues",
                  ok: summary.issues.length === 0,
                  level: "warn",
                  title: "有問題",
                  detail: summary.issues.length === 0 ? "沒有" : `${summary.issues.length} 位`,
                  actionLabel: "看問題",
                  onAction: summary.issues.length > 0 ? () => jumpTo(".confirm-issues") : undefined,
                },
                {
                  id: "pending",
                  ok: noReply === 0,
                  level: "warn",
                  title: "未回覆",
                  detail:
                    noReply === 0
                      ? "沒有"
                      : `${summary.pending.length > 0 ? names(summary.pending) : ""}${summary.expired.length > 0 ? `${summary.pending.length > 0 ? "；" : ""}${summary.expired.length} 位已逾期，視同接受` : ""}`,
                },
              ]}
            />
            {summary.issues.length > 0 && (
              <ul className="issue-list confirm-issues">
                {summary.issues.map((id) => (
                  <li key={id}>
                    <strong>{ASSISTANT_NAMES.get(id)}</strong>：
                    {publication.responses[id].issues
                      .map((issue) => `${formatDay(issue.date)} ${shiftLabelOf(issue.shiftId)}・${issue.kind}`)
                      .join("；")}
                  </li>
                ))}
              </ul>
            )}
            {snapshotNote}
            <details className="tool-details undo-tools">
              <summary className="help-line">
                <strong>需要修改時</strong>
                <small className="assistant-hint">撤回預公告，回到排班</small>
              </summary>
              <button className="button button-quiet" onClick={doWithdrawPreannounce}>撤回預公告，回到排班</button>
            </details>
          </>
        );
      }
      case "publish":
        if (publication.status !== "published") {
          return <p className="month-status-item">助理確認後，在「助理確認」那一步按「正式公告」。公告後班表會鎖定。</p>;
        }
        // 版面（第 4 輪）：最上面「臨時解鎖」→「目前狀況」→ 值班主管（收成一行）；撤回正式公告收進「需要修改時」。
        return (
          <>
            <div className="step-head-actions">
              {locked && (
                <button
                  className="button button-quiet"
                  onClick={() => {
                    if (window.confirm(`${fullMonthLabel(month)}班表已鎖定。只在臨時病假、喪假等必要時解鎖，確定要臨時解鎖嗎？`)) {
                      setUnlockedMonths([...unlockedMonths, month]);
                    }
                  }}
                >
                  臨時解鎖
                </button>
              )}
            </div>
            <ScheduleChecklist
              label="目前狀況"
              items={[
                { id: "published", ok: true, level: "warn", title: "正式公告", detail: `已於 ${deadlineText(publication.publishedAt)} 公告` },
                {
                  id: "lock",
                  ok: locked,
                  level: "warn",
                  title: "班表鎖定",
                  detail: locked ? "鎖定中；小改（臨時病假等）按上面「臨時解鎖」" : "已臨時解鎖，重新整理後恢復鎖定",
                },
              ]}
            />
            {supervisorTool}
            <details className="tool-details review-form undo-tools">
              <summary className="help-line">
                <strong>需要修改時</strong>
                <small className="assistant-hint">撤回正式公告，回到排班（原因必填）</small>
              </summary>
              <label>
                需要大改時才撤回；小改（例如臨時病假）請用「臨時解鎖」
                <textarea
                  value={withdrawReason}
                  maxLength={200}
                  placeholder="例如：醫師異動，整月要重排"
                  onChange={(event) => setWithdrawReason(event.target.value)}
                />
              </label>
              <button className="button button-quiet" disabled={!withdrawReason.trim()} onClick={doWithdrawPublished}>
                撤回正式公告，回到排班
              </button>
            </details>
          </>
        );
    }
  }

  /**
   * 不是目前那一步時，內容上方的提示：已完成＝只能看，要改按「退回到這一步」（用原本的撤回動作，都會先跳確認）；
   * 還沒輪到＝最高管理者預覽。正式公告後的小改照舊用第 9 步的「臨時解鎖」。
   */
  function readOnlyBanner() {
    if (activeAccess === "locked") {
      return <p className="step-readonly-note">預覽：還沒輪到這一步，只能看。完成前面的步驟後才能操作。</p>;
    }
    const publication = publicationOf(focusMonth);
    // 提早截止、還沒到原訂截止日、班表還沒預公告時，才能重新開放排休。
    const reopenable =
      !!focusApproval?.leaveClosedAt && today < scheduleOf(focusMonth).deadline && publication.status === "draft";
    const undo: { label: string; run(): void } | null =
      activeStep === "demand" && focusApproval?.status === "submitted"
        ? { label: "撤回送出", run: doWithdrawDemand }
        : (activeStep === "demand" || activeStep === "review") && focusApproval?.status === "approved"
          ? { label: "撤銷同意", run: doRevokeApproval }
          : activeStep === "release" && focusReleasedAt
            ? { label: "收回發布", run: doRevokeRelease }
            : activeStep === "leaveClosed" && reopenable
              ? { label: "重新開放排休", run: doReopenLeave }
            : activeStep === "schedule" && publication.status === "draft" && reviews[focusMonth] && reviews[focusMonth].status !== "editing" && reviews[focusMonth].status !== "returned" && !monthReadOnly
              ? {
                  label: "撤回送審",
                  run: () => {
                    if (!window.confirm(`撤回${fullMonthLabel(focusMonth)}送審，回到「排班」繼續修改？之後要重新送行政專員檢查（目前：${REVIEW_STATUS_LABELS[reviews[focusMonth].status]}）。`)) return;
                    saveReview(withdrawReview(reviews[focusMonth], nowString(), actorName));
                    setPickedStep(null);
                  },
                }
            : activeStep === "schedule" && publication.status === "preannounced"
              ? {
                  label: "撤回預公告",
                  run: () => {
                    if (!window.confirm(`撤回${fullMonthLabel(focusMonth)}預公告，回到「排班」繼續修改？助理已送出的確認會清掉，下次預公告要重新確認。`)) return;
                    savePublication(withdrawPublication(publication, nowString()));
                    setPickedStep(null);
                  },
                }
              : null;
    const hint =
      activeStep === "leaveClosed" && reopenable
        ? "提早截止的排休可以重新開放，到日程原本的最後一天截止。"
        : activeStep === "leaveClosed"
        ? "這一步看日期：要重開排休，請按上方「調整日程」延後一般排休的最後一天。"
        : publication.status === "published" && (activeStep === "schedule" || activeStep === "confirm")
          ? "已正式公告：小改請到「公告」段按「臨時解鎖」；大改在「公告」段撤回正式公告（原因必填）。"
          : undo
            ? "要修改，請先退回到這一步，改完再照順序往下走。"
            : "";
    if (monthReadOnly) {
      return (
        <div className="step-readonly-note">
          <span>你不是這個月的排班負責人，只能檢視。</span>
        </div>
      );
    }
    return (
      <div className="step-readonly-note">
        <span>這一步已完成，只能檢視。{hint}</span>
        {undo && (
          <button className="button button-quiet" onClick={undo.run}>
            退回到這一步（{undo.label}）
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-row">
        <div>
          <p className="eyebrow">{courseProfile.clinicName}</p>
          <h1>{viewOnly ? "班表" : "排班工作台"}</h1>
          <p>
            {viewOnly
              ? "只看班表：可切換月／週、存成圖片。要修改請到排班工作台。"
              : isOwner
                ? "最高管理者：確認排班者送來的人數與班表；所有功能都可以使用。"
                : role === "clerk"
                ? "行政專員：班表只能看；在「排班」段的「行政檢查」看排班統計、提出建議或確認沒問題。"
                : "排班者：照流程一步一步完成：先算人數送給管理者確認，發布後助理才能申請排休。"}
          </p>
        </div>
        {viewOnly && (
          <Link className="button button-quiet print-only-hide" href={`/workbench?month=${focusMonth}`}>到排班工作台修改</Link>
        )}
      </section>

      {!viewOnly && doctorSync.plan.blocked.length > 0 && (
        <section className="notice-card doctor-sync-notice print-only-hide" role="status">
          <strong>醫師班表有變更還沒套用到班表</strong>
          <span>這些月份有些診已經沒有醫師，但那一診已經排了助理；為了不自動刪掉助理班，請確認後再套用。</span>
          <span className="toolbar-actions">
            {doctorSync.plan.blocked.map((item) => (
              <button key={item.month} className="button button-quiet" disabled={autoBusy} onClick={() => applyDoctorSync(item.month)}>
                套用{fullMonthLabel(item.month)}（會移除 {item.assistantRemoved} 人次助理班）
              </button>
            ))}
          </span>
        </section>
      )}

      {error && <div className="error-callout" role="alert">同步錯誤：{error}</div>}
      {/* 「排班」那一步改看「還差什麼」清單與補人，不在最上面重複（使用者 2026-10-30）。 */}
      {showWarnings && activeStep !== "schedule" && <CoverageWarnings demands={demands} />}
      {showWarnings && activeStep !== "schedule" && <LaborWarnings issues={laborIssues} names={ASSISTANT_NAMES} />}
      <section ref={scheduleCardRef} className="schedule-card" aria-busy={syncState === "connecting"}>
        {/* 控制縮成一排（使用者 2026-10-30）：‹ 月份 › 在左，月／週、本月、「⋯」（跳到月份、存成圖片）在右。 */}
        <div className="schedule-toolbar">
          <div className="month-nav">
            <button
              className="nav-arrow print-only-hide"
              disabled={viewMode === "week" ? monday <= FIRST_DAY : anchor.slice(0, 7) <= FIRST_MONTH}
              onClick={() => (viewMode === "week" ? setAnchor(addDays(monday, -7)) : shiftMonth(-1))}
              aria-label={viewMode === "week" ? "上一週" : "上個月"}
            >
              ‹
            </button>
            <div>
              <p className="eyebrow">班表</p>
              <h2 className="toolbar-title-desktop">{viewMode === "week" ? formatWeekRange(monday).replace(monday.replaceAll("-", "/"), clampDay(monday).replaceAll("-", "/")) : fullMonthLabel(anchor.slice(0, 7))}</h2>
              {/* 手機（使用者 2026-10-30）：大字月份，週檢視另寫這一週是幾號到幾號，和下面的日期帶不重複寫年份。 */}
              <h2 className="toolbar-title-mobile">
                {fullMonthLabel(focusMonth)}
                {viewMode === "week" && <small>{shortRange(clampDay(monday), dates[dates.length - 1] ?? monday)}</small>}
              </h2>
            </div>
            <button
              className="nav-arrow print-only-hide"
              onClick={() => (viewMode === "week" ? setAnchor(addDays(monday, 7)) : shiftMonth(1))}
              aria-label={viewMode === "week" ? "下一週" : "下個月"}
            >
              ›
            </button>
          </div>
          <div className="toolbar-actions">
            {weekAllowed && <Segmented options={VIEW_MODES} value={viewMode} onChange={setViewMode} label="檢視方式" className="view-mode" />}
            <button
              className="button button-quiet"
              onClick={() => {
                setAnchor(todayString());
                setMobileDay(null);
              }}
            >{viewMode === "week" ? "本週" : "本月"}</button>
            <ToolbarMore>
              <label className="month-jump">
                跳到月份
                <input
                  type="month"
                  min={FIRST_MONTH}
                  value={anchor.slice(0, 7)}
                  onChange={(event) => event.target.value && setAnchor(`${event.target.value}-01`)}
                />
              </label>
              <SaveImageButton target={scheduleCardRef} fileName={`班表_${viewMode === "week" ? `${dates[0]}週` : fullMonthLabel(focusMonth)}`} />
            </ToolbarMore>
          </div>
        </div>
        {!viewOnly && (
          <div className="workflow-panel print-only-hide">
            {/* 電腦版：日程卡在流程上方；手機收進流程側欄的「班表日程」 */}
            {/* 電腦版：日程併進流程列（每一步下面寫日期），按「調整日程」才打開調整表單；手機收進側欄的「班表日程」 */}
            {timelineEditMonth === focusMonth && (
              <div className="workflow-timeline-top">
                <MonthTimelineCard
                  key={focusMonth}
                  timeline={focusTimeline}
                  states={focusTimelineStates}
                  overrides={leaveWindow.overrides[focusMonth]}
                  editable
                  editorOnly
                  onClose={() => setTimelineEditMonth(null)}
                  onSave={(next) => saveTimeline(focusMonth, next)}
                />
              </div>
            )}
            <MonthLeadBar month={focusMonth} monthLabel={fullMonthLabel(focusMonth)} />
            <WorkflowSidebar
              monthLabel={fullMonthLabel(focusMonth)}
              input={workflowInput}
              current={nowStep}
              picked={showTimeline ? "timeline" : activeStep}
              stepDates={flowStepDates(focusTimeline, leaveWindow.overrides[focusMonth])}
              lateSteps={lateFlowSteps(focusTimelineStates)}
              lockedSteps={WORKFLOW_STEPS.map((step) => step.id).filter((step) => stepAccess(step, workflowInput) === "locked")}
              canPreview={isOwner}
              headerExtra={
                <>
                  {Object.keys(leaveWindow.overrides[focusMonth] ?? {}).length > 0 && <span className="timeline-adjusted">本月日程已調整</span>}
                  <button className="button button-quiet" disabled={monthReadOnly} aria-expanded={timelineEditMonth === focusMonth} onClick={() => setTimelineEditMonth(timelineEditMonth === focusMonth ? null : focusMonth)}>
                    調整日程
                  </button>
                </>
              }
              onPick={(pick) => {
                if (pick === "timeline") return setTimelineMonth(focusMonth);
                setTimelineMonth(null);
                setPickedStep({ month: focusMonth, step: pick });
              }}
            >
              {viewMode === "week" && months.length > 1 && (
                <p className="workflow-note">本週跨月，流程以 {monthLabel(focusMonth)}為準</p>
              )}
              {showTimeline ? (
                <div className="workflow-body">
                  <h3>班表日程</h3>
                  <MonthTimelineCard
                    key={focusMonth}
                    timeline={focusTimeline}
                    states={focusTimelineStates}
                    overrides={leaveWindow.overrides[focusMonth]}
                    editable={!monthReadOnly}
                    defaultOpen
                    onSave={(next) => saveTimeline(focusMonth, next)}
                  />
                </div>
              ) : (
                <div className="workflow-body">
                  <h3>
                    {stepTitle(activeStep)}
                  </h3>
                  {stepReadOnly && readOnlyBanner()}
                  <div ref={stepBodyRef} className={stepReadOnly ? "step-readonly" : undefined}>
                    {workflowBody()}
                  </div>
                  {autoMessage && <p className="auto-schedule-note" aria-live="polite">{autoMessage}</p>}
                </div>
              )}
            </WorkflowSidebar>
            {gridGroup && (
              <button className="button button-quiet grid-toggle" aria-expanded={gridVisible} onClick={toggleGrid}>
                {gridVisible ? "收起完整班表" : "顯示完整班表"}
              </button>
            )}
          </div>
        )}

        {workAllowed && (
          <div className="board-switch print-only-hide">
            <Segmented options={BOARD_VIEWS} value={boardView} onChange={setBoardView} label="班表或工作分配" />
          </div>
        )}
        {showWork && (
          <WorkAssignmentBoard
            month={focusMonth}
            entries={entries}
            editable={!viewOnly && !monthReadOnly && role !== "clerk"}
            actorName={actorName}
          />
        )}
        {!showWork && (viewOnly || activeStep === "schedule" || reviewStep || activeStep === "confirm") && (
          <ScheduleStatsPanel
            month={focusMonth}
            assistants={assistants}
            entries={entries}
            requests={requests}
            target={targetRange(focusMonth, LABOR_SETTINGS, laborTargets[focusMonth])}
          />
        )}
        {!showWork && (viewOnly || activeStep === "schedule" || reviewStep || activeStep === "confirm") && (
          <PostStatsPanel month={focusMonth} assistants={assistants} entries={entries} />
        )}
        {!showWork && !viewOnly && (activeStep === "release" || activeStep === "leaveClosed" || activeStep === "schedule" || reviewStep) && (
          <LeaveRequestList
            month={focusMonth}
            applications={applications}
            requests={requests}
            entries={entries}
            onOpen={(date, personId) => setSelected({ date, personId })}
          />
        )}
        {!showWork && showWarnings && !gridReadOnly && (
          <AssignPanel
            demands={focusDemands}
            entries={entries}
            requests={requests}
            applications={applications}
            locked={isLocked(focusMonth)}
            onAssign={(date, personId, shiftId) => toggleShift(date, personId, shiftId)}
          />
        )}
        {gridVisible && (
          <div className={`mobile-board print-only-hide ${mobileTable ? "show-table" : ""}`}>
            <Segmented options={MOBILE_VIEWS} value={mobileView} onChange={setMobileView} label="手機班表檢視方式" />
            {mobileView === "calendar" && (
              <MobileMonthView
                dates={dates}
                assistants={assistants}
                entries={entries}
                demands={demands}
                today={today}
                onPick={(date) => {
                  pickMobileDay(date);
                  setMobileView("day");
                }}
              />
            )}
            {mobileView === "day" && (
              <MobileDayView
                selected={mobileSelected}
                onPick={pickMobileDay}
                dates={mobileStripDates}
                week={viewMode === "week" ? dates : undefined}
                assistants={assistants}
                entries={entries}
                demands={mobileStripDemands}
                formatDay={formatDay}
                onSelect={setSelected}
              />
            )}
          </div>
        )}
        {!gridVisible ? null : viewMode === "month" ? (
          <MonthGrid
            dates={dates}
            doctors={doctors}
            assistants={assistants}
            entries={entries}
            demands={demands}
            selected={selected}
            onSelect={setSelected}
            describe={describeEntries}
            formatDay={formatDay}
            hours={laborCell}
            requestedOf={requestedOf}
            reasonOf={reasonOf}
            unplacedOf={unplacedOf}
            requestTextOf={requestTextOf}
          />
        ) : (
        <div className="table-scroll" tabIndex={0} aria-label="可水平捲動的週班表">
          <table className="schedule-table">
            <thead>
              <tr>
                <th scope="col">人員</th>
                {dates.map((date) => (
                  <th scope="col" key={date} className={clinicDayOf(date).open ? undefined : "is-closed"}>
                    {formatDay(date)}
                  </th>
                ))}
                <th scope="col" className="hours-cell">本月工時</th>
              </tr>
            </thead>
            <tbody>
              <tr className="clinic-row">
                <th scope="row">
                  <span>診所</span>
                  <small>看診／休診</small>
                </th>
                {dates.map((date) => {
                  const day = clinicDayOf(date);
                  return (
                    <td key={date} className={day.open ? undefined : "is-closed"}>
                      {day.open ? (
                        <>
                          <span className="clinic-shifts">{day.shiftIds.map(shiftLabelOf).join("・")}</span>
                          <HolidayNote date={date} />
                        </>
                      ) : (
                        <span className="clinic-closed" title={holidayNote(date)?.detail}>休診・{day.label}</span>
                      )}
                    </td>
                  );
                })}
                <td className="hours-cell" />
              </tr>
              <GroupHeaderRow role="doctor" people={doctors} colSpan={dates.length + 2} />
              <PersonRows people={visiblePeople("doctor", doctors)} group={doctors} dates={dates} entries={entries} selected={selected} onSelect={setSelected} />
              <DemandRow dates={dates} demands={demands} />
              <GroupHeaderRow role="assistant" people={assistants} colSpan={dates.length + 2} />
              <PersonRows
                people={visiblePeople("assistant", assistants)}
                group={assistants}
                dates={dates}
                entries={entries}
                selected={selected}
                onSelect={setSelected}
                hours={laborCell}
                requestedOf={requestedOf}
                reasonOf={reasonOf}
                unplacedOf={unplacedOf}
                requestTextOf={requestTextOf}
              />
            </tbody>
          </table>
        </div>
        )}
      </section>

      <aside ref={cellEditorRef} className={`cell-editor ${selected ? "is-open" : ""}`} aria-live="polite">
        {selected && selectedPerson ? (() => {
          const info = scheduleOf(monthOf(selected.date));
          const locked = isLocked(monthOf(selected.date));
          const preLeave = selectedEntries.find(isPreLeave);
          const preLeaveOpen = preLeaveEditable(info.phase) || unlockedMonths.includes(monthOf(selected.date));
          // 排休截止後，有排休的格子不能再改（避免排班時誤刪排休）。
          const cellFrozen = locked || (preLeave !== undefined && !preLeaveOpen);
          const clinic = clinicDayOf(selected.date);
          const holiday = holidayNote(selected.date);
          const canPreLeave = !locked && selectedPerson.role === "assistant" && preLeaveOpen;
          const selectedApplication = applicationOf(selected.date, selected.personId);
          const selectedPlaced = preLeave !== undefined;
          const selectedStatus = selectedApplication ? applicationStatus(selectedApplication, entries) : undefined;
          const selectedRequests = requestedOf(selected.date, selected.personId).map(
            (shiftId) => shiftRequestOf(requests, selected.date, selected.personId, shiftId)!,
          );
          const selectedWishes = selectedRequests.filter((request) => !request.leaveType);
          const selectedSessionLeaves = selectedRequests.filter((request) => request.leaveType);
          // 醫師班依醫師班表自動同步，在這裡只能看；要改請到第一步「醫師與人數」（單日調整）。
          if (selectedPerson.role === "doctor") {
            return (
              <>
                <div>
                  <p className="eyebrow">醫師班（只能看）</p>
                  <h2>{selectedPerson.displayName} · {formatDay(selected.date)}</h2>
                  <p>目前：{selectedEntries.length > 0 ? <EntryLabel entries={selectedEntries} /> : "這天沒有看診"}</p>
                  <p className="closure-note">醫師班依醫師班表自動帶入。要改這一天，請到排班流程第一步「醫師與人數」點這個日期修改。</p>
                </div>
                <div className="editor-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setSelected(null);
                      goToStep(selected.date.slice(0, 7), "demand");
                    }}
                  >
                    到「醫師與人數」修改
                  </button>
                  <button className="button button-quiet" onClick={() => setSelected(null)}>關閉</button>
                </div>
              </>
            );
          }
          // 班表（只看）頁、或工作台不是目前那一步：只列這格的內容。
          if (viewOnly || gridReadOnly) {
            const requestText = requestTextOf(selected.date, selected.personId);
            const unplaced = unplacedOf(selected.date, selected.personId);
            const lines = reasonLines(selected.date, selected.personId);
            return (
              <>
                <div>
                  <p className="eyebrow">{viewOnly ? "班表（只能看）" : "只能檢視"}</p>
                  <h2>{selectedPerson.displayName} · {formatDay(selected.date)}</h2>
                  <p>目前：{selectedEntries.length > 0 ? <EntryLabel entries={selectedEntries} all={entries} /> : "尚未排班"}</p>
                  {selectedEntries.some((entry) => entry.task) && (
                    <p className="task-note">
                      工作：
                      {selectedEntries
                        .filter((entry) => entry.task)
                        .map((entry) => `${shiftLabelOf(entry.shiftId)} ${taskLabel(entry.task!)}${isStaleTask(entry, entries) ? "（醫師這一診不看了）" : ""}`)
                        .join("、")}
                    </p>
                  )}
                  {requestText && <p className="request-note">{requestText}</p>}
                  {unplaced && <p className="request-note">排休申請{unplaced}（未排入班表）</p>}
                  {lines.length > 0 && (
                    <ul className="reason-note">
                      {lines.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                </div>
                <div className="editor-actions">
                  {viewOnly ? (
                    <Link className="button" href={`/workbench?month=${monthOf(selected.date)}`}>到排班工作台修改</Link>
                  ) : (
                    <span className="assistant-hint">這一步只能檢視；要修改請回到目前的步驟，或先退回到這一步。</span>
                  )}
                  <button className="button button-quiet" onClick={() => setSelected(null)}>關閉</button>
                </div>
              </>
            );
          }
          return (
            <>
              <div>
                <p className="eyebrow">編輯一格</p>
                <h2>{selectedPerson.displayName} · {formatDay(selected.date)}</h2>
                <p>目前：{selectedEntries.length > 0 ? <EntryLabel entries={selectedEntries} all={entries} /> : "尚未排班"}</p>
                {selectedWishes.length > 0 && (
                  <p className="request-note">
                    助理希望不排（不用假）：{selectedWishes.map((request) => shiftLabelOf(request.shiftId)).join("、")}（盡量配合，人力不足時可排）
                  </p>
                )}
                {selectedSessionLeaves.map((request) => {
                  const scheduled = selectedEntries.some((entry) => entry.state === "shift" && entry.shiftId === request.shiftId);
                  return (
                    <div className="application-note" key={request.shiftId}>
                      <span>
                        助理{shiftLabelOf(request.shiftId)}請假：{request.leaveType}
                        {scheduled
                          ? "（未排入：這一診已排班，申請保留）"
                          : request.restInstead
                            ? "（已改成休息，不扣假）"
                            : "（一鍵排班不會排這一診）"}
                      </span>
                      {!scheduled && (
                        <span className="workflow-actions">
                          <button
                            className="button button-quiet"
                            disabled={locked}
                            onClick={() => saveShiftRequests(setRestInstead(readShiftRequests(), request, !request.restInstead))}
                          >
                            {request.restInstead ? `改回用假（${request.leaveType}）` : "改成休息（不扣假）"}
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
                {selectedApplication && (
                  <div className="application-note">
                    <span>
                      助理排休申請：{selectedApplication.leaveType}
                      {selectedStatus === "placed"
                        ? "（已排入班表）"
                        : selectedStatus === "rest"
                          ? "（已改成休息日，不扣假）"
                          : "（未排入班表：申請保留，助理看得到「未排入」）"}
                    </span>
                    <span className="workflow-actions">
                      {selectedStatus !== "placed" && (
                        <button
                          className="button leave-button"
                          disabled={locked}
                          onClick={() => {
                            saveLeaveApplications(setApplicationRest(readLeaveApplications(), selectedApplication, false));
                            saveLeave(selected.date, selected.personId, `${PRE_LEAVE_PREFIX}${selectedApplication.leaveType}`);
                          }}
                        >
                          {selectedStatus === "rest" ? "改回用假" : "改回排休"}（{selectedApplication.leaveType}）
                        </button>
                      )}
                      {selectedStatus !== "rest" && (
                        <button
                          className="button button-quiet"
                          disabled={locked}
                          title="不扣助理的假，這天照樣休；少的工時一鍵排班會排在別天"
                          onClick={() => {
                            saveLeaveApplications(setApplicationRest(readLeaveApplications(), selectedApplication, true));
                            saveLeave(selected.date, selected.personId);
                          }}
                        >
                          改成休息日（不扣假）
                        </button>
                      )}
                      <button
                        className="button button-quiet"
                        disabled={locked || (selectedPlaced && cellFrozen)}
                        onClick={() => {
                          if (!window.confirm("刪除這筆排休申請？（例如助理已當面撤回）申請紀錄與理由會一起刪除。")) return;
                          deleteApplication(selected.date, selected.personId);
                          if (selectedPlaced) clearEntry(selected.date, selected.personId);
                        }}
                      >
                        刪除申請
                      </button>
                    </span>
                  </div>
                )}
                {reasonLines(selected.date, selected.personId).length > 0 && (
                  <ul className="reason-note">
                    {reasonLines(selected.date, selected.personId).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                )}
                {!clinic.open ? (
                  <p className="closure-note">診所行事曆這天休診（{clinic.label}）；要排班會先請你確認。</p>
                ) : clinic.known && clinic.shiftIds.length < courseProfile.shifts.length ? (
                  <p className="closure-note">診所行事曆這天只開{clinic.shiftIds.map(shiftLabelOf).join("、")}；其他診要排會先請你確認。</p>
                ) : null}
                {holiday && <p className="closure-note">{holiday.detail}。</p>}
                <p className="editor-hint">
                  {locked
                    ? "本月班表已正式公告並鎖定，不能修改。"
                    : cellFrozen
                      ? "排休已截止，這格的排休不能再更改。"
                      : "可複選：點一下加上，再點一下取消。"}
                </p>
                {selectedPerson.role === "assistant" && (
                  <TaskPicker
                    shifts={selectedEntries.filter((entry) => entry.state === "shift")}
                    entries={entries}
                    disabled={cellFrozen}
                    levels={abilityFor(abilities, selected.date.slice(0, 7))?.levels ?? null}
                    shiftLabelOf={shiftLabelOf}
                    onChange={(entry, task) => replaceEntries([entry], [withTask(entry, task)])}
                  />
                )}
              </div>
              <div className="editor-actions">
                {courseProfile.shifts.map((shift) => {
                  const active = selectedEntries.some((entry) => entry.state === "shift" && entry.shiftId === shift.id);
                  // 行事曆上沒開的診：要新增時先確認；那一診已有醫師（已確認加開）就不再問。
                  const closedShift = !clinic.shiftIds.includes(shift.id);
                  const confirmExtra = () => {
                    if (active || !closedShift) return true;
                    const doctorOn = entries.some(
                      (entry) => entry.date === selected.date && entry.shiftId === shift.id && entry.state === "shift" && doctorIds.has(entry.personId),
                    );
                    if (doctorOn) return true;
                    // 原因是「週六／週日」時日期已經寫了星期，不重複。
                    const when = clinic.open ? `沒有開${shift.label}` : clinic.label?.startsWith("週") ? "休診" : `休診（${clinic.label}）`;
                    return window.confirm(`診所行事曆 ${formatDay(selected.date)} ${when}，確定要排${shift.label}嗎？`);
                  };
                  return (
                    <button
                      className={`button shift-button shift-${shift.id} ${active ? "is-active" : ""}`}
                      key={shift.id}
                      aria-pressed={active}
                      disabled={cellFrozen}
                      title={closedShift ? "行事曆上這診沒開" : undefined}
                      onClick={() => {
                        if (!confirmExtra()) return;
                        keepApplication(selected.date, selected.personId);
                        toggleShift(selected.date, selected.personId, shift.id);
                      }}
                    >
                      {active ? "✓ " : ""}{shift.label}<small>{closedShift ? "行事曆沒開" : `${shift.start}–${shift.end}`}</small>
                    </button>
                  );
                })}
                <button className="button leave-button" disabled={cellFrozen} onClick={() => {
                    keepApplication(selected.date, selected.personId);
                    saveLeave(selected.date, selected.personId);
                  }}
                >
                  休假
                </button>
                {selectedPerson.role === "assistant" && (
                  <span className="pre-leave-group">
                    <select
                      aria-label="排休假別"
                      value={preLeaveChoice}
                      disabled={!canPreLeave}
                      onChange={(event) => setPreLeaveChoice(event.target.value)}
                    >
                      {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <button
                      className="button leave-button"
                      disabled={!canPreLeave}
                      title={canPreLeave ? "" : phaseText(info)}
                      onClick={() => {
                        keepApplication(selected.date, selected.personId);
                        saveLeave(selected.date, selected.personId, `${PRE_LEAVE_PREFIX}${preLeaveChoice}`);
                      }}
                    >
                      排休
                    </button>
                  </span>
                )}
                <button className="button button-danger" disabled={cellFrozen} onClick={() => {
                    keepApplication(selected.date, selected.personId);
                    clearEntry(selected.date, selected.personId);
                  }}
                >
                  清除
                </button>
                <button className="button button-quiet" onClick={() => setSelected(null)}>關閉</button>
              </div>
            </>
          );
        })() : (
          <p>選擇班表中的一格開始編輯。</p>
        )}
      </aside>
    </main>
  );
}

const noopSubscribe = () => () => {};

/**
 * 班表依「今天日期」決定顯示週次與排休／鎖定狀態，資料也只存在瀏覽器，
 * 所以只在瀏覽器端繪製，避免預先產生的頁面與裝置日期不同而出現 hydration 錯誤。
 * 用到網址參數（useSearchParams），頁面要包在 Suspense 裡。
 */
/** 第 1、2 步的兩種看法：月曆（醫師與人數）、班表（同一份資料的月班表）。 */
const DEMAND_VIEWS = [
  ["calendar", "月曆"],
  ["grid", "班表"],
] as const;

/** 手機班表的三種看法：單日（診次卡）、月曆（每天三條人數）、總表（人員×日期）。 */
const MOBILE_VIEWS = [
  ["day", "單日"],
  ["calendar", "月曆"],
  ["table", "總表"],
] as const;


export function ScheduleBoard({ mode }: { mode: BoardMode }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) {
    return (
      <main className="page-shell">
        <LoadingSpinner label="班表載入中…" />
      </main>
    );
  }
  return <ScheduleBoardContent mode={mode} />;
}

/** Demo 用的模擬身分：最高管理者、排班者看排班工作台與班表，助理只看自己的頁面。不是真正的登入。 */
function ScheduleBoardContent({ mode }: { mode: BoardMode }) {
  const { viewer } = useViewer();
  const params = useSearchParams();
  const assistant = courseProfile.people.find((person) => person.id === viewer);
  const role: BoardRole = viewer === "scheduler" ? "scheduler" : viewer === "clerk" ? "clerk" : "owner";
  if (assistant) return <AssistantView key={assistant.id} person={assistant} tab="schedule" />;
  // 網址換了月份或步驟（例如從總覽點另一項進來）就重新打開。
  const query = params.toString();
  return <AdminBoard key={`${role}-${mode}-${query}`} role={role} mode={mode} target={readTarget(params)} />;
}
