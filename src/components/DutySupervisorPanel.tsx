"use client";

import { useState, useSyncExternalStore } from "react";
import { courseProfile } from "@/config/clinic.config";
import { readDutySupervisors, saveDutySupervisors, subscribeDutySupervisors } from "@/data/duty-supervisor-store";
import { formatDay, nowString } from "@/domain/dates";
import {
  sessionKey,
  sessionStaff,
  supervisorIssues,
  supervisorOf,
  type DutySupervisorMap,
} from "@/domain/rules/duty-supervisor";
import type { ScheduleEntry } from "@/domain/types";
import { HelpTip } from "./HelpTip";
import { StatusBadge } from "./OwnerOverview";
import { ASSISTANT_IDS, ASSISTANT_NAMES } from "./schedule-settings";

const EMPTY: DutySupervisorMap = {};
const SHIFT_IDS = courseProfile.shifts.map((shift) => shift.id);
const DOCTOR_SET = new Set(courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id));
const ASSISTANT_SET = new Set(ASSISTANT_IDS);
const nameOf = (id: string) => ASSISTANT_NAMES.get(id) ?? id;
const shiftLabel = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;

export function useDutySupervisors(): DutySupervisorMap {
  return useSyncExternalStore(subscribeDutySupervisors, readDutySupervisors, () => EMPTY);
}

/** 這個月要處理的值班主管（沒有主管、指定的人沒上班）；總覽與送檢查前用。 */
export function monthSupervisorIssues(entries: ScheduleEntry[], month: string, map: DutySupervisorMap) {
  return supervisorIssues(entries, month, SHIFT_IDS, map[month]?.picks, DOCTOR_SET, ASSISTANT_SET);
}

/**
 * 值班主管：工作台第 5 步（排班）與之後的步驟。
 * 自動帶出那一診上班的助理長或組長；沒有的診由排班負責人指定一位。送行政檢查前每一診都要有主管；公告後還可以改。
 */
export function DutySupervisorPanel({
  month,
  entries,
  editable,
  actorName,
  id,
  collapsible = false,
}: {
  month: string;
  entries: ScheduleEntry[];
  editable: boolean;
  actorName: string;
  id?: string;
  /** true＝收成一行（排班那一步，使用者 2026-10-30），點開才看到每一診。 */
  collapsible?: boolean;
}) {
  const map = useDutySupervisors();
  const picks = map[month]?.picks ?? {};
  const issues = monthSupervisorIssues(entries, month, map);
  const missing = issues.filter((issue) => issue.reason === "none");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessions = [
    ...new Set(
      entries
        .filter((entry) => entry.date.startsWith(month) && entry.state === "shift" && entry.shiftId && DOCTOR_SET.has(entry.personId))
        .map((entry) => sessionKey(entry.date, entry.shiftId!)),
    ),
  ]
    .filter((key) => {
      const [date, shiftId] = key.split("|");
      return sessionStaff(entries, date, shiftId, ASSISTANT_SET).length > 0;
    })
    .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)) || SHIFT_IDS.indexOf(a.slice(11)) - SHIFT_IDS.indexOf(b.slice(11)));

  const setPick = (date: string, shiftId: string, personId: string) => {
    const next = { ...picks };
    if (personId) next[sessionKey(date, shiftId)] = personId;
    else delete next[sessionKey(date, shiftId)];
    const ok = saveDutySupervisors(month, Object.keys(next).length ? { month, at: nowString(), by: actorName, picks: next } : undefined);
    setError(ok ? null : "存不進去，請稍後再試。");
  };

  const row = (key: string) => {
    const [date, shiftId] = key.split("|");
    const staff = sessionStaff(entries, date, shiftId, ASSISTANT_SET);
    const current = supervisorOf(entries, date, shiftId, picks, ASSISTANT_SET);
    const issue = issues.find((item) => item.date === date && item.shiftId === shiftId);
    return (
      <tr key={key}>
        <td>{formatDay(date)} {shiftLabel(shiftId)}</td>
        <td>
          {editable ? (
            <select
              aria-label={`${formatDay(date)} ${shiftLabel(shiftId)}的值班主管`}
              value={current.source === "pick" ? current.personId! : ""}
              onChange={(event) => setPick(date, shiftId, event.target.value)}
            >
              <option value="">{current.source === "auto" ? `自動：${nameOf(current.personId!)}` : "請指定"}</option>
              {staff.map((personId) => (
                <option key={personId} value={personId}>{nameOf(personId)}</option>
              ))}
            </select>
          ) : current.personId ? (
            `${nameOf(current.personId)}${current.source === "auto" ? "（自動）" : ""}`
          ) : (
            "—"
          )}
        </td>
        <td>
          {issue?.reason === "none" ? (
            <StatusBadge text="沒有主管" tone="alert" />
          ) : issue?.reason === "pickAway" ? (
            <StatusBadge text={`${nameOf(issue.pickAway!)} 沒上班，改由自動`} tone="warn" />
          ) : (
            <StatusBadge text={current.source === "pick" ? "指定" : "自動"} tone="ok" />
          )}
        </td>
      </tr>
    );
  };

  const shown = showAll ? sessions : sessions.filter((key) => issues.some((issue) => sessionKey(issue.date, issue.shiftId) === key));

  const head = (
    <>
      <strong>值班主管</strong>
      {sessions.length === 0 ? (
        <span className="month-status-item">還沒有排助理的診。</span>
      ) : issues.length === 0 ? (
        <StatusBadge text={`${sessions.length} 診都有主管`} tone="ok" />
      ) : (
        <>
          {missing.length > 0 && <StatusBadge text={`${missing.length} 診沒有主管`} tone="alert" />}
          {issues.length > missing.length && <StatusBadge text={`${issues.length - missing.length} 診指定的人沒上班`} tone="warn" />}
        </>
      )}
      <HelpTip title="值班主管" guide="duty-supervisor">
        <p>自動帶出那一診上班的助理長，沒有再找組長；沒有的診，請從那一診上班的人裡指定一位。</p>
        <p>送行政專員檢查前，每一診都要有主管。公告後還可以改，例如主管臨時請假。</p>
      </HelpTip>
    </>
  );
  const body = (
    <>
      {error && <p className="month-status-warn">{error}</p>}
      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="info-table training-table">
            <thead>
              <tr>
                <th>診</th>
                <th>值班主管</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>{shown.map(row)}</tbody>
          </table>
        </div>
      )}
      {sessions.length > 0 && (
        <button className="button button-quiet button-small" data-view-control onClick={() => setShowAll(!showAll)}>
          {showAll ? "只看要處理的" : `看全部 ${sessions.length} 診`}
        </button>
      )}
    </>
  );

  return collapsible ? (
    <details className="duty-panel tool-details" id={id}>
      <summary className="help-line">{head}</summary>
      {body}
    </details>
  ) : (
    <section className="duty-panel" id={id}>
      <p className="help-line">{head}</p>
      {body}
    </section>
  );
}
