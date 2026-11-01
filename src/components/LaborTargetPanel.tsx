"use client";

import { FLEX_SHIFT_NOTE, laborRules } from "@/config/labor.config";
import { formatHours, summarizeMonth, targetRange, type TargetHours } from "@/domain/rules/labor-hours";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { useState } from "react";
import { LABOR_SETTINGS } from "./schedule-settings";
import { useShiftRequests } from "./useShiftRequests";
import { HelpTip } from "./HelpTip";

interface LaborTargetPanelProps {
  id?: string;
  month: string;
  assistants: CoursePerson[];
  entries: ScheduleEntry[];
  /** 這個月的手動設定（小時）；沒有＝用預設。 */
  custom?: TargetHours;
  editable: boolean;
  onSave(target: TargetHours | undefined): void;
}

/** 排班步驟：每月目標工時區間（可調整）與每位助理的工時（上班＋請假）。收成一行（使用者 2026-10-30），點開才看到表格。 */
export function LaborTargetPanel({ id, month, assistants, entries, custom, editable, onSave }: LaborTargetPanelProps) {
  const { requests } = useShiftRequests();
  const range = targetRange(month, LABOR_SETTINGS, custom);
  const fallback = targetRange(month, LABOR_SETTINGS);
  const [draft, setDraft] = useState<{ key: string; min: string; max: string } | null>(null);
  const key = `${month}_${range?.minMinutes}_${range?.maxMinutes}`;
  const current = draft?.key === key ? draft : { key, min: String((range?.minMinutes ?? 0) / 60), max: String((range?.maxMinutes ?? 0) / 60) };
  if (!range || !fallback) return <p className="month-status-item">這個月還沒設定應上班天數，無法計算目標工時。</p>;

  const min = Number(current.min);
  const max = Number(current.max);
  const normal = fallback.maxMinutes / 60 + laborRules.targetBelowNormalHours.max;
  const valid = Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max && max <= normal;
  const rows = assistants.map((person) => ({ person, summary: summarizeMonth(entries, person.id, month, LABOR_SETTINGS, requests) }));
  const paid = rows.map((row) => row.summary.paidMinutes);
  const spread = paid.length > 0 ? Math.max(...paid) - Math.min(...paid) : 0;
  // 佔正常工時的百分比，取到小數一位。
  const percent = (hours: number) => `${((hours / normal) * 100).toFixed(1)}%`;
  const offTarget = paid.filter((minutes) => minutes < range.minMinutes || minutes > range.maxMinutes).length;
  const statusOf = (minutes: number) =>
    minutes < range.minMinutes ? { text: `少 ${formatHours(range.minMinutes - minutes)}`, tone: "is-under" } :
    minutes > range.maxMinutes ? { text: `多 ${formatHours(minutes - range.maxMinutes)}`, tone: "is-over" } :
    { text: "在目標內", tone: "is-ok" };

  return (
    <details className="labor-target tool-details" id={id}>
      <summary className="help-line">
        <strong>目標工時</strong>
        <span>{formatHours(range.minMinutes)}～{formatHours(range.maxMinutes)} 小時</span>
        {offTarget > 0 ? <span className="month-status-warn">{offTarget} 人不在目標內</span> : <span className="month-status-item">都在目標內</span>}
        <HelpTip title="目標工時" guide="hours">
          <p>一鍵排班先補齊每診需求，再幫還沒到下限的人加排「{FLEX_SHIFT_NOTE}」（可做行政、庫存、聯絡、教學等），補到目標內就停。</p>
          <p>請假（有假別的排休）每天算 {laborRules.leaveHoursPerDay} 小時，含在工時裡。</p>
        </HelpTip>
      </summary>
      <div className="labor-target-setting">
        <span>
          {formatHours(range.minMinutes)}～{formatHours(range.maxMinutes)} 小時
          （正常工時 {normal} 小時的 {percent(range.minMinutes / 60)}～{percent(range.maxMinutes / 60)}）
          <small>（含請假；{custom ? "已手動調整" : `預設少 ${laborRules.targetBelowNormalHours.max}～${laborRules.targetBelowNormalHours.min} 小時`}）</small>
        </span>
        {editable && (
          <span className="labor-target-inputs">
            <label>
              下限
              <input type="number" min={1} step={0.5} value={current.min} onChange={(event) => setDraft({ ...current, min: event.target.value })} />
              {Number.isFinite(min) && min > 0 && <small>{percent(min)}</small>}
            </label>
            <label>
              上限
              <input type="number" min={1} step={0.5} max={normal} value={current.max} onChange={(event) => setDraft({ ...current, max: event.target.value })} />
              {Number.isFinite(max) && max > 0 && <small>{percent(max)}</small>}
            </label>
            <button className="button button-quiet" disabled={!valid} onClick={() => { onSave({ min, max }); setDraft(null); }}>
              儲存
            </button>
            {custom && (
              <button className="button button-quiet" onClick={() => { onSave(undefined); setDraft(null); }}>
                恢復預設
              </button>
            )}
          </span>
        )}
        {editable && !valid && <small className="month-status-warn">下限要小於等於上限，上限不能超過正常工時 {normal} 小時。</small>}
      </div>
      <div className="table-scroll">
        <table className="info-table labor-target-table">
          <thead>
            <tr><th scope="col">助理</th><th scope="col">上班（含機動）</th><th scope="col">機動</th><th scope="col">請假</th><th scope="col">合計</th><th scope="col">對照目標</th></tr>
          </thead>
          <tbody>
            {rows.map(({ person, summary }) => {
              const status = statusOf(summary.paidMinutes);
              const flex = entries.filter((entry) => entry.personId === person.id && entry.date.startsWith(month) && entry.note === FLEX_SHIFT_NOTE).length;
              return (
                <tr key={person.id}>
                  <th scope="row">{person.displayName}</th>
                  <td>{formatHours(summary.workedMinutes)}</td>
                  <td>{flex > 0 ? `${flex} 診` : "—"}</td>
                  <td>{summary.leaveMinutes > 0 ? formatHours(summary.leaveMinutes) : "—"}</td>
                  <td><strong>{formatHours(summary.paidMinutes)}</strong></td>
                  <td className={`labor-status ${status.tone}`}>{status.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="month-status-item">最多與最少差 {formatHours(spread)} 小時。</p>
    </details>
  );
}
