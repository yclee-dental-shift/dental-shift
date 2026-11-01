import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "../types";
import { isLearnerEntry } from "./ability-schedule";

export interface StaffingRules {
  pediatricDoctorIds: string[];
  defaultFloors: Record<string, 1 | 2>;
  /** 依星期幾的樓層例外（0＝週日），優先於 defaultFloors。 */
  weekdayFloors?: Partial<Record<number, Record<string, 1 | 2>>>;
  /** 單日指定樓層（key 為 `日期_班別ID_醫師ID`），優先於所有樓層規則。 */
  sessionFloors?: Map<string, 1 | 2>;
}

export interface DemandBreakdown {
  doctorIds: string[];
  floors: { 1: string[]; 2: string[] };
  follow: number;
  floats: { 1: number; 2: number };
  counter: number;
  reserve: number;
  ruleTotal: number;
}

export interface SessionDemand extends DemandBreakdown {
  date: string;
  shiftId: string;
  shiftLabel: string;
  adjustment: number;
  total: number;
  scheduled: number;
}

/**
 * 依診所規則計算一診的助理需求：
 * 跟診每位醫師 1；有醫師的樓層流動 1（同層 3 位以上 2）；
 * 櫃檯 1 位醫師 1、2 位以上 2；有兒牙醫師再加預留 1。
 * 兒牙醫師在場時，兒牙醫師在 1 樓、其他醫師都到 2 樓。
 * 有日期時先看那天星期幾的樓層例外，再看預設樓層；有指定某天某一診的樓層時，以指定為準。
 */
export function computeDemand(doctorIds: string[], rules: StaffingRules, date?: string, shiftId?: string): DemandBreakdown {
  const pediatric = new Set(rules.pediatricDoctorIds);
  const hasPediatric = doctorIds.some((id) => pediatric.has(id));
  const weekdayFloors = date ? rules.weekdayFloors?.[new Date(`${date}T00:00:00Z`).getUTCDay()] : undefined;
  const assigned = (id: string) => (date && shiftId ? rules.sessionFloors?.get(`${date}_${shiftId}_${id}`) : undefined);
  const floorOf = (id: string): 1 | 2 =>
    assigned(id) ?? (hasPediatric ? (pediatric.has(id) ? 1 : 2) : weekdayFloors?.[id] ?? rules.defaultFloors[id] ?? 2);
  const floors = {
    1: doctorIds.filter((id) => floorOf(id) === 1),
    2: doctorIds.filter((id) => floorOf(id) === 2),
  };
  const floatFor = (count: number) => (count === 0 ? 0 : count >= 3 ? 2 : 1);
  const floats = { 1: floatFor(floors[1].length), 2: floatFor(floors[2].length) };
  const follow = doctorIds.length;
  const counter = doctorIds.length === 0 ? 0 : doctorIds.length === 1 ? 1 : 2;
  const reserve = hasPediatric ? 1 : 0;
  return {
    doctorIds,
    floors,
    follow,
    floats,
    counter,
    reserve,
    ruleTotal: follow + floats[1] + floats[2] + counter + reserve,
  };
}

export function sessionKey(date: string, shiftId: string): string {
  return `${date}_${shiftId}`;
}

/** 由配置表的實際人數算出每診手動調整值（配置表 − 規則）。 */
export function calibrationFromTable(
  sessions: Array<{ date: string; shiftId: string; assistantsNeeded?: number; doctors: Array<{ personId: string }> }>,
  rules: StaffingRules,
): Map<string, number> {
  return new Map(
    sessions.flatMap((session) =>
      session.assistantsNeeded === undefined
        ? []
        : [[
            sessionKey(session.date, session.shiftId),
            session.assistantsNeeded - computeDemand(session.doctors.map((doctor) => doctor.personId), rules, session.date, session.shiftId).ruleTotal,
          ] as const],
    ),
  );
}

/** 列出每個日期、每一診的需求與已排助理數；沒有醫師的診不列出。 */
export function evaluateSessionDemand(
  entries: ScheduleEntry[],
  people: CoursePerson[],
  dates: string[],
  shifts: ShiftDefinition[],
  rules: StaffingRules,
  adjustments: Map<string, number> = new Map(),
): SessionDemand[] {
  const roleOf = new Map(people.map((person) => [person.id, person.role]));
  return dates.flatMap((date) =>
    shifts.flatMap((shift) => {
      const sessionEntries = entries.filter(
        (entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shift.id,
      );
      const doctorIds = [
        ...new Set(sessionEntries.filter((entry) => roleOf.get(entry.personId) === "doctor").map((entry) => entry.personId)),
      ];
      if (doctorIds.length === 0) return [];
      const breakdown = computeDemand(doctorIds, rules, date, shift.id);
      const adjustment = adjustments.get(sessionKey(date, shift.id)) ?? 0;
      return [{
        ...breakdown,
        date,
        shiftId: shift.id,
        shiftLabel: shift.label,
        adjustment,
        total: Math.max(0, breakdown.ruleTotal + adjustment),
        // 帶新手 +1 不算進已排人數（見 `ability-schedule.ts`）。
        scheduled: sessionEntries.filter((entry) => roleOf.get(entry.personId) === "assistant" && !isLearnerEntry(entry)).length,
      }];
    }),
  );
}

export function describeDemand(demand: SessionDemand): string {
  const parts = [`跟診 ${demand.follow}`];
  if (demand.floats[1]) parts.push(`1F 流動 ${demand.floats[1]}`);
  if (demand.floats[2]) parts.push(`2F 流動 ${demand.floats[2]}`);
  parts.push(`櫃檯 ${demand.counter}`);
  if (demand.reserve) parts.push(`兒牙預留 ${demand.reserve}`);
  if (demand.adjustment) parts.push(`調整 ${demand.adjustment > 0 ? "+" : ""}${demand.adjustment}`);
  return parts.join("・");
}

/** 手動調整：key 為 sessionKey(date, shiftId)，值為在系統人數上加減幾人。 */
export type DemandAdjustments = Record<string, number>;

/**
 * 設定某一診的調整：調整後人數不會小於 0；調回 0（＝系統人數）就不保留這筆。
 * ruleTotal 是系統算的人數。
 */
export function setDemandAdjustment(
  adjustments: DemandAdjustments,
  key: string,
  adjustment: number,
  ruleTotal: number,
): DemandAdjustments {
  const rest = Object.fromEntries(Object.entries(adjustments).filter(([item]) => item !== key));
  const value = Math.max(-ruleTotal, Math.round(adjustment));
  return value === 0 ? rest : { ...rest, [key]: value };
}

export const adjustmentMap = (adjustments: DemandAdjustments) => new Map(Object.entries(adjustments));
