import { LIMITED_BOOKING_RULES, SESSION_EXCLUSION_RULES, type ClinicClosure, type DoctorSession } from "@/config/doctors";

/**
 * 醫師班表（可在「醫師班表」頁查看、之後可編輯）：
 * 每週固定班（可分版本、從某月起生效）＋專科醫師來診日（也用來臨時加開）＋休診日。
 * 依這份資料產生每月醫師診次，給班表醫師班自動同步、診所看診／休診列與助理排休日曆使用。
 */
export const SHIFT_KEYS = ["morning", "afternoon", "evening"] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

export interface DoctorSlot {
  personId: string;
  /** 有看診但不開放一般約診。 */
  limited: boolean;
  /** 單日指定樓層（優先於樓層規則）；沒有＝依規則。舊資料沒有這個欄位。 */
  floor?: 1 | 2;
}

export type SessionSlots = Partial<Record<ShiftKey, DoctorSlot[]>>;
/** 1＝週一 … 6＝週六（週日不放固定班）。 */
export type WeeklySlots = Partial<Record<number, SessionSlots>>;

export interface WeeklyVersion {
  /** 從這個月（YYYY-MM）起生效，直到下一個版本。 */
  from: string;
  slots: WeeklySlots;
}

export interface ClinicVisit {
  id: string;
  label: string;
  /** YYYY-MM-DD。 */
  dates: string[];
  sessions: SessionSlots;
}

/** 單日調整：某天某一診實際看診的醫師，優先於固定班與來診日（空陣列＝那一診不看）。 */
export interface DayOverride {
  date: string;
  shiftId: ShiftKey;
  slots: DoctorSlot[];
}

export interface DoctorScheduleConfig {
  version: 1;
  /** 行事曆設定的範圍；範圍外的月份不產生診次（不限制排班、不能載入）。 */
  firstMonth: string;
  lastMonth: string;
  weekly: WeeklyVersion[];
  visits: ClinicVisit[];
  closures: ClinicClosure[];
  /** 舊資料沒有這個欄位，視為沒有單日調整。 */
  overrides?: DayOverride[];
}

export const WEEKDAY_LABELS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

/** 某月適用的固定班版本：生效月份不晚於該月的最後一個版本。 */
export function weeklyVersionFor(config: DoctorScheduleConfig, month: string): WeeklyVersion | undefined {
  return [...config.weekly].sort((a, b) => a.from.localeCompare(b.from)).filter((version) => version.from <= month).pop();
}

export function isCalendarMonth(config: DoctorScheduleConfig, month: string): boolean {
  return month >= config.firstMonth && month <= config.lastMonth;
}

function daysOf(month: string): string[] {
  const [year, value] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

/**
 * 某天某一診「沒有單日調整時」的醫師：週日沒有固定班，只有來診日上的醫師；再套用自動不排規則。
 * 同一診同一位醫師只算一次（以先出現的「不開放一般約診」標示為準）。不看休診日。
 */
/** 固定班＋來診日（去重），還沒套用自動規則。 */
function rawSlotsFor(config: DoctorScheduleConfig, date: string, shiftId: ShiftKey): DoctorSlot[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekly = weeklyVersionFor(config, date.slice(0, 7))?.slots ?? {};
  const visits = config.visits.filter((visit) => visit.dates.includes(date));
  const slots = [...(weekday === 0 ? [] : weekly[weekday]?.[shiftId] ?? []), ...visits.flatMap((visit) => visit.sessions[shiftId] ?? [])];
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.personId)) return false;
    seen.add(slot.personId);
    return true;
  });
}

