"use client";

import { useState } from "react";
import { formatDay } from "@/domain/dates";
import { isCalendarMonth, removeClosure, setClosure, type DoctorScheduleConfig } from "@/domain/rules/doctor-schedule";
import { fullMonthLabel } from "./schedule-settings";

const QUICK_LABELS = ["國定假日", "補假", "診所補假休診", "颱風停診"];

/** 休診日：依月份列出，可新增（日期＋原因）與刪除。休診日當天不看診，優先於所有設定。presetDate：預先填好日期。 */
export function ClosureEditor({
  config,
  presetDate,
  onChange,
}: {
  config: DoctorScheduleConfig;
  presetDate?: string;
  onChange(config: DoctorScheduleConfig): void;
}) {
  const [date, setDate] = useState(presetDate ?? "");
  const [label, setLabel] = useState("");
  const save = onChange;
  const add = () => {
    if (!date || !label.trim()) return;
    if (!isCalendarMonth(config, date.slice(0, 7))) {
      window.alert(`${fullMonthLabel(date.slice(0, 7))}不在行事曆範圍內，請先延長行事曆。`);
      return;
    }
    const existing = config.closures.find((closure) => closure.date === date);
    if (existing && !window.confirm(`${formatDay(date)}已經是休診（${existing.label}），要改成「${label.trim()}」嗎？`)) return;
    save(setClosure(config, date, label.trim()));
    setDate("");
  };
  const months = [...new Set(config.closures.map((closure) => closure.date.slice(0, 7)))].sort();

  return (
    <>
      <div className="closure-form">
        <label>
          日期
          <input type="date" value={date} min={`${config.firstMonth}-01`} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          原因
          <input type="text" value={label} maxLength={20} placeholder="例如：颱風停診" onChange={(event) => setLabel(event.target.value)} />
        </label>
        <span className="chip-row">
          {QUICK_LABELS.map((item) => (
            <button key={item} type="button" className={`reason-chip ${label === item ? "is-active" : ""}`} onClick={() => setLabel(item)}>
              {item}
            </button>
          ))}
        </span>
        <button className="button" disabled={!date || !label.trim()} onClick={add}>新增休診日</button>
      </div>
      {months.length === 0 ? (
        <p className="assistant-empty">目前沒有休診日。</p>
      ) : (
        <div className="closure-months">
          {months.map((month) => (
            <div key={month} className="closure-month">
              <strong>{fullMonthLabel(month)}</strong>
              <ul>
                {config.closures
                  .filter((closure) => closure.date.startsWith(month))
                  .map((closure) => (
                    <li key={closure.date}>
                      <span>{formatDay(closure.date)}・{closure.label}</span>
                      <button
                        className="link-button"
                        aria-label={`刪除 ${formatDay(closure.date)} 休診`}
                        onClick={() => window.confirm(`刪除 ${formatDay(closure.date)}（${closure.label}）休診？那天會依固定班看診。`) && save(removeClosure(config, closure.date))}
                      >
                        刪除
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
