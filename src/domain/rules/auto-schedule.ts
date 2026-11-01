import { addDays, startOfWeek } from "../dates";
import { findEntries, shiftEntryId } from "../schedule";
import type { CoursePerson, ScheduleEntry, ShiftDefinition } from "../types";

function weekdayOf(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function shiftEntry(id: string, date: string, personId: string, shiftId: string, now: number): ScheduleEntry {
  return { id, date, personId, state: "shift", shiftId, updatedAt: now };
}

export interface AutoScheduleOptions {
  /** 這位助理加排這一診是否仍符合規定（例如工時、休息天數）。 */
  canAssign?: (personId: string, date: string, shiftId: string, entries: ScheduleEntry[]) => boolean;
  /** 目前的工作量（例如本月工時），數字小的優先排；未提供時用本次範圍內的診數。 */
  loadOf?: (personId: string, entries: ScheduleEntry[]) => number;
  /** 排班偏好；排不滿時會放寬，並把放寬次數記在 stats。 */
  preferences?: SchedulePreferences;
  stats?: RelaxStats;
  /** 助理登記「希望不排」的診；人不夠時才排入，次數記在 stats.requested。 */
  requestedOff?: (personId: string, date: string, shiftId: string) => boolean;
  /** 助理這一診請假（用假）：一律不排。 */
  leaveOff?: (personId: string, date: string, shiftId: string) => boolean;
  /** 不算進每診人數的班（帶新手 +1，見 `ability-schedule.ts`）。 */
  excludeFromDemand?: (entry: ScheduleEntry) => boolean;
  /**
   * 能力（第 5 階段）：排這個人能讓這一診多一位醫師有可獨立的人跟＝0，否則 1。
   * 比偏好更優先（不違反偏好但不會跟這位醫師的人，排在放寬偏好但會跟的人後面），但不會比「希望不排」優先。每排一人重算。
   */
  coverageOf?: (personId: string, date: string, shiftId: string, entries: ScheduleEntry[]) => number;
  /** 培訓目標：這個人這一診有要跟的醫師、還沒達到＝0，否則 1。只在同一層（偏好、放寬、希望不排）裡優先。 */
  trainingOf?: (personId: string, date: string, shiftId: string, entries: ScheduleEntry[]) => number;
}

export interface SchedulePreferences {
  avoidTripleShift: boolean;
  avoidConsecutiveTripleDays: boolean;
  maxConsecutiveEvenings: number;
  eveningShiftId: string;
  /** 兩頭班（例如早＋晚、中間空午）每人每週（週一起算）最多幾天；沒有＝不限。 */
  maxSplitDaysPerWeek?: number;
  /** 班別順序（早、午、晚），用來判斷兩頭班；沒有時不檢查每週上限。 */
  shiftOrder?: string[];
}

export interface RelaxStats {
  triple: number;
  consecutiveTriple: number;
  eveningStreak: number;
  /** 兩頭班超過每週上限的次數（舊呼叫端沒有）。 */
  splitWeek?: number;
  /** 排進「希望不排」的人次。 */
  requested?: number;
}

type Violation = "triple" | "consecutiveTriple" | "eveningStreak" | "splitWeek";

/** 一天的診（班別順序的位置）中間有空，例如早＋晚空午＝兩頭班。 */
export function isSplitDay(indices: number[]): boolean {
  const sorted = [...new Set(indices)].filter((index) => index >= 0).sort((a, b) => a - b);
  return sorted.some((index, position) => position > 0 && index - sorted[position - 1] > 1);
}

/** 某人有兩頭班的日子（可限定在 from～to，含頭尾）。 */
export function splitDaysOf(entries: ScheduleEntry[], personId: string, shiftOrder: string[], from = "", to = "9999"): string[] {
  const byDay = new Map<string, number[]>();
  entries.forEach((entry) => {
    if (entry.personId !== personId || entry.state !== "shift" || entry.date < from || entry.date > to) return;
    byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), shiftOrder.indexOf(entry.shiftId ?? "")]);
  });
  return [...byDay].filter(([, indices]) => isSplitDay(indices)).map(([date]) => date).sort();
}

const weekdayOfDate = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * 兩頭班要平均：排兩頭班時依序挑「前後一天不是兩頭班」→「這個月的兩頭班不在同一個星期幾」→「這個月兩頭班最少」的人。
 * 回傳的數字越小越優先；不是兩頭班時一律 [0, 0, 0]。
 */
