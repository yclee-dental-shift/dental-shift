import { courseProfile, DOCTOR_CHARS } from "@/config/clinic.config";
import { LIMITED_BOOKING_NOTE } from "@/config/doctors";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { preLeaveType } from "@/domain/rules/leave-window";
import { isStaleTask, taskDoctorId, taskLabel, taskShort } from "@/domain/rules/shift-task";
import { findEntries } from "@/domain/schedule";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useHoverTip } from "./DemandHoverTip";
import { HelpTip } from "./HelpTip";
import { HolidayNote } from "./HolidayNote";
import { DraggableNameCell, GroupHeaderRow, HideRowButton, useVisiblePeople } from "./RowVisibility";
import { clinicDayOf, holidayNote } from "./schedule-settings";
import { isLearnerEntry } from "@/domain/rules/ability-schedule";
import { abilityMark, useAbilities } from "./useAbilities";

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 崗位一個字（使用者 2026-10-30）：跟診＝醫師簡稱（`DOCTOR_CHARS`，通常用姓），流動＝流、流動 2F＝2，櫃台＝櫃，預留＝預。 */
function taskChar(task: string): string {
  const doctorId = taskDoctorId(task);
  if (doctorId) return DOCTOR_CHARS[doctorId] ?? taskShort(task).slice(0, 1);
  return ({ "float-1": "流", "float-2": "2", counter: "櫃", reserve: "預" } as Record<string, string>)[task] ?? taskShort(task).slice(0, 1);
}

const shiftOrder = (id?: string) => courseProfile.shifts.findIndex((shift) => shift.id === id);
const shortLabels = (ids: string[]) =>
  [...ids].sort((a, b) => shiftOrder(a) - shiftOrder(b)).map((id) => courseProfile.shifts[shiftOrder(id)]?.label.slice(0, 1)).join("");

/**
 * 月班表的精簡標示（使用者 2026-10-30，照 Apple HIG 讓一列變矮）：早／午／晚各有固定位置的小方塊，有排就填色、沒排留淡底；
 * 空心＝不開放一般約診、斜紋＝機動；休、排休假別首字佔滿三格；方塊正下方一個字＝那一診的崗位（可關掉）。
 * 希望不排（使用者 2026-10-31，取代左上角三角、理由圓點、整格橘框）：沒排＝灰格打勾（照希望）；還是排了＝彩色方塊裡淺灰「!」。
 */
function CompactLabel({
  entries,
  all,
  showTasks,
  requested = [],
}: {
  entries: ScheduleEntry[];
  all: ScheduleEntry[];
  showTasks: boolean;
  requested?: string[];
}) {
  const abilities = useAbilities();
  if (entries.length === 0 && requested.length === 0) return <span className="month-empty">·</span>;
  const leave = entries.find((entry) => entry.state === "leave");
  if (leave) {
    const type = preLeaveType(leave);
    return (
      <span className={`month-tag month-leave ${type ? "tag-pre-leave" : "tag-leave"}`} title={type ? `排休：${type}` : "休假"}>
        {type ? type.slice(0, 1) : "休"}
      </span>
    );
  }
  const order = (id?: string) => courseProfile.shifts.findIndex((shift) => shift.id === id);
  const sorted = [...entries].sort((a, b) => order(a.shiftId) - order(b.shiftId));
  return (
    <>
    <span className="month-slots">
      {courseProfile.shifts.map((shift) => {
        const entry = sorted.find((item) => item.shiftId === shift.id);
        const wished = requested.includes(shift.id);
        if (!entry) return <span key={shift.id} className={`month-slot ${wished ? "is-wish-kept" : ""}`} title={wished ? `希望不排${shift.label}（沒排）` : undefined} />;
        const limited = entry.note === LIMITED_BOOKING_NOTE;
        const flex = entry.note === FLEX_SHIFT_NOTE;
        const warn = abilityMark(entry, all, abilities);
        return (
          <span
            className={`month-slot slot-${shift.id} ${limited ? "is-limited" : ""} ${flex ? "is-flex" : ""} ${wished ? "is-wish-broken" : ""} ${warn?.className ?? ""}`}
            key={shift.id}
            title={[
              limited ? `${shift.label}（${LIMITED_BOOKING_NOTE}）` : shift.label,
              wished ? "希望不排，還是排了" : "",
              flex ? `${FLEX_SHIFT_NOTE}（補工時加排）` : "",
              warn?.title ?? "",
            ].filter(Boolean).join("・")}
          />
        );
      })}
    </span>
    {showTasks && sorted.some((entry) => entry.task) && (
      // 崗位一個字，放在那一診的方塊正下方（使用者 2026-10-30：一行一行疊看不懂、太擠）。
      <span className="month-task-row">
        {courseProfile.shifts.map((shift) => {
          const entry = sorted.find((item) => item.shiftId === shift.id && item.task);
          if (!entry) return <span key={shift.id} />;
          const learner = isLearnerEntry(entry);
          return (
            <span
              key={shift.id}
              className={`task-${shift.id} ${isStaleTask(entry, all) ? "is-stale" : ""} ${learner ? "is-learner" : ""}`}
              title={`${shift.label}：${taskLabel(entry.task!)}${learner ? "（+1，不算人數）" : ""}`}
            >
              {taskChar(entry.task!)}
            </span>
          );
        })}
      </span>
    )}
    </>
  );
}

