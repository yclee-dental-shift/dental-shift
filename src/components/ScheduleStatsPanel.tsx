"use client";

import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import {
  personScheduleStats,
  statsAverage,
  statsFlags,
  type CountMinutes,
  type PersonScheduleStats,
  type StatKey,
} from "@/domain/rules/schedule-stats";
import type { ShiftRequests } from "@/domain/rules/shift-request";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { useMemo, useState } from "react";
import { LABOR_SETTINGS } from "./schedule-settings";
import { scrollBehavior } from "./reduce-motion";
import { HelpTip } from "./HelpTip";

const SHIFTS = courseProfile.shifts;
const SHIFT_IDS = SHIFTS.map((shift) => shift.id);

/** 分鐘 → 「47:40」。 */
const hm = (minutes: number) => `${Math.floor(Math.round(minutes) / 60)}:${String(Math.round(minutes) % 60).padStart(2, "0")}`;
const one = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function Pair({ value, unit }: { value: CountMinutes; unit: string }) {
  if (value.count === 0) return <span className="stats-zero">0</span>;
  return (
    <>
      {value.count} {unit}
      <small>{hm(value.minutes)}</small>
    </>
  );
}

/**
 * 排班統計（第 5、6 步）：每位助理的早午晚、機動、請假、總時數、三診、兩頭班、晚診、週六，
 * 最下排是平均；比平均多很多標橘色、超過規定標紅色。點名字跳到月班表那一列。
 */