function splitFairness(entries: ScheduleEntry[], personId: string, date: string, split: boolean, shiftOrder: string[] | undefined): number[] {
  if (!split || !shiftOrder) return [0, 0, 0];
  const month = date.slice(0, 7);
  const days = splitDaysOf(entries, personId, shiftOrder, `${month}-01`, `${month}-31`);
  const nextToAnother = days.includes(addDays(date, -1)) || days.includes(addDays(date, 1)) ? 1 : 0;
  const sameWeekday = days.some((day) => weekdayOfDate(day) === weekdayOfDate(date)) ? 1 : 0;
  return [nextToAnother, sameWeekday, days.length];
}

function shiftsOn(entries: ScheduleEntry[], personId: string, date: string): Set<string> {
  return new Set(
    entries
      .filter((entry) => entry.personId === personId && entry.date === date && entry.state === "shift")
      .map((entry) => entry.shiftId ?? ""),
  );
}

/** 加排這一診會違反哪些排班偏好（三診、連續兩天三診、連續晚診、兩頭班超過每週上限）。 */
function preferenceViolations(
  entries: ScheduleEntry[],
  personId: string,
  date: string,
  shiftId: string,
  prefs: SchedulePreferences | undefined,
): Violation[] {
  if (!prefs) return [];
  const found: Violation[] = [];
  const triple = shiftsOn(entries, personId, date).size + 1 >= 3;
  if (prefs.avoidTripleShift && triple) found.push("triple");
  if (
    prefs.avoidConsecutiveTripleDays &&
    triple &&
    (shiftsOn(entries, personId, addDays(date, -1)).size >= 3 || shiftsOn(entries, personId, addDays(date, 1)).size >= 3)
  ) {
    found.push("consecutiveTriple");
  }
  if (prefs.maxSplitDaysPerWeek !== undefined && prefs.shiftOrder) {
    const order = prefs.shiftOrder;
    const today = [...shiftsOn(entries, personId, date), shiftId].map((id) => order.indexOf(id));
    if (isSplitDay(today)) {
      const monday = startOfWeek(date);
      const others = splitDaysOf(entries, personId, order, monday, addDays(monday, 6)).filter((day) => day !== date);
      if (others.length + 1 > prefs.maxSplitDaysPerWeek) found.push("splitWeek");
    }
  }
  if (shiftId === prefs.eveningShiftId) {
    let streak = 1;
    for (let day = addDays(date, -1); shiftsOn(entries, personId, day).has(shiftId); day = addDays(day, -1)) streak += 1;
    for (let day = addDays(date, 1); shiftsOn(entries, personId, day).has(shiftId); day = addDays(day, 1)) streak += 1;
    if (streak > prefs.maxConsecutiveEvenings) found.push("eveningStreak");
  }
  return found;
}

/** 某人某月的三診天數與晚診次數。 */
export function countShiftPatterns(
  entries: ScheduleEntry[],
  personId: string,
  month: string,
  eveningShiftId: string,
): { tripleDays: number; evenings: number } {
  const byDay = new Map<string, number>();
  let evenings = 0;
  entries.forEach((entry) => {
    if (entry.personId !== personId || entry.state !== "shift" || !entry.date.startsWith(month)) return;
    byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + 1);
    if (entry.shiftId === eveningShiftId) evenings += 1;
  });
  return { tripleDays: [...byDay.values()].filter((count) => count >= 3).length, evenings };
}

/** 每一診需要的助理數：固定數字（有醫師的診才需要），或依當下排班計算的函式。 */
export type AssistantDemand = number | ((date: string, shiftId: string, entries: ScheduleEntry[]) => number);

