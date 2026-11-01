"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { DayScroller, scrollerDates } from "./DayScroller";
import { ASSISTANT_SHORT_NAMES, courseProfile, DOCTOR_CHARS } from "@/config/clinic.config";
import { readWorkAssignments, saveWorkAssignments, subscribeWorkAssignments } from "@/data/work-assignment-store";
import { formatDay, nowString, todayString } from "@/domain/dates";
import { ABILITY_LEVEL_LABELS, abilityFor, type AbilityGrid } from "@/domain/rules/ability";
import { abilityTaskOf, levelOf } from "@/domain/rules/ability-schedule";
import {
  assignmentIssues,
  assignmentsFromEntries,
  entryTaskUpdates,
  sessionSlots,
  setSlot,
  slotKey,
  unassignedPeople,
  type WorkAssignmentMap, type WorkAssignments,
  type WorkDuty,
} from "@/domain/rules/work-assignment";
import { doctorFullName, taskDoctorId } from "@/domain/rules/shift-task";
import type { ScheduleEntry } from "@/domain/types";
import { HelpTip } from "./HelpTip";
import { ScheduleChecklist, type ChecklistItem } from "./ScheduleChecklist";
import { useSchedule } from "./ScheduleProvider";
import { ASSISTANT_IDS, ASSISTANT_NAMES, clinicDayOf, monthDates } from "./schedule-settings";
import { useAbilities } from "./useAbilities";

const EMPTY: WorkAssignmentMap = {};
const SHIFTS = courseProfile.shifts;
const ASSISTANT_SET = new Set(ASSISTANT_IDS);
/** 醫師列的順序照診所原本的工作分配表（`DOCTOR_CHARS` 的順序）。 */
const DOCTOR_ORDER = Object.keys(DOCTOR_CHARS);
const FIXED_ROWS = [
  { task: "float-1", label: "流動" },
  { task: "float-2", label: "流動 2F" },
  { task: "counter", label: "櫃檯" },
  { task: "reserve", label: "預留" },
];

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
export const shortName = (personId: string) => ASSISTANT_SHORT_NAMES[personId] ?? (ASSISTANT_NAMES.get(personId) ?? personId).slice(-1);
// 醫師列寫全名。
const doctorLabel = (doctorId: string) => doctorFullName(doctorId);
const rowLabel = (task: string) => {
  const doctorId = taskDoctorId(task);
  return doctorId ? doctorLabel(doctorId) : FIXED_ROWS.find((row) => row.task === task)?.label ?? task;
};
const shiftLabel = (shiftId: string) => SHIFTS.find((shift) => shift.id === shiftId)?.label ?? shiftId;
const dayShort = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function useWorkAssignments() {
  return useSyncExternalStore(subscribeWorkAssignments, readWorkAssignments, () => EMPTY);
}

/** 這個月的週（週一到週六；只留這個月、診所有開的日子）。 */
function weeksOf(month: string): string[][] {
  const weeks: string[][] = [];
  let current: string[] = [];
  for (const date of monthDates(month)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 1 && current.length > 0) {
      weeks.push(current);
      current = [];
    }
    if (weekday !== 0) current.push(date);
  }
  if (current.length > 0) weeks.push(current);
  return weeks.filter((week) => week.some((date) => clinicDayOf(date).open));
}

const doctorsOn = (entries: ScheduleEntry[], date: string, shiftId: string) =>
  new Set(entries.filter((entry) => entry.date === date && entry.shiftId === shiftId && entry.state === "shift" && !ASSISTANT_SET.has(entry.personId)).map((entry) => entry.personId));

/**
 * 工作分配（使用者 2026-10-30，照診所原本的工作分配表）：一週一張，每一診列醫師、流動、櫃檯，最下面「機動」；
 * 下面列雜務。版表為準：排了但那一診沒上班標紅、列在最上面的「目前狀況」，請找排班負責人。
 * 點格子從那一診有上班的人裡選，依能力表排序（可獨立在前）；跟醫師的可以改成「學習 +1」。
 * 存在工作分配（`work-assignment-store.ts`），同時把班表上記的「工作」改成一樣（能力提醒、培訓清單照常）。
 * 手機一次看一天（CSS 切換）。
 */
