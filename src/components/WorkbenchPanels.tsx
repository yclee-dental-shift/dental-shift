"use client";

import { useState } from "react";
import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { formatDay } from "@/domain/dates";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { formatHours } from "@/domain/rules/labor-hours";
import type { LeaveApplications } from "@/domain/rules/leave-application";
import type { ShiftRequests } from "@/domain/rules/shift-request";
import { canPlace, monthLeaveRequests, sessionCandidates, type Availability } from "@/domain/rules/workbench";
import type { ScheduleEntry } from "@/domain/types";
import { StatusBadge, type Tone } from "./OwnerOverview";
import { ASSISTANT_IDS, ASSISTANT_NAMES, LABOR_SETTINGS } from "./schedule-settings";

const nameOf = (id: string) => ASSISTANT_NAMES.get(id) ?? id;
const shiftLabel = (id?: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? "";

const AVAILABILITY: Record<Availability, { text: string; tone: Tone }> = {
  available: { text: "可以排", tone: "ok" },
  wish: { text: "希望不排", tone: "warn" },
  applied: { text: "有排休申請（未排入）", tone: "warn" },
  overHours: { text: "會超過工時或休息規定", tone: "alert" },
  scheduled: { text: "已排這一診", tone: "muted" },
  leave: { text: "這天休", tone: "muted" },
  sessionLeave: { text: "這一診請假", tone: "muted" },
};

/**
 * 補人（未排人員）：上方列出本月缺人的診，點一診看每位助理能不能排，按「排入」直接排上。
 * 希望不排、有排休申請、超過工時只提醒不擋（手動排班不限制）；休假、請假、已排的不能按。
 */
export function AssignPanel({
  demands,
  entries,
  requests,
  applications,
  locked,
  onAssign,
}: {
  demands: SessionDemand[];
  entries: ScheduleEntry[];
  requests: ShiftRequests;
  applications: LeaveApplications;
  locked: boolean;
  onAssign(date: string, personId: string, shiftId: string): void;
}) {
  const placed = (demand: SessionDemand) =>
    entries.filter(
      (entry) =>
        entry.date === demand.date &&
        entry.shiftId === demand.shiftId &&
        entry.state === "shift" &&
        entry.note !== FLEX_SHIFT_NOTE &&
        ASSISTANT_NAMES.has(entry.personId),
    ).length;
  const short = demands.filter((demand) => placed(demand) < demand.total);
  const [picked, setPicked] = useState<{ date: string; shiftId: string } | null>(null);
  const current = demands.find((demand) => demand.date === picked?.date && demand.shiftId === picked.shiftId) ?? short[0];
  const candidates = current ? sessionCandidates(entries, ASSISTANT_IDS, current.date, current.shiftId, LABOR_SETTINGS, requests, applications) : [];
  const keyOf = (demand: SessionDemand) => `${demand.date}_${demand.shiftId}`;

  return (
    <section className="workbench-panel assign-panel print-only-hide" aria-label="補人">
      <h3>
        補人
        <small>{short.length > 0 ? `本月 ${short.length} 診缺人，點一診看誰可以排` : "本月每一診都已補齊；也可以選日期看其他診"}</small>
      </h3>
      {short.length > 0 && (
        <div className="assign-sessions">
          {short.map((demand) => (
            <button
              key={keyOf(demand)}
              className={`button button-quiet ${current && keyOf(current) === keyOf(demand) ? "is-active" : ""}`}
              aria-pressed={!!current && keyOf(current) === keyOf(demand)}
              onClick={() => setPicked({ date: demand.date, shiftId: demand.shiftId })}
            >
              {formatDay(demand.date)} {demand.shiftLabel}
              <small>缺 {demand.total - placed(demand)}</small>
            </button>
          ))}
        </div>
      )}
      <label className="assign-pick">
        選一診
        <select
          value={current ? keyOf(current) : ""}
          onChange={(event) => {
            const demand = demands.find((item) => keyOf(item) === event.target.value);
            if (demand) setPicked({ date: demand.date, shiftId: demand.shiftId });
          }}
        >
          {!current && <option value="">（這個月沒有醫師看診）</option>}
          {demands.map((demand) => (
            <option key={keyOf(demand)} value={keyOf(demand)}>
              {formatDay(demand.date)} {demand.shiftLabel}（{placed(demand)}／{demand.total}）
            </option>
          ))}
        </select>
      </label>
      {current && (
        <>
          <p className="assign-head">
            <strong>{formatDay(current.date)} {current.shiftLabel}</strong>
            <StatusBadge text={`已排 ${placed(current)}／需 ${current.total} 人`} tone={placed(current) < current.total ? "alert" : "ok"} />
            {locked && <StatusBadge text="已正式公告，鎖定中" tone="muted" />}
          </p>
          <ul className="assign-list">
            {candidates.map((candidate) => (
              <li key={candidate.personId} className={canPlace(candidate.status) ? undefined : "is-off"}>
                <strong>{nameOf(candidate.personId)}</strong>
                <small>本月 {formatHours(candidate.paidMinutes)} 小時</small>
                <StatusBadge {...AVAILABILITY[candidate.status]} />
                <button
                  className="button button-quiet"
                  disabled={locked || !canPlace(candidate.status)}
                  onClick={() => {
                    const warn =
                      candidate.status === "wish"
                        ? "助理希望這一診不排，"
                        : candidate.status === "applied"
                          ? "這天有排休申請（未排入），"
                          : candidate.status === "overHours"
                            ? "排了會超過工時或休息規定，"
                            : "";
                    if (warn && !window.confirm(`${nameOf(candidate.personId)}：${warn}確定要排入嗎？`)) return;
                    onAssign(current.date, candidate.personId, current.shiftId);
                  }}
                >
                  排入
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const REQUEST_STATUS: Record<"placed" | "rest" | "unplaced", { day: string; session: string; tone: Tone }> = {
  placed: { day: "已排入", session: "照申請不排", tone: "ok" },
  rest: { day: "改成休息（不扣假）", session: "改成休息（不扣假）", tone: "muted" },
  unplaced: { day: "未排入", session: "未排入（已排班）", tone: "alert" },
};

/** 排休申請清單：本月整天排休與指定診次請假，標已排入／未排入；不顯示假別與事由。點「查看」打開那一格。 */
export function LeaveRequestList({
  month,
  applications,
  requests,
  entries,
  onOpen,
}: {
  month: string;
  applications: LeaveApplications;
  requests: ShiftRequests;
  entries: ScheduleEntry[];
  onOpen(date: string, personId: string): void;
}) {
  const rows = monthLeaveRequests(applications, requests, entries, month);
  const unplaced = rows.filter((row) => row.status === "unplaced").length;
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 8);
  return (
    <section className="workbench-panel leave-request-panel print-only-hide" aria-label="排休申請">
      <h3>
        排休申請
        <small>
          本月 {rows.length} 筆{unplaced > 0 ? `，其中 ${unplaced} 筆未排入` : ""}（假別與事由請點「查看」）
        </small>
      </h3>
      {rows.length === 0 ? (
        <p className="pending-empty">本月還沒有排休申請。</p>
      ) : (
        <>
          <ul className="pending-list leave-request-list">
            {shown.map((row) => {
              const status = REQUEST_STATUS[row.status];
              return (
                <li key={`${row.date}_${row.personId}_${row.shiftId ?? ""}`}>
                  <div className="pending-main">
                    <strong>{formatDay(row.date)}・{nameOf(row.personId)}</strong>
                    <small>{row.shiftId ? `${shiftLabel(row.shiftId)}請假` : "整天排休"}</small>
                  </div>
                  <StatusBadge text={row.shiftId ? status.session : status.day} tone={status.tone} />
                  <button className="button button-quiet" onClick={() => onOpen(row.date, row.personId)}>查看</button>
                </li>
              );
            })}
          </ul>
          {rows.length > 8 && (
            <button className="button button-quiet month-list-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "收起" : `全部 ${rows.length} 筆`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
