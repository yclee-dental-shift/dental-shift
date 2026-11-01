"use client";

import { courseProfile } from "@/config/clinic.config";
import { taskDoctorId, taskLabel, taskShort } from "@/domain/rules/shift-task";
import { rolesOf } from "@/domain/rules/work-assignment";
import { preLeaveType } from "@/domain/rules/leave-window";
import type { ScheduleEntry } from "@/domain/types";
import { useState, type ReactNode } from "react";
import { DensityButton, useCalendarDensity } from "./CalendarDensity";
import { clinicDayOf, holidayNote, monthDates } from "./schedule-settings";
import { HelpTip } from "./HelpTip";
import { useWorkAssignments } from "./WorkAssignmentBoard";

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const shiftOrder = (id?: string) => courseProfile.shifts.findIndex((shift) => shift.id === id);
const SLOT_IDS = courseProfile.shifts.map((shift) => shift.id);
/** 月曆上的崗位：跟診＝醫師名字（志明、美玲…，學習字加底線），其他＝流1、流2、櫃台、預留。 */
const roleShort = (task: string) => {
  const doctorId = taskDoctorId(task);
  if (doctorId) return taskShort(task);
  return ({ "float-1": "流1", "float-2": "流2", counter: "櫃台", reserve: "預留" } as Record<string, string>)[task] ?? taskShort(task);
};

/**
 * 助理自己的月曆（我的班表、待確認頁的「月曆」）：7 欄，每天顯示自己排到的班（早／午／晚同班表顏色、固定在上／中／下，
 * 助理不用知道哪一班是補工時的機動，一律實心，使用者 2026-10-31），休假顯示「休」、有假別的排休顯示假別首字；休診日灰底。只看不改。
 * 右上角可換 3 種顯示（`CalendarDensity`：堆疊／詳細／清單）。
 * 有 renderDetail 時每一天可以點，三種顯示都在月曆下面列出那天（使用者 2026-11-01：不要跳到「單日」）。
 */