interface MonthGridProps {
  dates: string[];
  doctors: CoursePerson[];
  assistants: CoursePerson[];
  entries: ScheduleEntry[];
  demands: SessionDemand[];
  selected: { date: string; personId: string } | null;
  onSelect(cell: { date: string; personId: string }): void;
  describe(entries: ScheduleEntry[]): string;
  formatDay(date: string): string;
  /** 助理列最右欄（本月工時）。 */
  hours?: (person: CoursePerson) => ReactNode;
  /** 助理登記「希望不排」的診。 */
  requestedOf?: (date: string, personId: string) => string[];
  /** 助理填的排休／希望不排理由（只給管理者看）。 */
  reasonOf?: (date: string, personId: string) => string | undefined;
  /** 助理申請了排休、但沒排在班表上的假別（管理者未同意）。 */
  unplacedOf?: (date: string, personId: string) => string | undefined;
  /** 「請假晚（特休）・希望不排早」這類標示。 */
  requestTextOf?: (date: string, personId: string) => string;
  /** 最下排只顯示需求人數（還沒排助理的步驟，避免整排「已排 0」紅字）。 */
  demandOnly?: boolean;
  /** 有傳時，點格子或日期改呼叫這個（例如打開修改視窗），不選格子；anchor 是那一欄的日期格，personId 是點的那一列（點日期時沒有）。 */
  onDateClick?: (date: string, anchor: HTMLElement, personId?: string) => void;
  /** 正在修改的那一天（整欄標示）。 */
  editingDate?: string | null;
  /** 有未儲存修改的日子（日期下標「未存」）。 */
  changedDates?: Set<string>;
  /** 滑鼠停留提示：停在日期或最下排顯示整天，停在醫師格子顯示這位醫師（personId）；修改視窗打開時不跳。 */
  hoverTip?: (date: string, personId?: string) => ReactNode;
}

