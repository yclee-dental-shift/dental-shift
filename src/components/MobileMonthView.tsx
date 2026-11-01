"use client";

import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { isLearnerEntry } from "@/domain/rules/ability-schedule";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { useState } from "react";
import { DensityButton, useCalendarDensity } from "./CalendarDensity";
import { clinicDayOf, holidayNote } from "./schedule-settings";
import { HelpTip } from "./HelpTip";

const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * 手機看班表的「月曆」：7 欄小格子，每天早／午／晚各一條，寫已排／需求
 * （綠＝人夠、紅＝缺人；已排算機動、不算帶新手 +1）。沒有醫師看診的診不畫，休診日整格灰底。
 * 右上角可換 3 種顯示（`CalendarDensity`）：堆疊（每診一條不寫字）、詳細（每診寫已排／需求）、清單（每天一條分段小彩條）。
 * 點日期在下面列出那天每一診的人數與助理（使用者 2026-11-01：三種都一樣，不跳到單日）；「看單日 ›」才交給 onPick。只看不存資料。
 */
export function MobileMonthView({
  dates,
  assistants,
  entries,
  demands,
  today,
  onPick,
}: {
  dates: string[];
  assistants: CoursePerson[];
  entries: ScheduleEntry[];
  demands: SessionDemand[];
  today: string;
  onPick(date: string): void;
}) {
  const [density, nextDensity] = useCalendarDensity("board");
  const [listDay, setListDay] = useState<string | null>(null);
  if (dates.length === 0) return null;
  const assistantIds = new Set(assistants.map((person) => person.id));
  const nameOf = (id: string) => assistants.find((person) => person.id === id)?.displayName ?? id;
  const blanks = weekdayOf(dates[0]);
  const sessionsOf = (date: string) =>
    courseProfile.shifts
      .map((shift) => {
        const demand = demands.find((item) => item.date === date && item.shiftId === shift.id);
        if (!demand) return null;
        const people = entries.filter(
          (entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shift.id && assistantIds.has(entry.personId),
        );
        const regular = people.filter((entry) => entry.note !== FLEX_SHIFT_NOTE);
        // 已排人數算機動、不算帶新手 +1，和月班表「已排／需求」同一套（使用者 2026-10-30）。
        const placed = people.filter((entry) => !isLearnerEntry(entry)).length;
        return { shift, regular, flex: people.filter((entry) => entry.note === FLEX_SHIFT_NOTE), placed, needed: demand.total };
      })
      .filter((item) => item !== null);
  // 先看今天；今天不在畫面範圍就看第一個有醫師看診的日子。
  const shownDay =
    listDay && dates.includes(listDay)
      ? listDay
      : dates.includes(today)
        ? today
        : (dates.find((date) => demands.some((demand) => demand.date === date)) ?? dates[0]);
  const compact = density === "list";
  const detail = sessionsOf(shownDay);
  const shownClinic = clinicDayOf(shownDay);
  return (
    <div className="mobile-month-view">
      <div className="calendar-toolbar">
        <DensityButton density={density} onNext={nextDensity} />
      </div>
      <div className={`mobile-month-grid density-${density}`} role="grid" aria-label="每天每一診的人數">
        {WEEKDAY_CHARS.map((char) => (
          <span key={char} className="mobile-month-weekday" role="columnheader">{char}</span>
        ))}
        {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {dates.map((date) => {
          const clinic = clinicDayOf(date);
          const note = holidayNote(date);
          const sessions = sessionsOf(date);
          const short = sessions.filter((item) => item.placed < item.needed).length;
          const label = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}，${
            sessions.length === 0
              ? clinic.open ? "沒有醫師看診" : "休診"
              : sessions.map((item) => `${item.shift.label} ${item.placed}/${item.needed}`).join("、")
          }`;
          const selected = date === shownDay;
          return (
            <button
              key={date}
              role="gridcell"
              aria-selected={selected}
              className={`mobile-month-day ${clinic.open ? "" : "is-closed"} ${date === today ? "is-today" : ""} ${short > 0 ? "has-short" : ""} ${selected ? "is-selected" : ""}`}
              aria-label={label}
              onClick={() => setListDay(date)}
            >
              <strong>{Number(date.slice(8, 10))}</strong>
              {note && !compact && <small className="mobile-month-note">{note.short}</small>}
              {compact ? (
                sessions.length > 0 && (
                  <span className="cal-pill" aria-hidden="true">
                    {courseProfile.shifts.map((shift) => {
                      const item = sessions.find((session) => session.shift.id === shift.id);
                      return <i key={shift.id} className={!item ? "is-empty" : item.placed < item.needed ? "is-short" : "is-ok"} />;
                    })}
                  </span>
                )
              ) : (
                // 早／午／晚固定在上／中／下（使用者 2026-10-30），那一診沒看診就留空。
                sessions.length > 0 && (
                  <span className="cal-slots" aria-hidden="true">
                    {courseProfile.shifts.map((shift) => {
                      const item = sessions.find((session) => session.shift.id === shift.id);
                      return item ? (
                        <span key={shift.id} className={`mobile-month-bar ${density === "bars" ? "is-plain" : ""} ${item.placed < item.needed ? "is-short" : "is-ok"}`}>
                          {density === "text" && (
                            // 已排大字、需求小字淡色（使用者 2026-10-30 選 B），以中間為界對齊：已排靠右、需求靠左，數字等寬。
                            <span className="month-ratio">
                              <span>{item.placed}</span>
                              <small>/{item.needed}</small>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span key={shift.id} className={`mobile-month-bar is-empty ${density === "bars" ? "is-plain" : ""}`}>{density === "text" && "\u00a0"}</span>
                      );
                    })}
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
      {/* 圖例三種顯示都有（2026-11-01）：這裡的顏色＝人數夠不夠，和助理月曆（顏色＝早午晚班別）不同，要寫清楚 */}
      <p className="mobile-month-legend help-line">
        點日期，下面列出那一天。顏色＝人數，綠夠、紅缺。
        <HelpTip title="月曆圖例" label="圖例">
          <ul className="calendar-legend">
            {density === "list" ? (
              <li>每天一條，由左到右＝早／午／晚</li>
            ) : (
              <li><span className="legend-stack"><i className="is-ok" /><i className="is-ok" /><i className="is-short" /></span>每格由上到下＝早／午／晚{density === "text" && "，數字＝已排／需求（含機動）"}</li>
            )}
            <li><span className="legend-stack"><i className="is-ok" /></span>綠＝人夠</li>
            <li><span className="legend-stack"><i className="is-short" /></span>紅＝缺人</li>
            <li><span className="legend-closed" />灰底＝診所休診</li>
            <li>這裡的顏色是人數夠不夠，不是班別（助理自己的月曆，顏色才是早／午／晚）。</li>
          </ul>
        </HelpTip>
      </p>
      <div className="mobile-month-list">
        <h3>
          {Number(shownDay.slice(5, 7))}/{Number(shownDay.slice(8, 10))}（{WEEKDAY_CHARS[weekdayOf(shownDay)]}）
          <button type="button" className="button button-quiet" data-view-control onClick={() => onPick(shownDay)}>看單日 ›</button>
        </h3>
        {detail.length === 0 ? (
          <p className="assistant-empty">{holidayNote(shownDay)?.detail ?? (shownClinic.open ? "這天沒有醫師看診。" : `休診${shownClinic.label ? `（${shownClinic.label}）` : ""}。`)}</p>
        ) : (
          detail.map((item) => (
            <div key={item.shift.id} className="mobile-month-list-row">
              <span className={`cal-dot ${item.placed < item.needed ? "is-short" : "is-ok"}`} aria-hidden="true" />
              <div>
                <strong>{item.shift.label}</strong> <small>{item.shift.start}–{item.shift.end}</small>
                <p>
                  {item.regular.length > 0 ? item.regular.map((entry) => nameOf(entry.personId)).join("、") : "還沒排助理"}
                  {item.flex.length > 0 && `；機動：${item.flex.map((entry) => nameOf(entry.personId)).join("、")}`}
                </p>
              </div>
              <span className={`status-badge ${item.placed < item.needed ? "tone-alert" : "tone-ok"}`}>{item.placed}/{item.needed}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
