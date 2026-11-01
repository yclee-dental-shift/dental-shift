"use client";

import { useState, useSyncExternalStore } from "react";
import { courseProfile } from "@/config/clinic.config";
import { ABILITY_TASKS } from "@/config/ability.config";
import { readTrainingPlans, saveTrainingPlan, subscribeTrainingPlans } from "@/data/training-store";
import { formatDay, nowString } from "@/domain/dates";
import { sessionDoctorIds, taskLabel, taskOptions } from "@/domain/rules/shift-task";
import { SHOW_WISH_IMPACT_TO_ASSISTANTS, targetWishImpact, type TargetWishImpact } from "@/domain/rules/training-wish";
import { useShiftRequests } from "./useShiftRequests";
import {
  ASSIGNMENT_STATUS_LABELS,
  TRAINING_PURPOSE_LABELS,
  TRAINING_PURPOSES,
  assignmentStatus,
  newTrainingId,
  targetProgress,
  type AssignmentStatus,
  type TrainingAssignment,
  type TrainingPlan,
  type TrainingPlans,
  type TrainingPurpose,
  type TrainingTarget,
} from "@/domain/rules/training";
import type { ScheduleEntry } from "@/domain/types";
import { HelpTip } from "./HelpTip";
import { StatusBadge, type Tone } from "./OwnerOverview";
import { ASSISTANTS, ASSISTANT_NAMES, fullMonthLabel, monthDates } from "./schedule-settings";

const EMPTY: TrainingPlans = {};
const nameOf = (id: string) => ASSISTANT_NAMES.get(id) ?? id;
const SHIFT_IDS = courseProfile.shifts.map((shift) => shift.id);
const shiftLabel = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;
const targetLabel = (task: string) => ABILITY_TASKS.find((item) => item.id === task)?.label ?? task;
const STATUS_TONE: Record<AssignmentStatus, Tone> = { done: "ok", otherTask: "warn", off: "alert", notScheduled: "alert" };
const PROGRESS_TONE = { ok: "ok", warn: "warn", bad: "alert" } as const;

export function useTrainingPlans(): TrainingPlans {
  return useSyncExternalStore(subscribeTrainingPlans, readTrainingPlans, () => EMPTY);
}

/** 這個月有幾項沒照排（指定安排沒照排＋目標沒達到）。 */
export function trainingIssueCount(plan: TrainingPlan | undefined, entries: ScheduleEntry[], month: string): number {
  if (!plan) return 0;
  return (
    plan.assignments.filter((item) => assignmentStatus(item, entries) !== "done").length +
    plan.targets.filter((target) => targetProgress(target, entries, month).short > 0).length
  );
}

/**
 * 每月培訓清單（能力排班第 4 階段，`docs/ability-plan.md` 第 2、3-3 節）：排班工作台第 5 步最上面（目標工時上面），可收合。
 * 指定安排（某人某天某診做什麼）與培訓目標（這個月跟某醫師最少幾診），旁邊直接算出班表上排了沒有、少幾診。
 * 能改：最高管理者、助理長、這個月的負責人（伺服器另外擋）。一鍵排班照這份排（`ability-schedule.ts`）。
 */