export function WorkAssignmentBoard({ month, entries, editable, actorName }: { month: string; entries: ScheduleEntry[]; editable: boolean; actorName: string }) {
  const map = useWorkAssignments() as Record<string, WorkAssignments>;
  const saved = map[month] ?? null;
  const { saveEntries } = useSchedule();
  const levels = abilityFor(useAbilities(), month)?.levels ?? null;
  const shown = useMemo(() => saved ?? assignmentsFromEntries(entries, month, "", ""), [saved, entries, month]);
  const weeks = useMemo(() => weeksOf(month), [month]);
  const today = todayString();
  const [weekIndex, setWeekIndex] = useState(() => Math.max(0, weeks.findIndex((week) => week.includes(today))));
  const week = weeks[Math.min(weekIndex, weeks.length - 1)] ?? [];
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const day = mobileDay && week.includes(mobileDay) ? mobileDay : week.find((date) => clinicDayOf(date).open) ?? week[0];
  // 手機的日期帶（使用者 2026-10-30：照「我的班表」左右滑動）：這個月的日子，前後補到整週；點了那一天也換到那一週。
  const stripDates = useMemo(() => scrollerDates(`${month}-01`, `${month}-01`), [month]);
  const pickDay = (date: string) => {
    setMobileDay(date);
    const index = weeks.findIndex((item) => item.includes(date));
    if (index >= 0) setWeekIndex(index);
  };
  const [editing, setEditing] = useState<{ date: string; shiftId: string; task: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issues = useMemo(() => assignmentIssues(shown, entries), [shown, entries]);
  const badKeys = new Set(issues.flatMap((issue) => (issue.kind === "notWorking" ? [`${issue.date}|${issue.shiftId}|${issue.task}|${issue.personId}`] : [])));
  const doubleKeys = new Set(issues.flatMap((issue) => (issue.kind === "double" ? [`${issue.date}|${issue.shiftId}|${issue.personId}`] : [])));

  async function save(next: WorkAssignments, touched: { date: string; shiftId: string }) {
    if (!saveWorkAssignments(month, next)) {
      setError("存不進去，請稍後再試。");
      return;
    }
    setError(null);
    // 班表上記的工作跟著改（只改這一診有上班的人）。
    const sessionEntries = entries.filter((entry) => entry.date === touched.date && entry.shiftId === touched.shiftId);
    const updates = entryTaskUpdates(next, sessionEntries, ASSISTANT_SET);
    if (updates.length > 0) await saveEntries(updates).catch(() => setError("工作分配已存，但班表上的「工作」沒有跟著改（這個月可能已鎖定）。"));
  }

  /** 某一格（醫師格含學習 +1）換人。 */
  function update(date: string, shiftId: string, task: string, people: string[], learners: string[]) {
    const base = saved ?? { ...shown, at: nowString(), by: actorName };
    const at = nowString();
    let next = setSlot(base, date, shiftId, task, people, at, actorName);
    const doctorId = taskDoctorId(task);
    if (doctorId) next = setSlot(next, date, shiftId, `learn-${doctorId}`, learners, at, actorName);
    void save(next, { date, shiftId });
  }

  function saveDuties(duties: WorkDuty[]) {
    const base = saved ?? { ...shown };
    setError(saveWorkAssignments(month, { ...base, duties, at: nowString(), by: actorName }) ? null : "存不進去，請稍後再試。");
  }

  /** 一診要顯示的列：那週這一診有看診的醫師（或格子裡有人的醫師），再加流動、櫃檯（有人才列預留）。 */
  const rowsOf = (shiftId: string, dates: string[]) => {
    const doctors = new Set<string>();
    for (const date of dates) {
      doctorsOn(entries, date, shiftId).forEach((id) => doctors.add(id));
      sessionSlots(shown, date, shiftId).forEach(([task]) => {
        const id = taskDoctorId(task);
        if (id) doctors.add(id);
      });
    }
    const doctorRows = [...doctors].sort((a, b) => DOCTOR_ORDER.indexOf(a) - DOCTOR_ORDER.indexOf(b)).map((id) => `doctor-${id}`);
    const fixed = FIXED_ROWS.filter((row) => row.task !== "reserve" || dates.some((date) => sessionSlots(shown, date, shiftId).some(([task]) => task === "reserve"))).map((row) => row.task);
    return [...doctorRows, ...fixed];
  };

  const peopleIn = (date: string, shiftId: string, task: string) => shown.slots[slotKey(date, shiftId, task)] ?? [];
  const sessionOpen = (date: string, shiftId: string) => {
    const clinic = clinicDayOf(date);
    return clinic.open && (!clinic.known || clinic.shiftIds.includes(shiftId));
  };

  const chips = (date: string, shiftId: string, task: string) => {
    const doctorId = taskDoctorId(task);
    const main = peopleIn(date, shiftId, task).map((id) => ({ id, learner: false }));
    const learners = doctorId ? peopleIn(date, shiftId, `learn-${doctorId}`).map((id) => ({ id, learner: true })) : [];
    return [...main, ...learners].map(({ id, learner }) => {
      const realTask = learner ? `learn-${doctorId}` : task;
      const bad = badKeys.has(`${date}|${shiftId}|${realTask}|${id}`);
      const twice = doubleKeys.has(`${date}|${shiftId}|${id}`);
      return (
        <span
          key={`${id}-${learner}`}
          className={`wa-chip ${bad ? "is-bad" : ""} ${twice ? "is-twice" : ""} ${learner ? "is-learner" : ""}`}
          title={`${ASSISTANT_NAMES.get(id) ?? id}${learner ? "（學習 +1）" : ""}${bad ? "：這一診沒上班" : ""}${twice ? "：同一診排了兩個崗位" : ""}`}
        >
          {shortName(id)}
        </span>
      );
    });
  };

  const checklist: ChecklistItem[] = [
    {
      id: "notWorking",
      ok: !issues.some((issue) => issue.kind === "notWorking"),
      level: "warn",
      title: "排了但沒上班",
      detail: (() => {
        const list = issues.filter((issue) => issue.kind === "notWorking");
        return list.length === 0
          ? "沒有"
          : `${list.length} 格：${list
              .slice(0, 4)
              .map((issue) => `${dayShort(issue.date)}${shiftLabel(issue.shiftId).slice(0, 1)} ${rowLabel(issue.kind === "notWorking" ? issue.task : "")} ${ASSISTANT_NAMES.get(issue.personId) ?? issue.personId}`)
              .join("、")}${list.length > 4 ? "…" : ""}（請找排班負責人）`;
      })(),
    },
    {
      id: "double",
      ok: !issues.some((issue) => issue.kind === "double"),
      level: "warn",
      title: "同一診排兩個崗位",
      detail: issues.some((issue) => issue.kind === "double") ? `${issues.filter((issue) => issue.kind === "double").length} 人次` : "沒有",
    },
  ];

  const weekDuties = shown.duties.filter((duty) => week.includes(duty.date));

  return (
    <section className="work-board" aria-label="工作分配">
      <div className="work-board-head">
        <div className="month-nav">
          <button className="nav-arrow" disabled={weekIndex <= 0} onClick={() => setWeekIndex(weekIndex - 1)} aria-label="上一週">‹</button>
          <div>
            <p className="eyebrow">工作分配</p>
            <h3>{week[0] ? `${dayShort(week[0])}－${dayShort(week[week.length - 1])}` : ""}</h3>
          </div>
          <button className="nav-arrow" disabled={weekIndex >= weeks.length - 1} onClick={() => setWeekIndex(weekIndex + 1)} aria-label="下一週">›</button>
        </div>
        <HelpTip title="工作分配" label="圖例">
          <p>每一診每個崗位排了誰。最下面「機動」＝有上班、但沒排崗位的人（找當班主管）。</p>
          <p><span className="wa-chip is-bad">紅</span>＝排了但那一診沒上班（以班表為準），請找排班負責人。<span className="wa-chip is-learner">瑩</span>字加底線＝跟醫師學習，不算人數。</p>
          <p>能改的人點格子換人；選單依能力表排序，可獨立的在前。</p>
        </HelpTip>
      </div>
      {!saved && <p className="month-status-item">這個月還沒有工作分配，下面照班表上記的「工作」顯示；改任何一格就會存成這個月的工作分配。</p>}
      {error && <p className="month-status-warn">{error}</p>}
      <ScheduleChecklist label="目前狀況" items={checklist} />

      {/* 電腦：一週一張表 */}
      <div className="table-scroll wa-desktop">
        <table className="wa-table">
          <thead>
            <tr>
              <th />
              <th />
              {week.map((date) => (
                <th key={date} className={sessionOpenAny(date) ? "" : "is-closed"}>{formatDay(date).replace(/（/, "\n（")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map((shift) => {
              const rows = rowsOf(shift.id, week);
              return [
                ...rows.map((task, index) => (
                  <tr key={`${shift.id}-${task}`} className={index === 0 ? "is-first" : ""}>
                    {index === 0 && <th rowSpan={rows.length + 1} className={`wa-session wa-${shift.id}`}>{shift.label}</th>}
                    <th scope="row" className="wa-role">{rowLabel(task)}</th>
                    {week.map((date) => {
                      const open = sessionOpen(date, shift.id);
                      const doctorId = taskDoctorId(task);
                      const cell = open ? chips(date, shift.id, task) : [];
                      const usable = open && (!doctorId || doctorsOn(entries, date, shift.id).has(doctorId) || cell.length > 0);
                      return (
                        <td key={date} className={open ? "" : "is-closed"}>
                          {usable && editable ? (
                            <button className="wa-cell" onClick={() => setEditing({ date, shiftId: shift.id, task })} aria-label={`${formatDay(date)} ${shift.label} ${rowLabel(task)}：換人`}>
                              {cell.length > 0 ? cell : <span className="wa-empty">＋</span>}
                            </button>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
                <tr key={`${shift.id}-flex`} className="wa-flex">
                  <th scope="row" className="wa-role">機動</th>
                  {week.map((date) => (
                    <td key={date} className={sessionOpen(date, shift.id) ? "" : "is-closed"}>
                      {sessionOpen(date, shift.id) && unassignedPeople(shown, entries, date, shift.id, ASSISTANT_IDS).map(shortName).join(" ")}
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* 手機：一次看一天 */}
      <div className="wa-mobile">
        <DayScroller
          dates={stripDates}
          selected={day}
          className="week-strip wa-strip"
          daysClassName="week-days"
          navClassName="week-nav"
          label="選擇日期（可左右捲動）"
          renderDay={(date) => {
            const inMonth = date.startsWith(`${month}-`) && clinicDayOf(date).open;
            const bad = issues.some((issue) => issue.date === date);
            return (
              <button
                key={date}
                role="tab"
                aria-selected={date === day}
                className={`week-day ${date === day ? "is-active" : ""} ${inMonth ? "" : "is-out"}`}
                disabled={!inMonth}
                onClick={() => pickDay(date)}
              >
                <small>{WEEKDAY_CHARS[new Date(`${date}T00:00:00Z`).getUTCDay()]}</small>
                <strong>{Number(date.slice(8, 10))}</strong>
                <span className="week-dots" aria-hidden="true">
                  {inMonth && (bad ? <i className="wa-dot-bad" /> : SHIFTS.filter((shift) => sessionOpen(date, shift.id)).map((shift) => <i key={shift.id} className={`shift-${shift.id}`} />))}
                </span>
              </button>
            );
          }}
        />
        {day && <h4 className="wa-day-heading">{formatDay(day)}</h4>}
        {day && SHIFTS.filter((shift) => sessionOpen(day, shift.id)).map((shift) => (
          <div key={shift.id} className="list-group wa-day-group">
            <p className={`wa-day-title wa-${shift.id}`}>{shift.label}</p>
            {rowsOf(shift.id, [day]).map((task) => {
              const cell = chips(day, shift.id, task);
              const doctorId = taskDoctorId(task);
              if (doctorId && !doctorsOn(entries, day, shift.id).has(doctorId) && cell.length === 0) return null;
              return (
                <button key={task} className="list-row wa-row" disabled={!editable} onClick={() => setEditing({ date: day, shiftId: shift.id, task })}>
                  <span />
                  <span className="list-row-title">{rowLabel(task)}</span>
                  <span className="list-row-value">{cell.length > 0 ? cell : "—"}</span>
                </button>
              );
            })}
            <div className="list-row">
              <span />
              <span className="list-row-title">機動</span>
              <span className="list-row-value">{unassignedPeople(shown, entries, day, shift.id, ASSISTANT_IDS).map(shortName).join(" ") || "—"}</span>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SlotEditor
          key={`${editing.date}|${editing.shiftId}|${editing.task}`}
          {...editing}
          entries={entries}
          levels={levels}
          people={peopleIn(editing.date, editing.shiftId, editing.task)}
          learners={taskDoctorId(editing.task) ? peopleIn(editing.date, editing.shiftId, `learn-${taskDoctorId(editing.task)}`) : []}
          onChange={(people, learners) => update(editing.date, editing.shiftId, editing.task, people, learners)}
          onClose={() => setEditing(null)}
        />
      )}

      <Duties week={week} duties={weekDuties} all={shown.duties} editable={editable} onSave={saveDuties} />
    </section>
  );
}

function sessionOpenAny(date: string) {
  return clinicDayOf(date).open;
}

/** 換人：那一診有上班的人（依能力表排序），已經排的在最前面；沒上班卻排了的也列出來，標紅。 */
function SlotEditor(props: {
  date: string;
  shiftId: string;
  task: string;
  entries: ScheduleEntry[];
  levels: AbilityGrid | null;
  people: string[];
  learners: string[];
  onChange(people: string[], learners: string[]): void;
  onClose(): void;
}) {
  const { date, shiftId, task, entries, levels, people, learners } = props;
  const doctorId = taskDoctorId(task);
  const abilityTask = abilityTaskOf(task);
  const working = ASSISTANT_IDS.filter((id) => entries.some((entry) => entry.date === date && entry.shiftId === shiftId && entry.personId === id && entry.state === "shift"));
  const rank = { solo: 0, guided: 1, none: 2 } as const;
  const levelOfPerson = (id: string) => (levels && abilityTask ? levelOf(levels, id, abilityTask) : null);
  const candidates = [...new Set([...people, ...learners, ...working])].sort((a, b) => {
    const chosen = Number(people.includes(b) || learners.includes(b)) - Number(people.includes(a) || learners.includes(a));
    if (chosen !== 0) return chosen;
    const la = levelOfPerson(a);
    const lb = levelOfPerson(b);
    return (la ? rank[la] : 0) - (lb ? rank[lb] : 0);
  });
  const toggle = (id: string) => {
    if (people.includes(id) || learners.includes(id)) props.onChange(people.filter((item) => item !== id), learners.filter((item) => item !== id));
    else props.onChange([...people, id], learners);
  };
  const toggleLearner = (id: string) => {
    if (learners.includes(id)) props.onChange([...people, id], learners.filter((item) => item !== id));
    else props.onChange(people.filter((item) => item !== id), [...learners, id]);
  };
  return (
    <div className="wa-editor" role="dialog" aria-label="換人">
      <div className="wa-editor-head">
        <strong>{formatDay(date)} {shiftLabel(shiftId)}・{rowLabel(task)}</strong>
        <button className="button" onClick={props.onClose}>完成</button>
      </div>
      <p className="assistant-hint">點名字排入或拿掉；{doctorId ? "跟診的人可以改成「學習 +1」（不算人數）；" : ""}依能力表排序。</p>
      <div className="list-group">
        {candidates.map((id) => {
          const chosen = people.includes(id) || learners.includes(id);
          const notWorking = !working.includes(id);
          const level = levelOfPerson(id);
          return (
            <div key={id} className="list-row wa-candidate">
              <span className={`wa-check ${chosen ? "is-on" : ""}`} aria-hidden="true">{chosen ? "✓" : ""}</span>
              <button className="wa-candidate-name" onClick={() => toggle(id)} aria-pressed={chosen}>
                <strong>{ASSISTANT_NAMES.get(id) ?? id}</strong>
                <small className={notWorking ? "is-bad-text" : level && level !== "solo" ? "is-warn-text" : ""}>
                  {notWorking ? "這一診沒上班" : level ? ABILITY_LEVEL_LABELS[level] : ""}
                </small>
              </button>
              {doctorId && chosen && (
                <button className={`button button-quiet button-small ${learners.includes(id) ? "is-active" : ""}`} aria-pressed={learners.includes(id)} onClick={() => toggleLearner(id)}>
                  學習 +1
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 雜務：照日期與診列出；能改的人可以新增、刪除。 */
function Duties({ week, duties, all, editable, onSave }: { week: string[]; duties: WorkDuty[]; all: WorkDuty[]; editable: boolean; onSave(duties: WorkDuty[]): void }) {
  const [date, setDate] = useState(week[0] ?? "");
  const [shiftId, setShiftId] = useState("");
  const [person, setPerson] = useState("");
  const [text, setText] = useState("");
  const sorted = [...duties].sort((a, b) => a.date.localeCompare(b.date) || SHIFTS.findIndex((s) => s.id === a.shiftId) - SHIFTS.findIndex((s) => s.id === b.shiftId));
  const pickedDate = week.includes(date) ? date : week[0] ?? "";
  return (
    <details className="tool-details wa-duties" open={duties.length > 0}>
      <summary className="help-line">
        <strong>雜務</strong>
        <small className="assistant-hint">{duties.length > 0 ? `這週 ${duties.length} 項` : "這週沒有"}</small>
      </summary>
      {sorted.length > 0 && (
        <ul className="wa-duty-list">
          {sorted.map((duty) => (
            <li key={`${duty.date}${duty.shiftId}${duty.text}`}>
              <span className="wa-duty-when">{dayShort(duty.date)}{duty.shiftId ? shiftLabel(duty.shiftId).slice(0, 1) : ""}</span>
              {duty.people.length > 0 && <strong>{duty.people.map(shortName).join("+")}</strong>}
              <span>{duty.text}</span>
              {editable && (
                <button className="link-button" onClick={() => onSave(all.filter((item) => item !== duty))}>刪除</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="wa-duty-form">
          <select aria-label="日期" value={pickedDate} onChange={(event) => setDate(event.target.value)}>
            {week.map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}
          </select>
          <select aria-label="哪一診" value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
            <option value="">整天</option>
            {SHIFTS.map((shift) => <option key={shift.id} value={shift.id}>{shift.label}</option>)}
          </select>
          <select aria-label="誰" value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="">誰（選填）</option>
            {ASSISTANT_IDS.map((id) => <option key={id} value={id}>{ASSISTANT_NAMES.get(id)}</option>)}
          </select>
          <input aria-label="做什麼" value={text} maxLength={200} placeholder="例如：檢查病例、整理環境＋補備品" onChange={(event) => setText(event.target.value)} />
          <button
            className="button button-quiet"
            disabled={!text.trim() || !pickedDate}
            onClick={() => {
              onSave([...all, { date: pickedDate, ...(shiftId ? { shiftId } : {}), people: person ? [person] : [], text: text.trim() }]);
              setText("");
            }}
          >
            新增
          </button>
        </div>
      )}
    </details>
  );
}

