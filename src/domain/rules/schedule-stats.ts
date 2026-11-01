import { addDays } from "../dates";
import { splitDaysOf } from "./auto-schedule";
import type { ScheduleEntry, ShiftDefinition } from "../types";
import { summarizeMonth, type LaborSettings } from "./labor-hours";
import { isPreLeave, preLeaveType } from "./leave-window";
import { shiftRequestKey, type ShiftRequests } from "./shift-request";

/**
 * 排班統計（排班完檢查是否平均）：每位助理的早午晚診數與時數、機動、請假、總時數、
 * 三診天數、兩頭班天數、晚診次數、最長連續晚診、週六次數（本月與今年 1 月起累計）。
 * 只看班表上真正排的班；排休改成休息日的不算請假。
 */
export interface CountMinutes {
  count: number;
  minutes: number;
}

export interface PersonScheduleStats {
  personId: string;
  /** 跟診（不含機動），依班別 ID。 */
  sessions: Record<string, CountMinutes>;
  clinical: CountMinutes;
  /** 補工時加排的機動（行政）。 */
  flex: CountMinutes;
  /** 特休：整天排休算天、指定診次請假算診。 */
  annualLeave: CountMinutes;
  /** 其他假別。 */
  otherLeave: CountMinutes;
  /** 上班＋請假（與工時欄相同）。 */
  totalMinutes: number;
  tripleDays: number;
  /** 兩頭班（早＋晚、中間空午）的天數。 */
  splitDays: number;
  evenings: number;
  maxEveningStreak: number;
  saturdays: number;
  /** 今年 1 月到這個月的週六次數。 */
  saturdaysYear: number;
}

export type StatKey =
  | `session:${string}`
  | "tripleDays"
  | "splitDays"
  | "evenings"
  | "maxEveningStreak"
  | "saturdaysYear"
  | "totalMinutes";

export interface StatsThresholds {
  /** 診數、三診天數、兩頭班天數、晚診次數比平均多幾次以上標橘色。 */
  countAboveAverage: number;
  /** 週六今年累計比平均多幾次以上標橘色。 */
  saturdayAboveAverage: number;
}

export const DEFAULT_STATS_THRESHOLDS: StatsThresholds = { countAboveAverage: 2, saturdayAboveAverage: 1 };

const ANNUAL_LEAVE = "特休";
const isSaturday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 6;

function minutesOfShifts(shifts: ShiftDefinition[]): Map<string, number> {
  return new Map(
    shifts.map((shift) => {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      return [shift.id, endHour * 60 + endMinute - (startHour * 60 + startMinute)];
    }),
  );
}

/** 某人某月有上班的週六天數。 */
function saturdaysWorked(entries: ScheduleEntry[], personId: string, month: string): number {
  return new Set(
    entries
      .filter((entry) => entry.personId === personId && entry.state === "shift" && entry.date.startsWith(month) && isSaturday(entry.date))
      .map((entry) => entry.date),
  ).size;
}

export function personScheduleStats(
  entries: ScheduleEntry[],
  personId: string,
  month: string,
  settings: LaborSettings,
  options: { requests?: ShiftRequests; flexNote: string; eveningShiftId: string },
): PersonScheduleStats {
  const minutesOf = minutesOfShifts(settings.shifts);
  const own = entries.filter((entry) => entry.personId === personId && entry.date.startsWith(month));
  const shifts = own.filter((entry) => entry.state === "shift" && entry.shiftId);
  const sessions: Record<string, CountMinutes> = Object.fromEntries(settings.shifts.map((shift) => [shift.id, { count: 0, minutes: 0 }]));
  const clinical = { count: 0, minutes: 0 };
  const flex = { count: 0, minutes: 0 };
  const perDay = new Map<string, Set<string>>();
  shifts.forEach((entry) => {
    const minutes = minutesOf.get(entry.shiftId!) ?? 0;
    perDay.set(entry.date, (perDay.get(entry.date) ?? new Set()).add(entry.shiftId!));
    const bucket = entry.note === options.flexNote ? flex : clinical;
    bucket.count += 1;
    bucket.minutes += minutes;
    if (entry.note !== options.flexNote && sessions[entry.shiftId!]) {
      sessions[entry.shiftId!].count += 1;
      sessions[entry.shiftId!].minutes += minutes;
    }
  });

  const annualLeave = { count: 0, minutes: 0 };
  const otherLeave = { count: 0, minutes: 0 };
  const addLeave = (type: string, minutes: number) => {
    const bucket = type === ANNUAL_LEAVE ? annualLeave : otherLeave;
    bucket.count += 1;
    bucket.minutes += minutes;
  };
  own.filter(isPreLeave).forEach((entry) => addLeave(preLeaveType(entry)!, settings.leaveHoursPerDay * 60));
  const scheduled = new Set(shifts.map((entry) => shiftRequestKey(entry.date, personId, entry.shiftId!)));
  Object.values(options.requests ?? {})
    .filter(
      (request) =>
        request.personId === personId &&
        request.date.startsWith(month) &&
        request.leaveType &&
        !request.restInstead &&
        !scheduled.has(shiftRequestKey(request.date, personId, request.shiftId)),
    )
    .forEach((request) => addLeave(request.leaveType!, minutesOf.get(request.shiftId) ?? 0));

  const eveningDays = [...perDay].filter(([, ids]) => ids.has(options.eveningShiftId)).map(([date]) => date).sort();
  let maxEveningStreak = 0;
  let streak = 0;
  eveningDays.forEach((date, index) => {
    streak = index > 0 && addDays(eveningDays[index - 1], 1) === date ? streak + 1 : 1;
    maxEveningStreak = Math.max(maxEveningStreak, streak);
  });

  const year = month.slice(0, 4);
  let saturdaysYear = 0;
  for (let value = 1; value <= Number(month.slice(5, 7)); value += 1) {
    saturdaysYear += saturdaysWorked(entries, personId, `${year}-${String(value).padStart(2, "0")}`);
  }

  return {
    personId,
    sessions,
    clinical,
    flex,
    annualLeave,
    otherLeave,
    totalMinutes: summarizeMonth(entries, personId, month, settings, options.requests).paidMinutes,
    tripleDays: [...perDay.values()].filter((ids) => ids.size >= 3).length,
    splitDays: splitDaysOf(shifts, personId, settings.shifts.map((shift) => shift.id)).length,
    evenings: eveningDays.length,
    maxEveningStreak,
    saturdays: saturdaysWorked(entries, personId, month),
    saturdaysYear,
  };
}