export function MyMonthCalendar({
  month,
  entries,
  today,
  renderDetail,
}: {
  month: string;
  entries: ScheduleEntry[];
  today: string;
  /** 月曆下面要列的內容（選定那天）。 */
  renderDetail?(date: string): ReactNode;
}) {
  const [density, nextDensity] = useCalendarDensity("assistant");
  const assignments = useWorkAssignments()[month];
  // 文字顯示：位置已經固定（上早、中午、下晚），有排崗位就寫崗位（使用者 2026-10-30），沒排才寫「早診」。
  const taskOf = (entry: ScheduleEntry) => rolesOf(assignments, entry.date, entry.shiftId ?? "", entry.personId)[0] ?? entry.task;
  const roleText = (entry: ScheduleEntry) => {
    const roles = rolesOf(assignments, entry.date, entry.shiftId ?? "", entry.personId);
    const task = roles[0] ?? entry.task;
    if (!task) return undefined;
    return roleShort(task) + (roles.length > 1 ? "…" : "");
  };
  const dates = monthDates(month);
  const [listDay, setListDay] = useState<string | null>(null);
  // 先看今天；今天不在這個月就看這個月第一個有班的日子。
  const shownDay = listDay?.startsWith(month)
    ? listDay
    : dates.includes(today)
      ? today
      : (dates.find((date) => entries.some((entry) => entry.date === date)) ?? dates[0]);
  const listing = !!renderDetail;
  const blanks = weekdayOf(dates[0]);
  return (
    <>
    <div className="calendar-toolbar">
      <DensityButton density={density} onNext={nextDensity} />
    </div>
    <div className={`my-month-grid density-${density}`} role="grid" aria-label="我這個月的班">
      {WEEKDAY_CHARS.map((char) => (
        <span key={char} className="my-month-weekday" role="columnheader">{char}</span>
      ))}
      {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {dates.map((date) => {
        const items = entries.filter((entry) => entry.date === date);
        const leave = items.find((entry) => entry.state === "leave");
        const shifts = items.filter((entry) => entry.state === "shift").sort((a, b) => shiftOrder(a.shiftId) - shiftOrder(b.shiftId));
        const clinic = clinicDayOf(date);
        const note = holidayNote(date);
        const leaveType = leave ? preLeaveType(leave) : undefined;
        const label = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}，${
          leave ? (leaveType ? `排休（${leaveType}）` : "休假") : shifts.length > 0
            ? shifts
                .map((entry) => {
                  const task = taskOf(entry);
                  const what = task ? taskLabel(task) : "";
                  return `${courseProfile.shifts[shiftOrder(entry.shiftId)]?.label}${what ? `（${what}）` : ""}`;
                })
                .join("、")
            : "沒有排班"
        }`;
        const pick = listing ? () => setListDay(date) : undefined;
        const Cell = pick ? "button" : "span";
        const leaveTone = leaveType ? "tone-pre-leave" : "tone-leave";
        return (
          <Cell
            key={date}
            role="gridcell"
            aria-label={label}
            aria-selected={listing ? date === shownDay : undefined}
            className={`my-month-day ${clinic.open ? "" : "is-closed"} ${date === today ? "is-today" : ""} ${pick ? "is-pickable" : ""} ${listing && date === shownDay ? "is-selected" : ""}`}
            onClick={pick}
          >
            <strong>{Number(date.slice(8, 10))}</strong>
            {note && density !== "list" && <small className="my-month-note">{note.short}</small>}
            {(leave || shifts.length > 0) &&
              (density === "list" ? (
                <span className="cal-pill" aria-hidden="true">
                  {SLOT_IDS.map((id) => {
                    const entry = shifts.find((item) => item.shiftId === id);
                    return <i key={id} className={leave ? leaveTone : entry ? `shift-${id}` : "is-empty"} />;
                  })}
                </span>
              ) : (
                // 早／午／晚固定在上／中／下（使用者 2026-10-30），沒排的留空；休假三格都畫。
                <span className={`cal-slots density-${density}`} aria-hidden="true">
                  {density === "text" && leave ? (
                    <span className={`leave-label is-full ${leaveType ? "is-pre-leave" : ""}`}>{leaveType ?? "休"}</span>
                  ) : (
                    SLOT_IDS.map((id) => {
                      const entry = shifts.find((item) => item.shiftId === id);
                      if (density === "bars") return <span key={id} className={`cal-bar ${leave ? leaveTone : entry ? `shift-${id}` : "is-empty"}`} />;
                      return entry ? (
                        <span key={id} className={`shift-label shift-${id} ${taskOf(entry)?.startsWith("learn-") ? "is-learner" : ""}`}>{roleText(entry) ?? courseProfile.shifts[shiftOrder(id)]?.label}</span>
                      ) : (
                        <span key={id} className="shift-label is-empty" />
                      );
                    })
                  )}
                </span>
              ))}
          </Cell>
        );
      })}
    </div>
    {density !== "list" && (
      <p className="assistant-hint help-line">
        {listing ? "點日期，下面列出那一天。" : "每天自己排到的班。"}
        <HelpTip title="月曆圖例" label="圖例">
          <CalendarLegend density={density} />
        </HelpTip>
      </p>
    )}
    {listing && renderDetail(shownDay)}
    </>
  );
}

/** 圖例（使用者 2026-10-30：純文字和月曆上的條、字對不起來）：照目前的顯示方式畫一樣的色塊或字。 */
function CalendarLegend({ density }: { density: string }) {
  const text = density === "text";
  const sample = (shiftId: string, label: string) =>
    text ? <span className={`shift-label shift-${shiftId}`}>{label}</span> : <span className={`cal-bar shift-${shiftId}`} />;
  return (
    <ul className="calendar-legend">
      {courseProfile.shifts.map((shift) => (
        <li key={shift.id}>{sample(shift.id, shift.label)}{shift.label}</li>
      ))}
      {text && <li>位置固定：上＝早、中＝午、下＝晚；有排崗位就寫崗位（例如志明、櫃台、流1；字加底線＝跟著學習）</li>}
      <li>{text ? <span className="leave-label">休</span> : <span className="cal-bar tone-leave" />}休息</li>
      <li>{text ? <span className="leave-label is-pre-leave">特</span> : <span className="cal-bar tone-pre-leave" />}排休{text && "（假別）"}</li>
      <li><span className="legend-closed" />灰底＝診所休診</li>
    </ul>
  );
}
