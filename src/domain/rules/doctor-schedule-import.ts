import { LIMITED_BOOKING_NOTE, type DoctorSession } from "@/config/doctors";
import { findEntries, shiftEntryId } from "../schedule";
import type { ScheduleEntry } from "../types";

/**
 * 把醫師看診表轉成排班資料：只回傳要新增的診，
 * 已排同一診或當天休假的醫師不會被覆蓋。
 */
export function planDoctorScheduleImport(
  entries: ScheduleEntry[],
  sessions: DoctorSession[],
  now = Date.now(),
): ScheduleEntry[] {
  return sessions.flatMap((session) =>
    session.doctors.flatMap(({ personId, limitedBooking }) => {
      const existing = findEntries(entries, session.date, personId);
      if (existing.some((entry) => entry.state === "leave" || entry.shiftId === session.shiftId)) {
        return [];
      }
      const entry: ScheduleEntry = {
        id: shiftEntryId(session.date, personId, session.shiftId),
        date: session.date,
        personId,
        state: "shift",
        shiftId: session.shiftId,
        updatedAt: now,
      };
      return [limitedBooking ? { ...entry, note: LIMITED_BOOKING_NOTE } : entry];
    }),
  );
}

/**
 * 重新載入醫師班表：清掉指定月份中與看診表不符的醫師班，再補上缺少的診。
 * 更新後一位醫師都沒有的診，排在那一診的助理也一起清掉（assistantRemoved 為其人次）。
 * 醫師與助理的休假不動；與看診表相同的診保持原樣。
 */
export function planDoctorScheduleReload(
  entries: ScheduleEntry[],
  sessions: DoctorSession[],
  months: string[],
  doctorIds: Set<string>,
  now = Date.now(),
): { remove: ScheduleEntry[]; add: ScheduleEntry[]; assistantRemoved: number } {
  const expected = new Map<string, string | undefined>();
  sessions.forEach((session) =>
    session.doctors.forEach(({ personId, limitedBooking }) =>
      expected.set(`${session.date}_${personId}_${session.shiftId}`, limitedBooking ? LIMITED_BOOKING_NOTE : undefined),
    ),
  );
  const remove = entries.filter((entry) => {
    if (entry.state !== "shift" || !doctorIds.has(entry.personId) || !months.includes(entry.date.slice(0, 7))) return false;
    const key = `${entry.date}_${entry.personId}_${entry.shiftId}`;
    return !expected.has(key) || expected.get(key) !== entry.note;
  });
  const removed = new Set(remove);
  const add = planDoctorScheduleImport(entries.filter((entry) => !removed.has(entry)), sessions, now);
  const staffed = new Set(
    [...entries.filter((entry) => !removed.has(entry)), ...add]
      .filter((entry) => entry.state === "shift" && doctorIds.has(entry.personId))
      .map((entry) => `${entry.date}_${entry.shiftId}`),
  );
  const orphaned = entries.filter(
    (entry) =>
      entry.state === "shift" &&
      !doctorIds.has(entry.personId) &&
      months.includes(entry.date.slice(0, 7)) &&
      !staffed.has(`${entry.date}_${entry.shiftId}`),
  );
  return { remove: [...remove, ...orphaned], add, assistantRemoved: orphaned.length };
}

export interface DoctorSyncMonth {
  month: string;
  remove: ScheduleEntry[];
  add: ScheduleEntry[];
  /** 會被一起移除的助理班（那一診已經沒有醫師）。 */
  assistantRemoved: number;
}

/**
 * 班表醫師班與醫師班表同步：逐月比對。
 * 不會動到助理班的月份放進 auto（自動套用）；會移除助理班的月份放進 blocked，等管理者按下才套用。
 */
export function planDoctorSync(
  entries: ScheduleEntry[],
  months: string[],
  sessionsOf: (month: string) => DoctorSession[] | undefined,
  doctorIds: Set<string>,
  now = Date.now(),
): { auto: { remove: ScheduleEntry[]; add: ScheduleEntry[] }; blocked: DoctorSyncMonth[] } {
  const auto = { remove: [] as ScheduleEntry[], add: [] as ScheduleEntry[] };
  const blocked: DoctorSyncMonth[] = [];
  // 先依月份分好，每個月只比對那個月的資料（資料多時才不會慢）。
  const byMonth = new Map<string, ScheduleEntry[]>();
  entries.forEach((entry) => {
    const month = entry.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entry]);
  });
  for (const month of months) {
    const sessions = sessionsOf(month);
    if (!sessions) continue;
    const plan = planDoctorScheduleReload(byMonth.get(month) ?? [], sessions, [month], doctorIds, now);
    if (plan.remove.length === 0 && plan.add.length === 0) continue;
    if (plan.assistantRemoved > 0) blocked.push({ month, ...plan });
    else {
      auto.remove.push(...plan.remove);
      auto.add.push(...plan.add);
    }
  }
  return { auto, blocked };
}