/** 平均只算這個月有排班的人（整月請長假的人不拉低平均）。 */
export function statsAverage(rows: PersonScheduleStats[], shiftIds: string[]) {
  const active = rows.filter((row) => row.clinical.count + row.flex.count > 0);
  const average = (pick: (row: PersonScheduleStats) => number) =>
    active.length === 0 ? 0 : active.reduce((sum, row) => sum + pick(row), 0) / active.length;
  return {
    count: active.length,
    sessions: Object.fromEntries(
      shiftIds.map((id) => [id, { count: average((row) => row.sessions[id]?.count ?? 0), minutes: average((row) => row.sessions[id]?.minutes ?? 0) }]),
    ) as Record<string, CountMinutes>,
    clinicalMinutes: average((row) => row.clinical.minutes),
    flexMinutes: average((row) => row.flex.minutes),
    totalMinutes: average((row) => row.totalMinutes),
    tripleDays: average((row) => row.tripleDays),
    splitDays: average((row) => row.splitDays),
    evenings: average((row) => row.evenings),
    maxEveningStreak: average((row) => row.maxEveningStreak),
    saturdays: average((row) => row.saturdays),
    saturdaysYear: average((row) => row.saturdaysYear),
  };
}

export type StatsAverage = ReturnType<typeof statsAverage>;

/** 異常：warn＝比平均多很多（橘）；alert＝超過規定（紅）。 */
export function statsFlags(
  row: PersonScheduleStats,
  average: StatsAverage,
  options: {
    thresholds?: StatsThresholds;
    maxConsecutiveEvenings: number;
    target?: { minMinutes: number; maxMinutes: number };
  },
): Map<StatKey, "warn" | "alert"> {
  const { countAboveAverage, saturdayAboveAverage } = options.thresholds ?? DEFAULT_STATS_THRESHOLDS;
  const flags = new Map<StatKey, "warn" | "alert">();
  if (average.count === 0 || row.clinical.count + row.flex.count === 0) return flags;
  Object.entries(row.sessions).forEach(([id, value]) => {
    if (value.count >= (average.sessions[id]?.count ?? 0) + countAboveAverage) flags.set(`session:${id}`, "warn");
  });
  if (row.tripleDays > 0 && row.tripleDays >= average.tripleDays + countAboveAverage) flags.set("tripleDays", "warn");
  if (row.splitDays > 0 && row.splitDays >= average.splitDays + countAboveAverage) flags.set("splitDays", "warn");
  if (row.evenings >= average.evenings + countAboveAverage) flags.set("evenings", "warn");
  if (row.maxEveningStreak > options.maxConsecutiveEvenings) flags.set("maxEveningStreak", "alert");
  if (row.saturdaysYear > 0 && row.saturdaysYear >= average.saturdaysYear + saturdayAboveAverage) flags.set("saturdaysYear", "warn");
  if (options.target && (row.totalMinutes < options.target.minMinutes || row.totalMinutes > options.target.maxMinutes)) {
    flags.set("totalMinutes", "alert");
  }
  return flags;
}