export function TrainingPanel({
  month,
  entries,
  editable,
  actorName,
}: {
  month: string;
  entries: ScheduleEntry[];
  editable: boolean;
  actorName: string;
}) {
  const plans = useTrainingPlans();
  const plan = plans[month];
  const assignments = [...(plan?.assignments ?? [])].sort((a, b) => a.date.localeCompare(b.date) || shiftOrder(a.shiftId) - shiftOrder(b.shiftId));
  const targets = plan?.targets ?? [];
  const issues = trainingIssueCount(plan, entries, month);
  const { requests } = useShiftRequests();
  const impactOf = (target: TrainingTarget) =>
    targetWishImpact(target, entries, requests, month, (date, shiftId) => sessionDoctorIds(entries, date, shiftId), SHIFT_IDS);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (next: Pick<TrainingPlan, "assignments" | "targets">) => {
    const empty = next.assignments.length === 0 && next.targets.length === 0;
    const ok = saveTrainingPlan(month, empty ? undefined : { month, at: nowString(), by: actorName, ...next });
    setError(ok ? null : "存不進去，請稍後再試。");
  };
  const base = { assignments: plan?.assignments ?? [], targets };

  return (
    <details className="training-panel" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>培訓清單</strong>
        <span className="training-summary">
          {plan ? `指定安排 ${assignments.length}・培訓目標 ${targets.length}` : "這個月還沒有"}
          {issues > 0 && <StatusBadge text={`${issues} 項沒照排`} tone="warn" />}
        </span>
        <HelpTip title="培訓清單" guide="training">
          <p>指定安排：某人、某天某一診、做什麼（一定要排）。培訓目標：這個月跟某位醫師（或流動、櫃台）最少幾診（排不下先顧每診人數）。</p>
          <p>右邊照班表上記的「工作」算有沒有排到；跟診與學習都算。一鍵排班會先排指定安排、優先排培訓目標；排不到的列在排完的訊息。</p>
        </HelpTip>
      </summary>
      {error && <p className="month-status-warn">{error}</p>}

      <h4>培訓目標</h4>
      {targets.length === 0 ? (
        <p className="month-status-item">還沒有培訓目標。</p>
      ) : (
        <div className="table-scroll">
          <table className="info-table training-table">
            <thead>
              <tr>
                <th>助理</th>
                <th>跟誰／做什麼</th>
                <th>最少</th>
                <th>已排</th>
                <th>結果</th>
                <th>希望不排</th>
                <th>沒排到的原因</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const progress = targetProgress(target, entries, month);
                return (
                  <tr key={target.id}>
                    <td>{nameOf(target.personId)}</td>
                    <td>{targetLabel(target.task)}</td>
                    <td>{target.main ? "為主" : `${target.minSessions} 診`}</td>
                    <td>{progress.done} 診</td>
                    <td>
                      {target.main ? (
                        <StatusBadge text={`佔上班 ${shareOf(progress)}`} tone="muted" />
                      ) : (
                        <StatusBadge text={progress.short ? `少 ${progress.short} 診` : "達到"} tone={PROGRESS_TONE[progress.tone]} />
                      )}
                    </td>
                    <td>
                      <WishCell impact={impactOf(target)} />
                    </td>
                    <td>
                      {editable ? (
                        <ReasonInput
                          value={target.reason ?? ""}
                          onSave={(reason) =>
                            save({ ...base, targets: targets.map((item) => (item.id === target.id ? withReason(item, reason) : item)) })
                          }
                        />
                      ) : (
                        target.reason || "—"
                      )}
                    </td>
                    {editable && (
                      <td>
                        <button className="button button-quiet button-small" onClick={() => save({ ...base, targets: targets.filter((item) => item.id !== target.id) })}>
                          刪除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable && <TargetForm onAdd={(target) => save({ ...base, targets: [...targets, target] })} />}

      <h4>指定安排</h4>
      {assignments.length === 0 ? (
        <p className="month-status-item">還沒有指定安排。</p>
      ) : (
        <div className="table-scroll">
          <table className="info-table training-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>助理</th>
                <th>做什麼</th>
                <th>目的</th>
                <th>班表上</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {assignments.map((item) => {
                const status = assignmentStatus(item, entries);
                return (
                  <tr key={item.id}>
                    <td>{formatDay(item.date)} {shiftLabel(item.shiftId)}</td>
                    <td>{nameOf(item.personId)}</td>
                    <td>{taskLabel(item.task)}</td>
                    <td>
                      {TRAINING_PURPOSE_LABELS[item.purpose]}
                      {item.note && <small className="training-note">{item.note}</small>}
                    </td>
                    <td>
                      <StatusBadge text={ASSIGNMENT_STATUS_LABELS[status]} tone={STATUS_TONE[status]} />
                    </td>
                    {editable && (
                      <td>
                        <button
                          className="button button-quiet button-small"
                          onClick={() => save({ ...base, assignments: base.assignments.filter((other) => other.id !== item.id) })}
                        >
                          刪除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <AssignmentForm month={month} entries={entries} onAdd={(item) => save({ ...base, assignments: [...base.assignments, item] })} />
      )}
      {plan && <p className="month-status-item training-meta">最後修改：{plan.by}・{plan.at.replace("T", " ").replace(/-/g, "/")}</p>}
    </details>
  );
}

const shiftOrder = (id: string) => courseProfile.shifts.findIndex((shift) => shift.id === id);

function withReason(target: TrainingTarget, reason: string): TrainingTarget {
  const next = { ...target };
  if (reason) next.reason = reason;
  else delete next.reason;
  return next;
}

/** 原因：打完離開欄位才存。 */
function ReasonInput({ value, onSave }: { value: string; onSave(value: string): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="training-reason"
      maxLength={200}
      placeholder="例如人力緊繃"
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== value) onSave(draft.trim());
        setDraft(null);
      }}
    />
  );
}

/** 培訓目標那位醫師的診，他希望不排了幾診；少的診數裡有幾診是因為希望不排（使用者 2026-10-31：負責人要看到原因）。 */
export function WishCell({ impact }: { impact: TargetWishImpact | null }) {
  if (!impact || impact.wished === 0) return <>—</>;
  const detail = `醫師這個月 ${impact.sessions} 診：排了 ${impact.done}、他希望不排 ${impact.wished}、請假或排休 ${impact.leave}`;
  return (
    <span title={detail}>
      {impact.wished} 診
      {impact.lostToWish > 0 && <StatusBadge text={`因此少 ${impact.lostToWish} 診`} tone="warn" />}
    </span>
  );
}

/** 「為主」的目標：這個月上班的診裡有幾成是這個崗位。 */
const shareOf = (progress: { done: number; worked: number }) => (progress.worked ? `${Math.round((progress.done / progress.worked) * 100)}%` : "—");

function TargetForm({ onAdd }: { onAdd(target: TrainingTarget): void }) {
  const [personId, setPersonId] = useState(ASSISTANTS[0]?.id ?? "");
  const [task, setTask] = useState(ABILITY_TASKS[0]?.id ?? "");
  // 最少幾診，或這個月以這個崗位為主（使用者 2026-10-31：照每個人的能力規劃）。
  const [kind, setKind] = useState<"min" | "main">("min");
  const [count, setCount] = useState("4");
  const minSessions = kind === "main" ? 0 : Number(count);
  const valid = !!personId && !!task && (kind === "main" || (Number.isInteger(minSessions) && minSessions >= 1 && minSessions <= 93));
  return (
    <div className="training-form">
      <label>
        助理
        <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
          {ASSISTANTS.map((person) => (
            <option key={person.id} value={person.id}>{person.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        跟誰／做什麼
        <select value={task} onChange={(event) => setTask(event.target.value)}>
          {ABILITY_TASKS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label>
        方式
        <select value={kind} onChange={(event) => setKind(event.target.value as "min" | "main")}>
          <option value="min">最少幾診</option>
          <option value="main">這個月為主</option>
        </select>
      </label>
      {kind === "min" && (
        <label>
          最少幾診
          <input type="number" inputMode="numeric" min={1} max={93} value={count} onChange={(event) => setCount(event.target.value)} />
        </label>
      )}
      <button
        className="button button-quiet"
        disabled={!valid}
        onClick={() => onAdd({ id: newTrainingId(), personId, task, minSessions, ...(kind === "main" ? { main: true } : {}) })}
      >
        新增目標
      </button>
    </div>
  );
}

function AssignmentForm({ month, entries, onAdd }: { month: string; entries: ScheduleEntry[]; onAdd(item: TrainingAssignment): void }) {
  const dates = monthDates(month);
  const [personId, setPersonId] = useState(ASSISTANTS[0]?.id ?? "");
  const [date, setDate] = useState(dates[0]);
  const [shiftId, setShiftId] = useState(courseProfile.shifts[0]?.id ?? "");
  const [task, setTask] = useState("");
  const [purpose, setPurpose] = useState<TrainingPurpose>("learn");
  const [note, setNote] = useState("");
  const doctorIds = sessionDoctorIds(entries, date, shiftId);
  const options = taskOptions(doctorIds);
  const chosen = options.some((option) => option.id === task) ? task : "";
  return (
    <div className="training-form">
      <label>
        助理
        <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
          {ASSISTANTS.map((person) => (
            <option key={person.id} value={person.id}>{person.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        日期
        <select value={date} onChange={(event) => setDate(event.target.value)}>
          {dates.map((day) => (
            <option key={day} value={day}>{formatDay(day)}</option>
          ))}
        </select>
      </label>
      <label>
        診
        <select value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
          {courseProfile.shifts.map((shift) => (
            <option key={shift.id} value={shift.id}>{shift.label}</option>
          ))}
        </select>
      </label>
      <label>
        做什麼
        <select value={chosen} onChange={(event) => setTask(event.target.value)}>
          <option value="">請選</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        目的
        <select value={purpose} onChange={(event) => setPurpose(event.target.value as TrainingPurpose)}>
          {TRAINING_PURPOSES.map((value) => (
            <option key={value} value={value}>{TRAINING_PURPOSE_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <label>
        備註
        <input maxLength={200} value={note} placeholder="選填" onChange={(event) => setNote(event.target.value)} />
      </label>
      <button
        className="button button-quiet"
        disabled={!personId || !chosen}
        onClick={() => {
          onAdd({ id: newTrainingId(), personId, date, shiftId, task: chosen, purpose, ...(note.trim() ? { note: note.trim() } : {}) });
          setNote("");
        }}
      >
        新增安排
      </button>
      {doctorIds.length === 0 && <small className="training-note">這一診沒有醫師看診，只能選流動、櫃台、預留。</small>}
    </div>
  );
}

/** 助理「我的能力」：這個月起所有月份自己的培訓清單（只能看；伺服器只給自己的）。 */
export function MyTrainingList({ personId, fromMonth, entries }: { personId: string; fromMonth: string; entries: ScheduleEntry[] }) {
  const plans = useTrainingPlans();
  const { requests } = useShiftRequests();
  const months = Object.keys(plans).filter((month) => month >= fromMonth).sort();
  const rows = months
    .map((month) => {
      const plan = plans[month];
      return {
        month,
        targets: plan?.targets.filter((item) => item.personId === personId) ?? [],
        assignments: plan?.assignments.filter((item) => item.personId === personId) ?? [],
      };
    })
    .filter((row) => row.targets.length > 0 || row.assignments.length > 0);
  return (
    <section className="info-card">
      <h2 className="help-line">
        我的培訓清單
        <HelpTip title="培訓清單">助理長每月排的培訓安排：指定哪天哪一診做什麼，以及這個月跟某位醫師（或櫃台、流動）最少幾診或以它為主。實際以公告的班表為準。</HelpTip>
      </h2>
      {rows.length === 0 ? (
        <p className="month-status-item">目前沒有培訓安排。</p>
      ) : (
        rows.map((row) => (
          <div key={row.month}>
            <h4>{fullMonthLabel(row.month)}</h4>
            <ul className="training-mine">
              {row.targets.map((target) => {
                const progress = targetProgress(target, entries, row.month);
                return (
                  <li key={target.id}>
                    {target.main
                      ? `這個月以${target.task.startsWith("doctor-") ? "跟" : ""}${targetLabel(target.task)}為主，目前排了 ${progress.done} 診`
                      : `${target.task.startsWith("doctor-") ? "跟" : ""}${targetLabel(target.task)}最少 ${target.minSessions} 診，目前排了 ${progress.done} 診`}
                    {(() => {
                      // 自己登記的希望不排剛好是這位醫師的診（使用者 2026-10-31：學習沒照規劃，助理自己也有責任）。
                      const impact = targetWishImpact(target, entries, requests, row.month, (date, shiftId) => sessionDoctorIds(entries, date, shiftId), SHIFT_IDS);
                      return SHOW_WISH_IMPACT_TO_ASSISTANTS && impact && impact.wished > 0 ? (
                        <small className="training-note">
                          希望不排 {impact.wished} 診{impact.lostToWish > 0 ? `，因此少 ${impact.lostToWish} 診` : ""}
                        </small>
                      ) : null;
                    })()}
                  </li>
                );
              })}
              {[...row.assignments]
                .sort((a, b) => a.date.localeCompare(b.date) || shiftOrder(a.shiftId) - shiftOrder(b.shiftId))
                .map((item) => (
                  <li key={item.id}>
                    {formatDay(item.date)} {shiftLabel(item.shiftId)}：{taskLabel(item.task)}・{TRAINING_PURPOSE_LABELS[item.purpose]}
                    {item.note && <small className="training-note">{item.note}</small>}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/**
 * 培訓執行紀錄（能力表頁，只給管理者；使用者 2026-10-31）：每個月每個「跟某醫師」的培訓目標排了幾診、
 * 那位醫師的診他希望不排了幾診、少的診數有幾診是因為希望不排。給診所負責人檢查學習沒照規劃的原因，績效、能力評估時也看這張。
 */
export function TrainingWishHistory({ entries }: { entries: ScheduleEntry[] }) {
  const plans = useTrainingPlans();
  const { requests } = useShiftRequests();
  const [onlyIssues, setOnlyIssues] = useState(true);
  const rows = Object.keys(plans)
    .sort()
    .reverse()
    .flatMap((month) =>
      (plans[month]?.targets ?? []).flatMap((target) => {
        const impact = targetWishImpact(target, entries, requests, month, (date, shiftId) => sessionDoctorIds(entries, date, shiftId), SHIFT_IDS);
        if (!impact) return [];
        if (onlyIssues && impact.wished === 0 && impact.short === 0) return [];
        return [{ month, target, impact }];
      }),
    );
  return (
    <section className="info-card">
      <h2 className="help-line">
        培訓執行紀錄
        <HelpTip title="培訓執行紀錄">
          每個月「跟某位醫師」的培訓目標：那位醫師看診幾診、排了幾診、他自己希望不排幾診、請假或排休幾診。
          「因希望不排少」＝少的診數裡，算在他自己希望不排頭上的部分。一鍵排班不會為了培訓蓋過希望不排，所以這張表看得出學習沒照規劃的原因。
        </HelpTip>
      </h2>
      <label className="task-toggle">
        <input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} />
        只看有希望不排或沒達到的
      </label>
      {rows.length === 0 ? (
        <p className="month-status-item">{onlyIssues ? "沒有因希望不排或沒達到的培訓目標。" : "還沒有培訓目標。"}</p>
      ) : (
        <div className="table-scroll">
          <table className="info-table training-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>助理</th>
                <th>跟誰</th>
                <th>目標</th>
                <th>醫師看診</th>
                <th>排了</th>
                <th>希望不排</th>
                <th>請假</th>
                <th>因希望不排少</th>
                <th>排班者寫的原因</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ month, target, impact }) => (
                <tr key={`${month}-${target.id}`}>
                  <td>{Number(month.slice(5))} 月</td>
                  <td>{nameOf(target.personId)}</td>
                  <td>{targetLabel(target.task)}</td>
                  <td>{target.main ? "為主" : `最少 ${target.minSessions}`}</td>
                  <td>{impact.sessions}</td>
                  <td>{impact.done}</td>
                  <td>{impact.wished || "—"}</td>
                  <td>{impact.leave || "—"}</td>
                  <td>{impact.lostToWish ? <StatusBadge text={`${impact.lostToWish} 診`} tone="warn" /> : "—"}</td>
                  <td>{target.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