export function MonthGrid(props: MonthGridProps) {
  const { dates, entries, demands, selected, onSelect, describe, formatDay } = props;
  const [showTasks, setShowTasks] = useShowTasks();
  // 依診所行事曆：休診日整欄灰底；在行事曆外排的班（加開）用橘色虛線標示。
  const isClosed = (date: string) => !clinicDayOf(date).open;
  const isExtra = (date: string, cellEntries: ScheduleEntry[]) => {
    const day = clinicDayOf(date);
    return day.known && cellEntries.some((entry) => entry.state === "shift" && !day.shiftIds.includes(entry.shiftId ?? ""));
  };
  const dayClass = (date: string) => `${isClosed(date) ? "is-closed" : ""} ${props.editingDate === date ? "is-editing" : ""}`;
  // 點格子時，修改視窗對齊那一欄的日期格。
  const headerOf = (date: string, from: Element) =>
    (from.closest("table")?.querySelector(`th[data-date="${date}"]`) as HTMLElement | null) ?? (from as HTMLElement);
  const visiblePeople = useVisiblePeople();
  const hover = useHoverTip<{ date: string; personId?: string }>();
  /** 有 hoverTip 時，掛在格子上的滑鼠停留事件。 */
  const hoverOn = (date: string, personId?: string) =>
    props.hoverTip
      ? {
          onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => hover.start({ date, personId }, event),
          onPointerLeave: hover.end,
          onPointerDown: hover.end,
        }
      : {};

  const rows = (people: CoursePerson[], group: CoursePerson[], showExtra: boolean, withHover = false) =>
    people.map((person, index) => (
      <tr key={person.id} data-person={person.id} className={index % 2 ? "is-alt" : undefined}>
        <DraggableNameCell person={person} group={group}>
          {person.displayName}
          <HideRowButton person={person} />
        </DraggableNameCell>
        {dates.map((date) => {
          const cellEntries = findEntries(entries, date, person.id);
          const isSelected = selected?.date === date && selected.personId === person.id;
          const requested = props.requestedOf?.(date, person.id) ?? [];
          const requestLabel = requested.length > 0 ? props.requestTextOf?.(date, person.id) ?? `希望不排${shortLabels(requested)}` : "";
          const requestText = requestLabel ? `；${requestLabel}` : "";
          const reason = props.reasonOf?.(date, person.id);
          const unplaced = props.unplacedOf?.(date, person.id);
          const title = [
            unplaced ? `排休申請（未排入）：${unplaced}` : "",
            requestLabel,
            reason ? `理由：${reason}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <td key={date} className={dayClass(date)} {...(withHover ? hoverOn(date, person.id) : {})}>
              <button
                className={`month-cell ${isExtra(date, cellEntries) ? "is-extra-open" : ""} ${isSelected ? "is-selected" : ""} ${unplaced ? "has-unplaced" : ""}`}
                onClick={(event) =>
                  props.onDateClick
                    ? props.onDateClick(date, headerOf(date, event.currentTarget), person.id)
                    : onSelect({ date, personId: person.id })
                }
                aria-label={`${person.displayName} ${formatDay(date)}：${describe(cellEntries)}${requestText}${unplaced ? `；排休申請${unplaced}未排入` : ""}`}
                title={title || undefined}
              >
                <CompactLabel entries={cellEntries} all={entries} showTasks={showTasks} requested={requested} />
                {unplaced && <span className="unplaced-tag">申{unplaced.slice(0, 1)}</span>}
              </button>
            </td>
          );
        })}
        <td className="hours-cell">{showExtra && props.hours?.(person)}</td>
      </tr>
    ));

  return (
    <>
      <div className="month-legend-bar print-only-hide">
        <label className="task-toggle" data-view-control>
          <input type="checkbox" checked={showTasks} onChange={(event) => setShowTasks(event.target.checked)} />
          顯示崗位
        </label>
        <HelpTip title="班表圖例" label="圖例">
          <MonthLegend />
        </HelpTip>
      </div>
      {props.hoverTip && !props.editingDate && hover.render(({ date, personId }) => props.hoverTip!(date, personId))}
      <div className="table-scroll month-scroll" tabIndex={0} aria-label="可捲動的月班表">
        <table className="month-grid">
          <thead>
            <tr>
              <th scope="col">人員</th>
              {dates.map((date) => (
                <th
                  scope="col"
                  key={date}
                  data-date={date}
                  className={dayClass(date)}
                  title={props.hoverTip ? undefined : (holidayNote(date)?.detail ?? clinicDayOf(date).label)}
                  {...hoverOn(date)}
                >
                  {props.changedDates?.has(date) && <span className="unsaved-mark">未存</span>}
                  {props.onDateClick ? (
                    <button
                      className="month-day-button"
                      onClick={(event) => props.onDateClick!(date, headerOf(date, event.currentTarget))}
                      aria-label={`修改 ${formatDay(date)}`}
                    >
                      {Number(date.slice(8, 10))}
                      <small>{WEEKDAY_CHARS[weekdayOf(date)]}</small>
                    </button>
                  ) : (
                    <>
                      {Number(date.slice(8, 10))}
                      <small>{WEEKDAY_CHARS[weekdayOf(date)]}</small>
                    </>
                  )}
                </th>
              ))}
              <th scope="col" className="hours-cell">本月工時</th>
            </tr>
          </thead>
          <tbody>
            <tr className="clinic-row">
              <th scope="row">
                診所
                <small>看診／休診</small>
              </th>
              {dates.map((date) => {
                const day = clinicDayOf(date);
                return (
                  <td key={date} className={dayClass(date)}>
                    {day.open ? (
                      <span className="clinic-shifts" title={`看診：${day.shiftIds.map((id) => courseProfile.shifts.find((shift) => shift.id === id)?.label).join("、")}`}>
                        {shortLabels(day.shiftIds)}
                      </span>
                    ) : (
                      <span className="clinic-closed" title={holidayNote(date)?.detail}>{day.label}</span>
                    )}
                    {day.open && <HolidayNote date={date} />}
                  </td>
                );
              })}
              <td className="hours-cell" />
            </tr>
            <GroupHeaderRow role="doctor" people={props.doctors} colSpan={dates.length + 2} />
            {rows(visiblePeople("doctor", props.doctors), props.doctors, false, true)}
            <GroupHeaderRow role="assistant" people={props.assistants} colSpan={dates.length + 2} />
            {rows(visiblePeople("assistant", props.assistants), props.assistants, true)}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <th scope="row">
                {props.demandOnly ? "需求人數" : "已排／需求"}
                <small>每一診分開算</small>
              </th>
              {dates.map((date) => (
                <td key={date} className={dayClass(date)} {...hoverOn(date)}>
                  <span className="month-demand">
                    {demands
                      .filter((demand) => demand.date === date)
                      .map((demand) => (
                        props.demandOnly ? (
                          <span key={demand.shiftId} className="is-ok" title={`${demand.shiftLabel}：需求 ${demand.total}`}>
                            {demand.shiftLabel.slice(0, 1)} {demand.total}
                          </span>
                        ) : (
                          <span
                            key={demand.shiftId}
                            className={demand.scheduled < demand.total ? "is-short" : "is-ok"}
                            title={`${demand.shiftLabel}：已排 ${demand.scheduled}、需求 ${demand.total}`}
                          >
                            {demand.shiftLabel.slice(0, 1)} {demand.scheduled}/{demand.total}
                          </span>
                        )
                      ))}
                  </span>
                </td>
              ))}
              <td className="hours-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** 月班表的圖例（使用者 2026-10-30：13 項太多，併成 4 組：班、假、要注意、其他）。 */
export function MonthLegend() {
  return (
    <ul className="month-legend is-grouped" aria-label="圖例">
      <li>
        <b>班</b>
        <span className="legend-items">
          <span><span className="month-slots"><span className="month-slot slot-morning" /><span className="month-slot slot-afternoon" /><span className="month-slot slot-evening" /></span>早／午／晚，有排就填色</span>
          <span><span className="month-slot slot-afternoon is-flex" />斜紋＝{FLEX_SHIFT_NOTE}（補工時多排的，有上班）</span>
          <span><span className="month-slot slot-morning is-limited" />空心＝醫師不開放一般約診</span>
        </span>
      </li>
      <li>
        <b>假</b>
        <span className="legend-items">
          <span><span className="month-tag tag-leave">休</span>休息</span>
          <span><span className="month-tag tag-pre-leave">特</span>排休（假別首字）</span>
        </span>
      </li>
      <li>
        <b>要注意</b>
        <span className="legend-items">
          <span><span className="legend-short">紅</span>人數不足；<span className="month-slot slot-morning is-unable" />紅框＝能力表上不是可獨立</span>
          <span><span className="month-slot slot-morning is-uncovered" />橘框方塊＝醫師沒有可獨立的人跟</span>
          <span><span className="month-slot is-wish-kept" />打勾＝希望不排，照排沒排；<span className="month-slot slot-afternoon is-wish-broken" />驚嘆號＝希望不排，還是排了（點格子看理由）</span>
          <span><span className="legend-extra" />橘虛線＝行事曆外加開</span>
        </span>
      </li>
      <li>
        <b>其他</b>
        <span className="legend-items">
          <span><span className="legend-closed" />灰底＝診所休診</span>
          <span><span className="month-task-row legend-task"><span className="task-morning">林</span><span className="task-afternoon">櫃</span><span className="task-evening">流</span></span>方塊下的字＝那一診的崗位：醫師簡稱（通常用姓：林＝林志明…）、流＝流動、2＝流動 2F、櫃＝櫃台、預＝預留；字加底線＝帶新手 +1（不算人數）</span>
        </span>
      </li>
    </ul>
  );
}

// 「顯示崗位」開關（使用者 2026-10-30）：畫面偏好，記在這台裝置（不含在 JSON 匯出）。
const SHOW_TASKS_KEY = "clinic-schedule-workshop:month-show-tasks:v1";
const showTasksListeners = new Set<() => void>();
function readShowTasks(): boolean {
  try {
    return localStorage.getItem(SHOW_TASKS_KEY) !== "off";
  } catch {
    return true;
  }
}
function useShowTasks(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      showTasksListeners.add(listener);
      return () => showTasksListeners.delete(listener);
    },
    readShowTasks,
    () => true,
  );
  const set = (next: boolean) => {
    try {
      localStorage.setItem(SHOW_TASKS_KEY, next ? "on" : "off");
    } catch {}
    showTasksListeners.forEach((listener) => listener());
  };
  return [value, set];
}
