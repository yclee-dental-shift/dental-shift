"use client";

import { useState } from "react";
import { courseProfile } from "@/config/clinic.config";
import {
  removeVisit,
  saveVisit,
  SHIFT_KEYS,
  type ClinicVisit,
  type DoctorScheduleConfig,
  type ShiftKey,
} from "@/domain/rules/doctor-schedule";
import { DoctorChips, DoctorSlotPicker, displayOrder, shortDoctorName } from "./DoctorSlotPicker";
import { fullMonthLabel, monthDates, shiftMonth } from "./schedule-settings";

const shiftLabel = (shiftId: string) => courseProfile.shifts.find((shift) => shift.id === shiftId)?.label ?? shiftId;

export const visitSummary = (visit: ClinicVisit) =>
  SHIFT_KEYS.filter((shiftId) => visit.sessions[shiftId]?.length)
    .map((shiftId) => `${shiftLabel(shiftId)}：${displayOrder(visit.sessions[shiftId]!).map((slot) => (slot.limited ? `(${shortDoctorName(slot.personId)})` : shortDoctorName(slot.personId))).join("、")}`)
    .join("；");

export const datesByMonth = (dates: string[]) => {
  const groups = new Map<string, number[]>();
  [...dates].sort().forEach((date) => groups.set(date.slice(0, 7), [...(groups.get(date.slice(0, 7)) ?? []), Number(date.slice(8, 10))]));
  return [...groups.entries()].map(([month, days]) => `${Number(month.slice(5))} 月 ${days.join("、")}`).join("；");
};

/** 一筆來診的編輯：名稱、各診醫師、在月曆上點選日期。按「確定」放進整頁草稿，整頁按「儲存」才寫入。 */
function VisitForm({
  config,
  initial,
  onChange,
  onDone,
}: {
  config: DoctorScheduleConfig;
  initial: ClinicVisit;
  onChange(config: DoctorScheduleConfig): void;
  onDone(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [shiftId, setShiftId] = useState<ShiftKey>(SHIFT_KEYS.find((id) => initial.sessions[id]?.length) ?? "morning");
  const [month, setMonth] = useState(initial.dates[0]?.slice(0, 7) ?? config.firstMonth);
  const firstWeekday = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const closed = new Set(config.closures.map((closure) => closure.date));
  const toggleDate = (date: string) =>
    setDraft({ ...draft, dates: draft.dates.includes(date) ? draft.dates.filter((item) => item !== date) : [...draft.dates, date] });
  const hasDoctor = SHIFT_KEYS.some((id) => draft.sessions[id]?.length);
  const save = () => {
    if (!draft.label.trim()) return window.alert("請填名稱，例如「矯正 黃醫師」。");
    if (!hasDoctor) return window.alert("請至少在一診勾選一位醫師。");
    if (draft.dates.length === 0) return window.alert("請在月曆上點選至少一天。");
    onChange(saveVisit(config, draft));
    onDone();
  };

  return (
    <div className="slot-editor visit-form">
      <label className="visit-label">
        名稱
        <input type="text" value={draft.label} maxLength={30} placeholder="例如：矯正 黃醫師、週日加開" onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      </label>
      <div className="chip-row" role="tablist" aria-label="診別">
        {SHIFT_KEYS.map((id) => (
          <button key={id} role="tab" aria-selected={id === shiftId} className={`reason-chip ${id === shiftId ? "is-active" : ""}`} onClick={() => setShiftId(id)}>
            {shiftLabel(id)}（{draft.sessions[id]?.length ?? 0} 位）
          </button>
        ))}
      </div>
      <DoctorSlotPicker
        slots={draft.sessions[shiftId] ?? []}
        onChange={(slots) => setDraft({ ...draft, sessions: { ...draft.sessions, [shiftId]: slots } })}
      />
      <div>
        <div className="assistant-month people-month">
          <button className="button button-quiet" aria-label="上個月" disabled={month <= config.firstMonth} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <strong>{fullMonthLabel(month)}</strong>
          <button className="button button-quiet" aria-label="下個月" disabled={month >= config.lastMonth} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
        </div>
        <div className="leave-calendar visit-calendar" role="grid" aria-label={`${fullMonthLabel(month)}來診日期`}>
          {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span className="leave-weekday" key={day}>{day}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
          {monthDates(month).map((date) => (
            <button
              key={date}
              className={`leave-day ${draft.dates.includes(date) ? "is-visit" : ""}`}
              aria-pressed={draft.dates.includes(date)}
              title={closed.has(date) ? "休診日：這天不會看診" : undefined}
              onClick={() => toggleDate(date)}
            >
              {Number(date.slice(8, 10))}
              {closed.has(date) && <small>休診</small>}
            </button>
          ))}
        </div>
        <p className="assistant-hint">已選 {draft.dates.length} 天{draft.dates.length > 0 ? `：${datesByMonth(draft.dates)}` : ""}。休診日即使選了也不會看診。</p>
      </div>
      <div className="toolbar-actions">
        <button className="button" onClick={save}>確定</button>
        <button className="button button-quiet" onClick={onDone}>取消</button>
      </div>
    </div>
  );
}

const newVisit = (date?: string): ClinicVisit => ({
  id: `visit-${Date.now().toString(36)}`,
  label: date ? "臨時加開" : "",
  dates: date ? [date] : [],
  sessions: {},
});

/**
 * 專科醫師來診日（也用來臨時加開）：列表、新增、修改、刪除。
 * start：從快速按鈕或預覽月曆「這天加開」進來時，直接打開新增表單（可帶日期；父層用 key 重新掛載）。
 */
export function VisitEditor({
  config,
  start,
  onChange,
}: {
  config: DoctorScheduleConfig;
  start?: { date?: string };
  onChange(config: DoctorScheduleConfig): void;
}) {
  const [editing, setEditing] = useState<ClinicVisit | null>(() => (start ? newVisit(start.date) : null));
  const startNew = () => setEditing(newVisit());
  const remove = (visit: ClinicVisit) => {
    if (!window.confirm(`刪除「${visit.label}」？這些日期會只剩固定班。`)) return;
    onChange(removeVisit(config, visit.id));
  };

  return (
    <>
      <ul className="visit-list">
        {config.visits.map((visit) =>
          editing?.id === visit.id ? (
            <li key={visit.id} className="is-editing">
              <VisitForm config={config} initial={visit} onChange={onChange} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={visit.id}>
              <span className="visit-head">
                <strong>{visit.label}</strong>
                <span>
                  <button className="link-button is-quiet" onClick={() => setEditing(visit)}>修改</button>
                  <button className="link-button" onClick={() => remove(visit)}>刪除</button>
                </span>
              </span>
              <span className="visit-sessions">
                {SHIFT_KEYS.filter((shiftId) => visit.sessions[shiftId]?.length).map((shiftId) => (
                  <span key={shiftId} className="visit-session">
                    <span className={`month-tag shift-${shiftId}`}>{shiftLabel(shiftId).slice(0, 1)}</span>
                    <DoctorChips slots={visit.sessions[shiftId]} />
                  </span>
                ))}
              </span>
              <small>{datesByMonth(visit.dates)}</small>
            </li>
          ),
        )}
      </ul>
      {editing && !config.visits.some((visit) => visit.id === editing.id) ? (
        <VisitForm config={config} initial={editing} onChange={onChange} onDone={() => setEditing(null)} />
      ) : (
        <button className="button button-quiet add-visit" onClick={startNew}>＋ 新增一筆來診／加開</button>
      )}
    </>
  );
}
