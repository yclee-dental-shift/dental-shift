"use client";

import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { isLearnerEntry } from "@/domain/rules/ability-schedule";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { preLeaveType } from "@/domain/rules/leave-window";
import { isStaleTask, taskLabel, taskShort } from "@/domain/rules/shift-task";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { useMemo, useState } from "react";
import { DayScroller, scrollerDates } from "./DayScroller";
import { shortDoctorName } from "./DoctorSlotPicker";
import { HolidayNote } from "./HolidayNote";
import { clinicDayOf, holidayNote } from "./schedule-settings";

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * 手機看班表：上面一排日期（整個月可以左右滑；色點＝早／午／晚，紅點＝那一診還缺人），
 * 下面是選中那天每一診一張卡片：時間、醫師、已排的助理、已排／需求。
 * 點助理名字＝打開那一格的修改視窗；點「＋ 補人」列出那一診還能排的助理，點名字一樣打開修改視窗。
 * 只是另一種看法，資料與修改都沿用月班表（onSelect）。
 */
export function MobileDayView({
  selected,
  onPick,
  dates,
  week,
  assistants,
  entries,
  demands,
  formatDay,
  onSelect,
}: {
  /** 選中的那一天（由班表決定：從月曆點進來、換週、按「本週／本月」都會變）。 */
  selected: string;
  /** 點日期帶上的某一天（班表會把週換到那一天）。 */
  onPick(date: string): void;
  /** 日期帶上點得到的日子：這個月整個月（週檢視再加上這一週跨到別月的日子）。 */
  dates: string[];
  /** 週檢視時這一週的日子，日期帶上淡淡標出來；月檢視不傳。 */
  week?: string[];
  assistants: CoursePerson[];
  entries: ScheduleEntry[];
  demands: SessionDemand[];
  formatDay(date: string): string;
  onSelect(cell: { date: string; personId: string }): void;
}) {
  const inRange = new Set(dates);
  const inWeek = new Set(week ?? []);
  const [adding, setAdding] = useState<string | null>(null);
  const day = selected;
  const scrollDates = useMemo(() => (dates.length > 0 ? scrollerDates(dates[0], dates[dates.length - 1]) : []), [dates]);
  if (!day) return null;
  const assistantIds = new Set(assistants.map((person) => person.id));
  const nameOf = (id: string) => assistants.find((person) => person.id === id)?.displayName ?? id;
  const dayEntries = (date: string) => entries.filter((entry) => entry.date === date && assistantIds.has(entry.personId));
  const demandsOf = (date: string) => demands.filter((demand) => demand.date === date);
  const pick = (date: string) => {
    onPick(date);
    setAdding(null);
  };

  const todayEntries = dayEntries(day);
  const leaves = todayEntries.filter((entry) => entry.state === "leave");
  const clinic = clinicDayOf(day);
  const shifts = courseProfile.shifts.filter(
    (shift) => demandsOf(day).some((demand) => demand.shiftId === shift.id) || todayEntries.some((entry) => entry.shiftId === shift.id),
  );

  return (
    <div className="mobile-day-view">
      {/* 日期帶：整個月都能連續左右捲動（使用者 2026-10-26）；週檢視也是整個月，這一週淡淡標出來，點別週的日子＝換到那一週（使用者 2026-10-30）。 */}
      <DayScroller
        dates={scrollDates}
        selected={day}
        className="week-strip"
        daysClassName="week-days"
        navClassName="week-nav"
        label="選擇日期（可左右捲動）"
        renderDay={(date) => {
          const items = dayEntries(date);
          return (
            <button
              key={date}
              role="tab"
              aria-selected={date === day}
              className={`week-day ${date === day ? "is-active" : ""} ${inWeek.has(date) ? "in-week" : ""}`}
              disabled={!inRange.has(date)}
              onClick={() => pick(date)}
            >
              <small>{WEEKDAY_CHARS[weekdayOf(date)]}</small>
              <strong>{Number(date.slice(8, 10))}</strong>
              <span className="week-dots" aria-hidden="true">
                {courseProfile.shifts.map((shift) => {
                  const demand = demandsOf(date).find((item) => item.shiftId === shift.id);
                  if (!demand) return null;
                  const placed = items.filter((entry) => entry.state === "shift" && entry.shiftId === shift.id && !isLearnerEntry(entry)).length;
                  return <i key={shift.id} className={placed < demand.total ? "tone-short" : `shift-${shift.id}`} />;
                })}
              </span>
            </button>
          );
        }}
      />

      <h3 className="mobile-day-title">
        {formatDay(day)}
        <HolidayNote date={day} />
      </h3>
      {shifts.length === 0 ? (
        <p className="assistant-empty">{holidayNote(day)?.detail ?? (clinic.open ? "這天沒有醫師看診。" : `休診${clinic.label ? `（${clinic.label}）` : ""}。`)}</p>
      ) : (
        shifts.map((shift) => {
          const demand = demandsOf(day).find((item) => item.shiftId === shift.id);
          const placed = todayEntries
            .filter((entry) => entry.state === "shift" && entry.shiftId === shift.id)
            .sort((a, b) => Number(a.note === FLEX_SHIFT_NOTE) - Number(b.note === FLEX_SHIFT_NOTE));
          const needed = demand?.total ?? 0;
          // 已排人數算機動、不算帶新手 +1，和月班表「已排／需求」同一套（使用者 2026-10-30）；機動幾人另外標。
          const regular = placed.filter((entry) => !isLearnerEntry(entry)).length;
          const flex = placed.filter((entry) => entry.note === FLEX_SHIFT_NOTE).length;
          const missing = Math.max(0, needed - regular);
          const key = `${day}_${shift.id}`;
          // 還能排的助理：這一診還沒排、這天也沒休假。
          const free = assistants.filter(
            (person) => !todayEntries.some((entry) => entry.personId === person.id && (entry.state === "leave" || entry.shiftId === shift.id)),
          );
          return (
            <div key={shift.id} className="mobile-shift-card">
              <div className="mobile-shift-head">
                <strong>
                  <span className={`shift-dot dot-${shift.id}`} aria-hidden="true" />
                  {shift.label} {shift.start}–{shift.end}
                </strong>
                {demand && (
                  <span className={`status-badge ${missing > 0 ? "tone-alert" : "tone-ok"}`}>
                    {missing > 0 ? `缺 ${missing}` : `${regular}/${needed}`}
                    {flex > 0 && `・含機動 ${flex}`}
                  </span>
                )}
              </div>
              {demand && (
                <span className="fill-bar" aria-hidden="true">
                  <i style={{ width: `${needed ? Math.min(100, (regular / needed) * 100) : 100}%` }} />
                </span>
              )}
              <p className="mobile-shift-doctors">
                {demand?.doctorIds.length ? demand.doctorIds.map(shortDoctorName).join("、") : "沒有醫師（行事曆外）"}
              </p>
              <div className="mobile-shift-people">
                {placed.map((entry) => (
                  <button
                    key={entry.id}
                    className={`person-chip ${entry.note === FLEX_SHIFT_NOTE ? "is-flex" : ""}`}
                    onClick={() => onSelect({ date: day, personId: entry.personId })}
                  >
                    {nameOf(entry.personId)}
                    {entry.note === FLEX_SHIFT_NOTE && <small>機動</small>}
                    {entry.task && (
                      <small className={`task-tag ${isStaleTask(entry, entries) ? "is-stale" : ""} ${isLearnerEntry(entry) ? "is-learner" : ""}`} title={taskLabel(entry.task)}>
                        {taskShort(entry.task)}
                      </small>
                    )}
                  </button>
                ))}
                {missing > 0 && (
                  <button className="person-chip is-empty" aria-expanded={adding === key} onClick={() => setAdding(adding === key ? null : key)}>
                    ＋ 補人（缺 {missing}）
                  </button>
                )}
                {missing === 0 && free.length > 0 && (
                  <button className="person-chip is-add" aria-expanded={adding === key} onClick={() => setAdding(adding === key ? null : key)}>
                    ＋
                  </button>
                )}
              </div>
              {adding === key && (
                <div className="mobile-add-list">
                  <small>點名字打開那一格，選{shift.label}：</small>
                  {free.length === 0 ? (
                    <span className="assistant-empty">沒有可以排的助理。</span>
                  ) : (
                    free.map((person) => (
                      <button key={person.id} className="person-chip" onClick={() => onSelect({ date: day, personId: person.id })}>
                        {person.displayName}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      {leaves.length > 0 && (
        <p className="mobile-day-leaves">
          休假：
          {leaves
            .map((entry) => `${nameOf(entry.personId)}${preLeaveType(entry) ? `（排休）` : ""}`)
            .join("、")}
        </p>
      )}
    </div>
  );
}