export function baseSlotsFor(config: DoctorScheduleConfig, date: string, shiftId: ShiftKey): DoctorSlot[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const unique = rawSlotsFor(config, date, shiftId);
  // 不開放一般約診規則看「當天」有哪些醫師（例如週五有兒牙口外時，陳美玲早診開放、午晚不開放）。
  const dayDoctors = new Set(SHIFT_KEYS.flatMap((id) => rawSlotsFor(config, date, id).map((slot) => slot.personId)));
  const withBooking = unique.map((slot) => {
    const rule = LIMITED_BOOKING_RULES.find(
      (item) =>
        item.weekday === weekday &&
        item.personId === slot.personId &&
        item.limitedByShift[shiftId] !== undefined &&
        item.whenDayHasAny.some((id) => dayDoctors.has(id)),
    );
    return rule ? { ...slot, limited: rule.limitedByShift[shiftId]! } : slot;
  });
  // 自動不排規則：例如週三晚診其他醫師 4 位以上不排陳美玲、週五午診有兒牙口外不排林志明。
  return withBooking.filter((slot) => {
    const others = withBooking.filter((other) => other.personId !== slot.personId);
    return !SESSION_EXCLUSION_RULES.some(
      (rule) =>
        rule.weekday === weekday &&
        rule.shiftId === shiftId &&
        rule.personId === slot.personId &&
        (rule.othersAtLeast === undefined || others.length >= rule.othersAtLeast) &&
        (rule.whenAnyPresent === undefined || others.some((other) => rule.whenAnyPresent!.includes(other.personId))),
    );
  });
}

export function dayOverrideFor(config: DoctorScheduleConfig, date: string, shiftId: ShiftKey): DayOverride | undefined {
  return (config.overrides ?? []).find((item) => item.date === date && item.shiftId === shiftId);
}

/** 某天某一診實際看診的醫師：有單日調整就用調整，否則用固定班＋來診日。不看休診日。 */
export function slotsFor(config: DoctorScheduleConfig, date: string, shiftId: ShiftKey): DoctorSlot[] {
  return dayOverrideFor(config, date, shiftId)?.slots ?? baseSlotsFor(config, date, shiftId);
}

export function hasDayOverride(config: DoctorScheduleConfig, date: string): boolean {
  return (config.overrides ?? []).some((item) => item.date === date);
}

/** 產生某月的醫師診次。休診日不看診；其餘每診依 slotsFor。 */
export function sessionsForMonth(config: DoctorScheduleConfig, month: string): DoctorSession[] | undefined {
  if (!isCalendarMonth(config, month)) return undefined;
  const closed = new Set(config.closures.map((closure) => closure.date));
  return daysOf(month).flatMap((date) => {
    if (closed.has(date)) return [];
    return SHIFT_KEYS.flatMap((shiftId) => {
      const doctors = slotsFor(config, date, shiftId).map((slot) => ({
        personId: slot.personId,
        limitedBooking: slot.limited,
        ...(slot.floor ? { floor: slot.floor } : {}),
      }));
      return doctors.length > 0 ? [{ date, shiftId, doctors }] : [];
    });
  });
}

const sameSlots = (a: DoctorSlot[], b: DoctorSlot[]) => {
  const key = (slots: DoctorSlot[]) => slots.map((slot) => `${slot.personId}:${slot.limited}:${slot.floor ?? ""}`).sort().join(",");
  return key(a) === key(b);
};

/** 設定某天某一診的醫師；和沒有調整時一樣就不存調整（保持乾淨）。 */
export function setDayOverride(config: DoctorScheduleConfig, date: string, shiftId: ShiftKey, slots: DoctorSlot[]): DoctorScheduleConfig {
  const rest = (config.overrides ?? []).filter((item) => !(item.date === date && item.shiftId === shiftId));
  const overrides = sameSlots(slots, baseSlotsFor(config, date, shiftId)) ? rest : [...rest, { date, shiftId, slots }];
  return { ...config, overrides: overrides.sort((a, b) => a.date.localeCompare(b.date)) };
}

/** 單日指定的樓層：key 為 `日期_班別ID_醫師ID`，給人數計算用（優先於樓層規則）。 */
export function sessionFloorMap(config: DoctorScheduleConfig): Map<string, 1 | 2> {
  return new Map(
    (config.overrides ?? []).flatMap((item) =>
      item.slots.flatMap((slot) => (slot.floor ? [[`${item.date}_${item.shiftId}_${slot.personId}`, slot.floor] as const] : [])),
    ),
  );
}