export function ScheduleStatsPanel({
  month,
  assistants,
  entries,
  requests,
  target,
}: {
  month: string;
  assistants: CoursePerson[];
  entries: ScheduleEntry[];
  requests: ShiftRequests;
  target?: { minMinutes: number; maxMinutes: number };
}) {
  // 預設收起（使用者 2026-10-30：先看班表）；收起時標題旁寫幾人要注意。
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () =>
      assistants.map((person) =>
        personScheduleStats(entries, person.id, month, LABOR_SETTINGS, {
          requests,
          flexNote: FLEX_SHIFT_NOTE,
          eveningShiftId: schedulingPreferences.eveningShiftId,
        }),
      ),
    [assistants, entries, month, requests],
  );
  const average = statsAverage(rows, SHIFT_IDS);
  const flagsOf = (row: PersonScheduleStats) =>
    statsFlags(row, average, { maxConsecutiveEvenings: schedulingPreferences.maxConsecutiveEvenings, target });
  const nameOf = (id: string) => assistants.find((person) => person.id === id)?.displayName ?? id;
  const tone = (flags: Map<StatKey, "warn" | "alert">, key: StatKey) => (flags.get(key) ? `is-${flags.get(key)}` : "");

  // 一句話總結：誰、哪一項、平均多少。
  const notes = rows.flatMap((row) => {
    const flags = flagsOf(row);
    const items: string[] = [];
    SHIFTS.forEach((shift) => {
      if (flags.has(`session:${shift.id}`)) items.push(`${shift.label} ${row.sessions[shift.id].count} 診（平均 ${one(average.sessions[shift.id].count)}）`);
    });
    if (flags.has("tripleDays")) items.push(`三診 ${row.tripleDays} 天（平均 ${one(average.tripleDays)}）`);
    if (flags.has("splitDays")) items.push(`兩頭班 ${row.splitDays} 天（平均 ${one(average.splitDays)}）`);
    if (flags.has("evenings")) items.push(`晚診 ${row.evenings} 次（平均 ${one(average.evenings)}）`);
    if (flags.has("maxEveningStreak")) items.push(`連續晚診 ${row.maxEveningStreak} 天（上限 ${schedulingPreferences.maxConsecutiveEvenings}）`);
    if (flags.has("saturdaysYear")) items.push(`週六今年 ${row.saturdaysYear} 次（平均 ${one(average.saturdaysYear)}）`);
    if (flags.has("totalMinutes")) items.push(`總時數 ${hm(row.totalMinutes)} 不在目標內`);
    return items.length > 0 ? [{ personId: row.personId, alert: [...flags.values()].includes("alert"), text: items.join("、") }] : [];
  });

  const jump = (personId: string) => {
    const row = document.querySelector(`.month-grid tr[data-person="${personId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    row.classList.add("is-flash");
    window.setTimeout(() => row.classList.remove("is-flash"), 1600);
  };
  const Name = ({ id }: { id: string }) => (
    <button className="link-button" title="跳到月班表這一列" onClick={() => jump(id)}>
      {nameOf(id)}
    </button>
  );

  return (
    <section className="stats-panel" aria-label="排班統計">
      <div className="stats-head">
        <strong>排班統計</strong>
        <span className="assistant-hint">
          排完檢查是否平均。
          <HelpTip title="排班統計" guide="stats">
            <p>一鍵排班或手動修改後馬上更新。</p>
            <p>橘色＝比平均多 2 次以上（週六今年累計多 1 次以上）；紅色＝連續晚診超過 {schedulingPreferences.maxConsecutiveEvenings} 天，或總時數不在目標工時內。</p>
            <p>跟診不含機動；特休、其他假：整天排休算 1 次 8 小時，指定診次請假算 1 次、那一診的時數。平均只算這個月有排班的人。</p>
          </HelpTip>
        </span>
        {!open && (
          <span className={`stats-summary ${notes.length > 0 ? "is-warn" : ""}`}>
            {notes.length > 0 ? `${notes.length} 人需要注意` : "沒有明顯不平均的地方"}
          </span>
        )}
        <button className="button button-quiet print-only-hide" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "收起" : "展開"}
        </button>
      </div>
      {open && (
        <>
          {notes.length === 0 ? (
            <p className="stats-ok">沒有明顯不平均的地方。</p>
          ) : (
            <ul className="stats-notes">
              {notes.map((note) => (
                <li key={note.personId} className={note.alert ? "is-alert" : "is-warn"}>
                  <Name id={note.personId} />：{note.text}
                </li>
              ))}
            </ul>
          )}
          <div className="table-scroll" tabIndex={0} aria-label="可水平捲動的排班統計">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">助理</th>
                  {SHIFTS.map((shift) => (
                    <th scope="col" key={shift.id}>{shift.label}<small>{shift.start}–{shift.end}</small></th>
                  ))}
                  <th scope="col">跟診小計</th>
                  <th scope="col">機動<small>行政</small></th>
                  <th scope="col">特休</th>
                  <th scope="col">其他假</th>
                  <th scope="col">總時數<small>含請假</small></th>
                  <th scope="col">三診<small>天數</small></th>
                  <th scope="col">兩頭班<small>天數</small></th>
                  <th scope="col">晚診<small>次數</small></th>
                  <th scope="col">連續晚診<small>最長天數</small></th>
                  <th scope="col">週六<small>本月／今年</small></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flags = flagsOf(row);
                  return (
                    <tr key={row.personId}>
                      <th scope="row"><Name id={row.personId} /></th>
                      {SHIFTS.map((shift) => (
                        <td key={shift.id} className={tone(flags, `session:${shift.id}`)}>
                          <Pair value={row.sessions[shift.id]} unit="診" />
                        </td>
                      ))}
                      <td>{hm(row.clinical.minutes)}</td>
                      <td><Pair value={row.flex} unit="診" /></td>
                      <td><Pair value={row.annualLeave} unit="次" /></td>
                      <td><Pair value={row.otherLeave} unit="次" /></td>
                      <td className={tone(flags, "totalMinutes")}>{hm(row.totalMinutes)}</td>
                      <td className={tone(flags, "tripleDays")}>{row.tripleDays}</td>
                      <td className={tone(flags, "splitDays")}>{row.splitDays}</td>
                      <td className={tone(flags, "evenings")}>{row.evenings}</td>
                      <td className={tone(flags, "maxEveningStreak")}>{row.maxEveningStreak}</td>
                      <td className={tone(flags, "saturdaysYear")}>{row.saturdays}／{row.saturdaysYear}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">平均<small>{average.count} 人</small></th>
                  {SHIFTS.map((shift) => (
                    <td key={shift.id}>
                      {one(average.sessions[shift.id].count)} 診<small>{hm(average.sessions[shift.id].minutes)}</small>
                    </td>
                  ))}
                  <td>{hm(average.clinicalMinutes)}</td>
                  <td>{hm(average.flexMinutes)}</td>
                  <td />
                  <td />
                  <td>{hm(average.totalMinutes)}</td>
                  <td>{one(average.tripleDays)}</td>
                  <td>{one(average.splitDays)}</td>
                  <td>{one(average.evenings)}</td>
                  <td>{one(average.maxEveningStreak)}</td>
                  <td>{one(average.saturdays)}／{one(average.saturdaysYear)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
