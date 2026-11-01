import type { DoctorSession } from "@/config/doctors";
import type { CoursePerson, ScheduleEntry } from "../types";
import { computeDemand, sessionKey, type StaffingRules } from "./assistant-demand";
import type { ShiftRequests } from "./shift-request";

/** ok 人力足夠；hot 熱門（再 1 人請假就不足或已剛好）；short 人數不足。 */
export type LeaveHeat = "ok" | "hot" | "short";

export interface SessionLeaveLoad {
  shiftId: string;
  /** 依醫師行事曆估算的助理需求。 */
  needed: number;
  /** 全部助理扣掉休假與指定不排後，可上班的人數。 */
  available: number;
  /** 當天休假的助理 ID（含排休與管理者排的休假）。 */
  onLeave: string[];
  /** 這一診登記「指定診次不排」的助理 ID。 */
  requestedOff: string[];
}

export interface DayLeaveLoad {
  date: string;
  heat: LeaveHeat;
  sessions: SessionLeaveLoad[];
}

/** 可上班人數比需求多幾人；負數表示不足。 */
export const margin = (session: SessionLeaveLoad) => session.available - session.needed;

export function heatOf(sessions: SessionLeaveLoad[]): LeaveHeat {
  if (sessions.length === 0) return "ok";
  const least = Math.min(...sessions.map(margin));
  return least < 0 ? "short" : least <= 1 ? "hot" : "ok";
}

/**
 * 排休熱門度：讓助理排休前知道這天人力是否吃緊，人數不足時自行與同事協調。
 * 需求依醫師行事曆（扣掉已排休假的醫師）估算，再加上推算人數的手動調整；每位助理都當作可上班，不考慮工時上限。
 */
export function evaluateLeaveLoad(
  entries: ScheduleEntry[],
  people: CoursePerson[],
  sessions: DoctorSession[],
  requests: ShiftRequests,
  rules: StaffingRules,
  adjustments: Map<string, number> = new Map(),
): DayLeaveLoad[] {
  const assistants = people.filter((person) => person.role === "assistant").map((person) => person.id);
  const assistantSet = new Set(assistants);
  const leaveKey = (date: string, personId: string) => `${date}_${personId}`;
  const leaves = new Set(
    entries.filter((entry) => entry.state === "leave").map((entry) => leaveKey(entry.date, entry.personId)),
  );
  const byDate = new Map<string, SessionLeaveLoad[]>();
  for (const session of sessions) {
    const doctorIds = session.doctors
      .map((doctor) => doctor.personId)
      .filter((id) => !leaves.has(leaveKey(session.date, id)));
    if (doctorIds.length === 0) continue;
    const onLeave = assistants.filter((id) => leaves.has(leaveKey(session.date, id)));
    const requestedOff = Object.values(requests)
      .filter(
        (request) =>
          request.date === session.date &&
          request.shiftId === session.shiftId &&
          assistantSet.has(request.personId) &&
          !onLeave.includes(request.personId),
      )
      .map((request) => request.personId);
    const load: SessionLeaveLoad = {
      shiftId: session.shiftId,
      needed: Math.max(0, computeDemand(doctorIds, rules, session.date, session.shiftId).ruleTotal + (adjustments.get(sessionKey(session.date, session.shiftId)) ?? 0)),
      available: assistants.length - onLeave.length - requestedOff.length,
      onLeave,
      requestedOff,
    };
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), load]);
  }
  return [...byDate].map(([date, loads]) => ({ date, heat: heatOf(loads), sessions: loads }));
}

/** 這個人若再整天排休，會讓哪幾診人數不足。 */
export function shortIfOff(day: DayLeaveLoad, personId: string): SessionLeaveLoad[] {
  return day.sessions.filter((session) => {
    const alreadyOff = session.onLeave.includes(personId) || session.requestedOff.includes(personId);
    return margin(session) - (alreadyOff ? 0 : 1) < 0;
  });
}