/** 恢復成固定班：清掉某天所有單日調整。 */
export function clearDayOverrides(config: DoctorScheduleConfig, date: string): DoctorScheduleConfig {
  return { ...config, overrides: (config.overrides ?? []).filter((item) => item.date !== date) };
}

/** 改某版本某天某診的醫師（不改其他版本）。 */
export function setWeeklySlots(
  config: DoctorScheduleConfig,
  from: string,
  weekday: number,
  shiftId: ShiftKey,
  slots: DoctorSlot[],
): DoctorScheduleConfig {
  return {
    ...config,
    weekly: config.weekly.map((version) =>
      version.from !== from
        ? version
        : { ...version, slots: { ...version.slots, [weekday]: { ...version.slots[weekday], [shiftId]: slots } } },
    ),
  };
}

/** 新增從某月起生效的版本：先複製那個月原本適用的固定班。已有同月版本時不變。 */
export function addWeeklyVersion(config: DoctorScheduleConfig, from: string): DoctorScheduleConfig {
  if (config.weekly.some((version) => version.from === from)) return config;
  const base = weeklyVersionFor(config, from) ?? [...config.weekly].sort((a, b) => a.from.localeCompare(b.from))[0];
  const slots: WeeklySlots = JSON.parse(JSON.stringify(base?.slots ?? {}));
  return { ...config, weekly: [...config.weekly, { from, slots }].sort((a, b) => a.from.localeCompare(b.from)) };
}

/** 刪除版本；最早的版本不能刪。 */
export function removeWeeklyVersion(config: DoctorScheduleConfig, from: string): DoctorScheduleConfig {
  const earliest = [...config.weekly].sort((a, b) => a.from.localeCompare(b.from))[0];
  if (!earliest || earliest.from === from) return config;
  return { ...config, weekly: config.weekly.filter((version) => version.from !== from) };
}

/** 匯入備份時檢查格式。 */
export function isDoctorScheduleConfig(value: unknown): value is DoctorScheduleConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<DoctorScheduleConfig>;
  return (
    config.version === 1 &&
    typeof config.firstMonth === "string" &&
    typeof config.lastMonth === "string" &&
    Array.isArray(config.weekly) &&
    config.weekly.length > 0 &&
    Array.isArray(config.visits) &&
    Array.isArray(config.closures) &&
    (config.overrides === undefined || Array.isArray(config.overrides))
  );
}

/** 新增或修改休診日（同一天只留一筆）。 */
export function setClosure(config: DoctorScheduleConfig, date: string, label: string): DoctorScheduleConfig {
  const closures = [...config.closures.filter((closure) => closure.date !== date), { date, label }];
  return { ...config, closures: closures.sort((a, b) => a.date.localeCompare(b.date)) };
}

export function removeClosure(config: DoctorScheduleConfig, date: string): DoctorScheduleConfig {
  return { ...config, closures: config.closures.filter((closure) => closure.date !== date) };
}

/** 新增或修改一筆專科醫師來診日（依 id）。沒有任何醫師或日期的診不保留。 */
export function saveVisit(config: DoctorScheduleConfig, visit: ClinicVisit): DoctorScheduleConfig {
  const cleaned: ClinicVisit = {
    ...visit,
    label: visit.label.trim(),
    dates: [...new Set(visit.dates)].sort(),
    sessions: Object.fromEntries(Object.entries(visit.sessions).filter(([, slots]) => slots && slots.length > 0)),
  };
  const exists = config.visits.some((item) => item.id === visit.id);
  return {
    ...config,
    visits: exists ? config.visits.map((item) => (item.id === visit.id ? cleaned : item)) : [...config.visits, cleaned],
  };
}

export function removeVisit(config: DoctorScheduleConfig, id: string): DoctorScheduleConfig {
  return { ...config, visits: config.visits.filter((visit) => visit.id !== id) };
}

/** 把行事曆延長到某月（只會往後延）。 */
export function extendCalendar(config: DoctorScheduleConfig, lastMonth: string): DoctorScheduleConfig {
  return lastMonth > config.lastMonth ? { ...config, lastMonth } : config;
}