function dayNumber(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * 產生排班草稿：只回傳要新增的班，不覆蓋任何已存在的資料（含休假）。
 * 醫師依 availability 固定班；助理依每診需求補齊，一天最多 maxShiftsPerDay 診。
 * 挑人順序：先排連續的班，兩頭班（早＋晚空午）要用時挑前後一天沒有兩頭班、不在同一個星期幾、這個月兩頭班最少的人
 * → 盡量不排第 3 診 → 接續前一診 → 工作量少者 → 每天輪替。兩頭班超過每週上限算放寬偏好。
 * 有提供 canAssign 時，不符合規定（例如超過正常工時）的人不會被排入。
 * 有提供 preferences 時，先排不違反偏好的人；排不滿才放寬，挑三診／晚診次數最少的人。
 * 有提供 requestedOff 時，登記「希望不排」的人最後才排（比放寬偏好更晚）。
 * 結果仍須人工確認。
 */
export function planAutoSchedule(
  entries: ScheduleEntry[],
  people: CoursePerson[],
  dates: string[],
  shifts: ShiftDefinition[],
  demand: AssistantDemand = 2,
  now = Date.now(),
  maxShiftsPerDay = 3,
  options: AutoScheduleOptions = {},
): ScheduleEntry[] {
  const doctors = people.filter((person) => person.role === "doctor");
  const assistants = people.filter((person) => person.role === "assistant");
  const doctorIds = new Set(doctors.map((doctor) => doctor.id));
  const assistantIds = new Set(assistants.map((assistant) => assistant.id));
  const shiftIndex = new Map(shifts.map((shift, index) => [shift.id, index]));
  const planned: ScheduleEntry[] = [];

  const datesInRange = new Set(dates);
  const weeklyCount = new Map(assistants.map((assistant) => [assistant.id, 0]));
  entries.forEach((entry) => {
    if (datesInRange.has(entry.date) && entry.state === "shift" && weeklyCount.has(entry.personId)) {
      weeklyCount.set(entry.personId, weeklyCount.get(entry.personId)! + 1);
    }
  });

  for (const date of dates) {
    const weekday = weekdayOf(date);

    for (const doctor of doctors) {
      const existing = findEntries(entries, date, doctor.id);
      if (existing.some((entry) => entry.state === "leave")) continue;
      for (const fixed of doctor.availability ?? []) {
        if (fixed.weekday !== weekday) continue;
        if (existing.some((entry) => entry.shiftId === fixed.shiftId)) continue;
        planned.push(shiftEntry(shiftEntryId(date, doctor.id, fixed.shiftId), date, doctor.id, fixed.shiftId, now));
      }
    }

    // 當天每位助理已排的診（休假者整天不排）。
    const onLeave = new Set<string>();
    const dayShifts = new Map(assistants.map((assistant) => [assistant.id, new Set<string>()]));
    entries.forEach((entry) => {
      if (entry.date !== date || !assistantIds.has(entry.personId)) return;
      if (entry.state === "leave") onLeave.add(entry.personId);
      else if (entry.shiftId) dayShifts.get(entry.personId)!.add(entry.shiftId);
    });

    const offset = dayNumber(date) % Math.max(1, assistants.length);
    const rotationOf = new Map(
      assistants.map((assistant, index) => [assistant.id, (index - offset + assistants.length) % assistants.length]),
    );

    for (const shift of shifts) {
      const current = [...entries, ...planned].filter(
        (entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shift.id,
      );
      if (!current.some((entry) => doctorIds.has(entry.personId))) continue;
      const target = typeof demand === "number" ? demand : demand(date, shift.id, [...entries, ...planned]);
      let need = target - current.filter((entry) => assistantIds.has(entry.personId) && !options.excludeFromDemand?.(entry)).length;
      if (need <= 0) continue;

      const index = shiftIndex.get(shift.id)!;
      const combined = [...entries, ...planned];
      const load = new Map(
        assistants.map((assistant) => [
          assistant.id,
          options.loadOf ? options.loadOf(assistant.id, combined) : weeklyCount.get(assistant.id)!,
        ]),
      );
      const score = (id: string) => {
        const worked = [...dayShifts.get(id)!].map((shiftId) => shiftIndex.get(shiftId) ?? -1);
        const split = worked.some((other) => Math.abs(other - index) > 1) && !worked.some((other) => Math.abs(other - index) === 1);
        return [
          split ? 1 : 0,
          worked.length >= 2 ? 1 : 0,
          worked.includes(index - 1) ? 0 : 1,
          load.get(id)!,
          rotationOf.get(id)!,
        ];
      };
      const prefs = options.preferences;
      const month = date.slice(0, 7);
      const splitRank = (id: string) => splitFairness(combined, id, date, score(id)[0] === 1, prefs?.shiftOrder);
      const violations = (id: string) => preferenceViolations(combined, id, date, shift.id, prefs);
      const patterns = new Map(
        assistants.map((assistant) => [
          assistant.id,
          prefs ? countShiftPatterns(combined, assistant.id, month, prefs.eveningShiftId) : { tripleDays: 0, evenings: 0 },
        ]),
      );
      const compare = (left: number[], right: number[]) => {
        const diff = left.findIndex((value, position) => value !== right[position]);
        return diff === -1 ? 0 : left[diff] - right[diff];
      };
      const fairness = (id: string) => (prefs && shift.id === prefs.eveningShiftId ? patterns.get(id)!.evenings : 0);
      // 往前看：排晚診先挑昨天沒上晚診（或連續天數少）的人，之後比較不會被迫排到連續第 3 天。
      const eveningRun = (id: string) => {
        if (!prefs || shift.id !== prefs.eveningShiftId) return 0;
        let run = 0;
        for (let day = addDays(date, -1); shiftsOn(combined, id, day).has(shift.id); day = addDays(day, -1)) run += 1;
        return run;
      };
      // 昨天三診的人今天優先少排，降低連續三診的機會。
      const tiredYesterday = (id: string) =>
        prefs?.avoidConsecutiveTripleDays && shiftsOn(combined, id, addDays(date, -1)).size >= 3 ? 1 : 0;

      const eligible = assistants
        .map((assistant) => assistant.id)
        .filter((id) => !onLeave.has(id) && !dayShifts.get(id)!.has(shift.id) && dayShifts.get(id)!.size < maxShiftsPerDay)
        .filter((id) => !options.leaveOff?.(id, date, shift.id))
        .filter((id) => !options.canAssign || options.canAssign(id, date, shift.id, combined))
        .map((id) => ({
          id,
          broken: violations(id),
          base: score(id),
          requested: options.requestedOff?.(id, date, shift.id) ?? false,
        }));
      const preferred = eligible
        .filter((candidate) => !candidate.requested && candidate.broken.length === 0)
        .sort((a, b) =>
          compare(
            [a.base[0], ...splitRank(a.id), a.base[1], a.base[2], eveningRun(a.id), tiredYesterday(a.id), fairness(a.id), ...a.base.slice(3)],
            [b.base[0], ...splitRank(b.id), b.base[1], b.base[2], eveningRun(b.id), tiredYesterday(b.id), fairness(b.id), ...b.base.slice(3)],
          ),
        );
      // 放寬時：違反項目少者優先，再挑三診天數、晚診次數最少的人。
      const relaxedCompare = (a: (typeof eligible)[number], b: (typeof eligible)[number]) =>
        compare(
          [a.broken.length, eveningRun(a.id), patterns.get(a.id)!.tripleDays, fairness(a.id), a.base[0], ...splitRank(a.id), ...a.base.slice(1)],
          [b.broken.length, eveningRun(b.id), patterns.get(b.id)!.tripleDays, fairness(b.id), b.base[0], ...splitRank(b.id), ...b.base.slice(1)],
        );
      const relaxed = eligible.filter((candidate) => !candidate.requested && candidate.broken.length > 0).sort(relaxedCompare);
      // 最後才排登記「希望不排」的人。
      const requested = eligible.filter((candidate) => candidate.requested).sort(relaxedCompare);

      // 能力、培訓目標：每排一人重算（已有人跟的醫師就不再加分）。沒有提供時照原本順序。
      const queue = [
        ...preferred.map((candidate) => ({ candidate, tier: 0 })),
        ...relaxed.map((candidate) => ({ candidate, tier: 1 })),
        ...requested.map((candidate) => ({ candidate, tier: 2 })),
      ];
      const nextCandidate = () => {
        if (!options.coverageOf && !options.trainingOf) return queue.shift();
        const list = [...entries, ...planned];
        const keyOf = ({ candidate, tier }: (typeof queue)[number]) => [
          tier === 2 ? 1 : 0,
          options.coverageOf?.(candidate.id, date, shift.id, list) ?? 0,
          tier,
          options.trainingOf?.(candidate.id, date, shift.id, list) ?? 0,
        ];
        let best = 0;
        queue.forEach((item, position) => {
          if (compare(keyOf(item), keyOf(queue[best])) < 0) best = position;
        });
        return queue.splice(best, 1)[0];
      };
      while (need > 0 && queue.length > 0) {
        const { candidate } = nextCandidate()!;
        const id = candidate.id;
        planned.push(shiftEntry(shiftEntryId(date, id, shift.id), date, id, shift.id, now));
        dayShifts.get(id)!.add(shift.id);
        weeklyCount.set(id, weeklyCount.get(id)! + 1);
        candidate.broken.forEach((kind) => {
          if (options.stats) options.stats[kind] = (options.stats[kind] ?? 0) + 1;
        });
        if (candidate.requested && options.stats) options.stats.requested = (options.stats.requested ?? 0) + 1;
        need -= 1;
      }
    }
  }

  return planned;
}

export interface HourTopUpOptions {
  /** 某人某月的目標工時（分鐘）；undefined＝這個月不補。 */
  targetOf: (personId: string, month: string) => { minMinutes: number; maxMinutes: number } | undefined;
  /** 某人某月目前的工時（上班＋請假，分鐘）。 */
  paidOf: (personId: string, month: string, entries: ScheduleEntry[]) => number;
  /** 加排這一診是否仍符合工時與休息規定；limitMinutes 是這次可到的上限。 */
  canAssign: (personId: string, date: string, shiftId: string, entries: ScheduleEntry[], limitMinutes: number) => boolean;
  preferences?: SchedulePreferences;
  requestedOff?: (personId: string, date: string, shiftId: string) => boolean;
  /** 加排的診寫在備註的字，例如「機動」。 */
  note: string;
  /** 補不到目標而放寬偏好（排三診、連續晚診）的次數。 */
  stats?: RelaxStats;
}

/** 用這些診長（分鐘）能不能湊出落在 [low, high] 的時數。 */
function makeReachable(lengths: number[]) {
  const memo = new Map<string, boolean>();
  const reachable = (low: number, high: number): boolean => {
    if (low <= 0) return high >= 0;
    if (high < 0) return false;
    const key = `${low}_${high}`;
    if (!memo.has(key)) memo.set(key, lengths.some((length) => reachable(low - length, high - length)));
    return memo.get(key)!;
  };
  return reachable;
}

/**
 * 補工時（一鍵排班第二輪）：診的需求補齊後，讓還沒到目標下限的助理加排「機動」，補到目標區間就停。
 * 每次挑離目標最遠的人，大家輪流加，工時會比較平均。
 * 只排有醫師看診的診；不排休假日、「希望不排」的診，也不超過工時與休息規定。
 * 挑診順序：不違反排班偏好 → 連續的班優先（兩頭班補不到才用，並挑前後一天沒有兩頭班、不在同一個星期幾、這個月兩頭班最少的）
 * → 接在當天已排的診前後（不多用休息日）→ 機動少的診與日子（平均分散）。
 * 大家都只剩兩頭班可排時，挑這個月兩頭班最少的人；兩頭班也補不到時，才放寬偏好（排三診等），並挑三診天數最少的人；次數記在 stats。
 */
export function planHourTopUp(
  entries: ScheduleEntry[],
  people: CoursePerson[],
  dates: string[],
  shifts: ShiftDefinition[],
  options: HourTopUpOptions,
  now = Date.now(),
  maxShiftsPerDay = 3,
): ScheduleEntry[] {
  const doctorIds = new Set(people.filter((person) => person.role === "doctor").map((person) => person.id));
  const assistants = people.filter((person) => person.role === "assistant").map((person) => person.id);
  const shiftIndex = new Map(shifts.map((shift, index) => [shift.id, index]));
  const shiftOrder = shifts.map((shift) => shift.id);
  const lengths = new Map(
    shifts.map((shift) => {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      return [shift.id, endHour * 60 + endMinute - (startHour * 60 + startMinute)];
    }),
  );
  const reachable = makeReachable([...new Set(lengths.values())].filter((length) => length > 0));
  const combined = [...entries];
  const planned: ScheduleEntry[] = [];
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
  const datesOf = new Map(months.map((month) => [month, dates.filter((date) => date.startsWith(month))]));

  const sessionKey = (date: string, shiftId: string) => `${date}_${shiftId}`;
  const doctorSessions = new Set<string>();
  const flexCount = new Map<string, number>();
  const flexPerDay = new Map<string, number>();
  const track = (entry: ScheduleEntry) => {
    if (entry.state !== "shift" || !entry.shiftId) return;
    const key = sessionKey(entry.date, entry.shiftId);
    if (doctorIds.has(entry.personId)) doctorSessions.add(key);
    if (entry.note === options.note && !doctorIds.has(entry.personId)) {
      flexCount.set(key, (flexCount.get(key) ?? 0) + 1);
      flexPerDay.set(entry.date, (flexPerDay.get(entry.date) ?? 0) + 1);
    }
  };
  entries.forEach(track);

  const bestSlot = (personId: string, month: string, paid: number, target: { minMinutes: number; maxMinutes: number }) => {
    let best: { date: string; shiftId: string; key: number[]; broken: Violation[]; split: boolean } | undefined;
    for (const date of datesOf.get(month) ?? []) {
      const day = combined.filter((entry) => entry.personId === personId && entry.date === date);
      if (day.some((entry) => entry.state === "leave")) continue;
      const worked = day.map((entry) => shiftIndex.get(entry.shiftId ?? "") ?? -1);
      if (worked.length >= maxShiftsPerDay) continue;
      for (const shift of shifts) {
        const index = shiftIndex.get(shift.id)!;
        const key = sessionKey(date, shift.id);
        if (worked.includes(index) || !doctorSessions.has(key)) continue;
        // 兩頭班（例如早＋晚空午）可以排，但排在連續的班後面。
        const split = isSplitDay([...worked, index]);
        if (options.requestedOff?.(personId, date, shift.id)) continue;
        const after = paid + (lengths.get(shift.id) ?? 0);
        if (after > target.maxMinutes) continue;
        if (after < target.minMinutes && !reachable(target.minMinutes - after, target.maxMinutes - after)) continue;
        if (!options.canAssign(personId, date, shift.id, combined, target.maxMinutes)) continue;
        const broken = preferenceViolations(combined, personId, date, shift.id, options.preferences);
        const rank = [
          broken.length,
          split ? 1 : 0,
          ...splitFairness(combined, personId, date, split, shiftOrder),
          worked.length === 0 ? 1 : 0,
          flexCount.get(key) ?? 0,
          after >= target.minMinutes ? 0 : 1,
          flexPerDay.get(date) ?? 0,
          worked.length,
        ];
        const diff = best ? rank.findIndex((value, position) => value !== best!.key[position]) : -1;
        if (!best || (diff !== -1 && rank[diff] < best.key[diff])) {
          best = { date, shiftId: shift.id, key: rank, broken, split };
        }
      }
    }
    return best;
  };

  const done = new Set<string>();
  for (;;) {
    const behind = months
      .flatMap((month) =>
        assistants.map((personId) => {
          const target = options.targetOf(personId, month);
          const paid = options.paidOf(personId, month, combined);
          return { personId, month, target, paid };
        }),
      )
      .filter((item) => item.target && item.paid < item.target.minMinutes && !done.has(`${item.personId}_${item.month}`))
      .sort((a, b) => a.paid - a.target!.minMinutes - (b.paid - b.target!.minMinutes));
    if (behind.length === 0) break;
    const slots = new Map<(typeof behind)[number], ReturnType<typeof bestSlot>>();
    const slotOf = (item: (typeof behind)[number]) => {
      if (!slots.has(item)) slots.set(item, bestSlot(item.personId, item.month, item.paid, item.target!));
      return slots.get(item);
    };
    const tripleDays = (item: (typeof behind)[number]) =>
      countShiftPatterns(combined, item.personId, item.month, options.preferences?.eveningShiftId ?? "").tripleDays;
    let next = behind[0];
    let slot = slotOf(next);
    if (!slot) {
      done.add(`${next.personId}_${next.month}`);
      continue;
    }
    const splitDays = (item: (typeof behind)[number]) =>
      splitDaysOf(combined, item.personId, shiftOrder, `${item.month}-01`, `${item.month}-31`).length;
    // 最落後的人只能排兩頭班或放寬偏好時，先看看有沒有其他落後的人可以排連續的班、或不用放寬。
    if (slot.broken.length > 0 || slot.split) {
      const contiguous = behind.find((item) => slotOf(item)?.broken.length === 0 && !slotOf(item)!.split);
      const splitOnly = behind
        .filter((item) => slotOf(item)?.broken.length === 0)
        .sort((a, b) => splitDays(a) - splitDays(b))[0];
      if (contiguous) {
        next = contiguous;
        slot = slotOf(contiguous)!;
      } else if (splitOnly) {
        // 大家都只剩兩頭班時，挑這個月兩頭班最少的人。
        next = splitOnly;
        slot = slotOf(splitOnly)!;
      } else {
        // 大家都只能放寬時，挑三診天數最少的人，三診才不會集中在同一人。
        const fewest = behind
          .filter((item) => slotOf(item))
          .sort((a, b) => slotOf(a)!.broken.length - slotOf(b)!.broken.length || tripleDays(a) - tripleDays(b))[0];
        next = fewest;
        slot = slotOf(fewest)!;
      }
    }
    slot.broken.forEach((kind) => {
      if (options.stats) options.stats[kind] = (options.stats[kind] ?? 0) + 1;
    });
    const entry: ScheduleEntry = {
      ...shiftEntry(shiftEntryId(slot.date, next.personId, slot.shiftId), slot.date, next.personId, slot.shiftId, now),
      note: options.note,
    };
    planned.push(entry);
    combined.push(entry);
    track(entry);
  }
  return planned;
}

/** 某人超過上限的連續晚診天數合計（例如上限 2、連續 3 天＝1）。 */
export function eveningStreakExcess(entries: ScheduleEntry[], personId: string, eveningShiftId: string, maxConsecutive: number): number {
  const days = [
    ...new Set(
      entries
        .filter((entry) => entry.personId === personId && entry.state === "shift" && entry.shiftId === eveningShiftId)
        .map((entry) => entry.date),
    ),
  ].sort();
  let excess = 0;
  let run = 0;
  days.forEach((date, index) => {
    run = index > 0 && addDays(days[index - 1], 1) === date ? run + 1 : 1;
    if (run > maxConsecutive) excess += 1;
  });
  return excess;
}

export interface StreakRepairOptions {
  assistantIds: Set<string>;
  eveningShiftId: string;
  maxConsecutiveEvenings: number;
  /** 這個人這一診不能排（希望不排、請假）。 */
  blocked?: (personId: string, date: string, shiftId: string) => boolean;
  /** 交換後還可以嗎（能力：配得到可獨立的人不能變少）；before／after＝整份班表。已記工作的班（指定安排、帶新手）一律不交換。 */
  canSwap?: (before: ScheduleEntry[], after: ScheduleEntry[], date: string, shiftIds: string[]) => boolean;
}

/**
 * 排完後打散連續晚診：同一天把「連續晚診那個人的晚診」和「另一位助理一樣長的診（例如午診 3:10）」交換，
 * 兩人工時、當天診數都不變。只交換這次新排的班（planned），已存在的班不動；
 * 不造成斷班（例如早＋晚空午）、不排到 blocked 的診，而且兩人的連續晚診合計一定變少才交換。
 */
export function breakEveningStreaks(
  entries: ScheduleEntry[],
  planned: ScheduleEntry[],
  shifts: ShiftDefinition[],
  options: StreakRepairOptions,
): ScheduleEntry[] {
  const { assistantIds, eveningShiftId, maxConsecutiveEvenings } = options;
  const index = new Map(shifts.map((shift, position) => [shift.id, position]));
  const lengthOf = new Map(
    shifts.map((shift) => {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      return [shift.id, endHour * 60 + endMinute - (startHour * 60 + startMinute)];
    }),
  );
  const swapShiftIds = shifts
    .filter((shift) => shift.id !== eveningShiftId && lengthOf.get(shift.id) === lengthOf.get(eveningShiftId))
    .map((shift) => shift.id);
  if (swapShiftIds.length === 0) return planned;

  let current = planned.map((entry) => ({ ...entry }));
  const all = () => [...entries, ...current];
  const excessOf = (list: ScheduleEntry[], personId: string) =>
    eveningStreakExcess(list, personId, eveningShiftId, maxConsecutiveEvenings);
  const split = (shiftIds: string[]) => {
    const order = shiftIds.map((id) => index.get(id) ?? -1).sort((a, b) => a - b);
    return order.some((value, position) => position > 0 && value - order[position - 1] > 1);
  };
  const dayOf = (list: ScheduleEntry[], personId: string, date: string) =>
    list.filter((entry) => entry.personId === personId && entry.date === date && entry.state === "shift").map((entry) => entry.shiftId!);

  // 每次交換都讓總超出天數變少，最多交換的次數有上限。
  for (let guard = 0; guard < 500; guard += 1) {
    const list = all();
    const offenders = [...assistantIds].filter((id) => excessOf(list, id) > 0);
    let swapped = false;
    for (const personId of offenders) {
      const evenings = current.filter((entry) => entry.personId === personId && entry.shiftId === eveningShiftId);
      for (const evening of evenings) {
        const mine = dayOf(list, personId, evening.date);
        for (const shiftId of swapShiftIds) {
          if (mine.includes(shiftId) || options.blocked?.(personId, evening.date, shiftId)) continue;
          const mineAfter = [...mine.filter((id) => id !== eveningShiftId), shiftId];
          if (split(mineAfter)) continue;
          const partners = current.filter(
            (entry) =>
              entry.date === evening.date &&
              entry.shiftId === shiftId &&
              entry.personId !== personId &&
              assistantIds.has(entry.personId),
          );
          for (const partner of partners) {
            if (evening.task || partner.task) continue;
            const theirs = dayOf(list, partner.personId, evening.date);
            if (theirs.includes(eveningShiftId) || options.blocked?.(partner.personId, evening.date, eveningShiftId)) continue;
            if (split([...theirs.filter((id) => id !== shiftId), eveningShiftId])) continue;
            const next = current.map((entry) =>
              entry === evening
                ? { ...entry, personId: partner.personId, id: shiftEntryId(entry.date, partner.personId, eveningShiftId) }
                : entry === partner
                  ? { ...entry, personId, id: shiftEntryId(entry.date, personId, shiftId) }
                  : entry,
            );
            const before = excessOf(list, personId) + excessOf(list, partner.personId);
            const nextAll = [...entries, ...next];
            if (excessOf(nextAll, personId) + excessOf(nextAll, partner.personId) >= before) continue;
            if (options.canSwap && !options.canSwap(list, nextAll, evening.date, [eveningShiftId, shiftId])) continue;
            current = next;
            swapped = true;
            break;
          }
          if (swapped) break;
        }
        if (swapped) break;
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }
  return current;
}

export interface SplitBalanceOptions extends StreakRepairOptions {
  /** 兩頭班每人每週最多幾天；沒有＝不限。 */
  maxSplitDaysPerWeek?: number;
}

/**
 * 排完後讓兩頭班變少、變平均：同一天把「兩頭班那個人的晚診」和「另一位助理一樣長的診（例如午診 3:10）」交換，
 * 兩人工時、當天每診人數都不變。只交換這次新排的班（planned），已存在的班不動；不排到 blocked 的診，連續晚診不會變多。
 * 交換後兩頭班合計變少就換；合計不變時，只有對方這個月的兩頭班比自己少 2 天以上、
 * 換過去不超過每週上限、也不和對方另一天兩頭班相連，才把兩頭班換給他。
 */
export function balanceSplitShifts(
  entries: ScheduleEntry[],
  planned: ScheduleEntry[],
  shifts: ShiftDefinition[],
  options: SplitBalanceOptions,
): ScheduleEntry[] {
  const { assistantIds, eveningShiftId, maxConsecutiveEvenings, maxSplitDaysPerWeek } = options;
  const order = shifts.map((shift) => shift.id);
  const lengthOf = new Map(
    shifts.map((shift) => {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      return [shift.id, endHour * 60 + endMinute - (startHour * 60 + startMinute)];
    }),
  );
  const swapShiftIds = order.filter((id) => id !== eveningShiftId && lengthOf.get(id) === lengthOf.get(eveningShiftId));
  if (swapShiftIds.length === 0) return planned;

  let current = planned.map((entry) => ({ ...entry }));
  const monthSplits = (list: ScheduleEntry[], personId: string, date: string) =>
    splitDaysOf(list, personId, order, `${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-31`);
  const weekSplits = (list: ScheduleEntry[], personId: string, date: string) =>
    splitDaysOf(list, personId, order, startOfWeek(date), addDays(startOfWeek(date), 6));
  const excessOf = (list: ScheduleEntry[], personId: string) =>
    eveningStreakExcess(list, personId, eveningShiftId, maxConsecutiveEvenings);
  const dayOf = (list: ScheduleEntry[], personId: string, date: string) =>
    list.filter((entry) => entry.personId === personId && entry.date === date && entry.state === "shift").map((entry) => entry.shiftId!);
  const isSplit = (shiftIds: string[]) => isSplitDay(shiftIds.map((id) => order.indexOf(id)));

  for (let guard = 0; guard < 500; guard += 1) {
    const list = [...entries, ...current];
    let swapped = false;
    // 兩頭班多的人先處理。
    const evenings = current
      .filter((entry) => entry.shiftId === eveningShiftId && assistantIds.has(entry.personId) && isSplit(dayOf(list, entry.personId, entry.date)))
      .sort((a, b) => monthSplits(list, b.personId, b.date).length - monthSplits(list, a.personId, a.date).length);
    for (const evening of evenings) {
      const personId = evening.personId;
      const mine = dayOf(list, personId, evening.date);
      for (const shiftId of swapShiftIds) {
        if (mine.includes(shiftId) || options.blocked?.(personId, evening.date, shiftId)) continue;
        if (isSplit([...mine.filter((id) => id !== eveningShiftId), shiftId])) continue;
        const partners = current.filter(
          (entry) => entry.date === evening.date && entry.shiftId === shiftId && entry.personId !== personId && assistantIds.has(entry.personId),
        );
        for (const partner of partners) {
          if (evening.task || partner.task) continue;
          const theirs = dayOf(list, partner.personId, evening.date);
          if (theirs.includes(eveningShiftId) || options.blocked?.(partner.personId, evening.date, eveningShiftId)) continue;
          const theirsSplit = isSplit([...theirs.filter((id) => id !== shiftId), eveningShiftId]);
          if (theirsSplit) {
            // 只是把兩頭班換給別人：對方要明顯比較少、不超過每週上限、不和他另一天兩頭班相連。
            const others = monthSplits(list, partner.personId, evening.date);
            if (others.length + 2 > monthSplits(list, personId, evening.date).length) continue;
            if (others.includes(addDays(evening.date, -1)) || others.includes(addDays(evening.date, 1))) continue;
            if (maxSplitDaysPerWeek !== undefined && weekSplits(list, partner.personId, evening.date).length + 1 > maxSplitDaysPerWeek) continue;
          }
          const next = current.map((entry) =>
            entry === evening
              ? { ...entry, personId: partner.personId, id: shiftEntryId(entry.date, partner.personId, eveningShiftId) }
              : entry === partner
                ? { ...entry, personId, id: shiftEntryId(entry.date, personId, shiftId) }
                : entry,
          );
          const nextAll = [...entries, ...next];
          if (excessOf(nextAll, personId) + excessOf(nextAll, partner.personId) > excessOf(list, personId) + excessOf(list, partner.personId)) continue;
          if (options.canSwap && !options.canSwap(list, nextAll, evening.date, [eveningShiftId, shiftId])) continue;
          current = next;
          swapped = true;
          break;
        }
        if (swapped) break;
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }
  return current;
}
