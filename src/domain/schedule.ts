import type { ScheduleEntry } from "./types";

export function scheduleEntryId(date: string, personId: string): string {
  return `${date}_${personId}`;
}

/** 醫師與助理一天可排多診：每一診各存一筆，ID 為 `日期_人員ID_班別ID`。 */
export function shiftEntryId(date: string, personId: string, shiftId: string): string {
  return `${date}_${personId}_${shiftId}`;
}

function isSameCell(entry: ScheduleEntry, date: string, personId: string): boolean {
  return entry.date === date && entry.personId === personId;
}

function sortById(entries: ScheduleEntry[]): ScheduleEntry[] {
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export function setShift(
  entries: ScheduleEntry[],
  date: string,
  personId: string,
  shiftId: string,
  now = Date.now(),
): ScheduleEntry[] {
  const next: ScheduleEntry = {
    id: scheduleEntryId(date, personId),
    date,
    personId,
    state: "shift",
    shiftId,
    updatedAt: now,
  };
  return sortById([...clearCell(entries, date, personId), next]);
}

export function setLeave(
  entries: ScheduleEntry[],
  date: string,
  personId: string,
  now = Date.now(),
  note?: string,
): ScheduleEntry[] {
  const next: ScheduleEntry = {
    id: scheduleEntryId(date, personId),
    date,
    personId,
    state: "leave",
    updatedAt: now,
    ...(note ? { note } : {}),
  };
  return sortById([...clearCell(entries, date, personId), next]);
}

/**
 * 多診切換：已有該診就取消，沒有就加上；同時移除當天的休假。
 * 其他診別保持不變，因此同一診不會重複。
 */
export function toggleShift(
  entries: ScheduleEntry[],
  date: string,
  personId: string,
  shiftId: string,
  now = Date.now(),
): ScheduleEntry[] {
  const others = clearCell(entries, date, personId);
  const activeShifts = findEntries(entries, date, personId).filter((entry) => entry.state === "shift");
  if (activeShifts.some((entry) => entry.shiftId === shiftId)) {
    return sortById([...others, ...activeShifts.filter((entry) => entry.shiftId !== shiftId)]);
  }
  const next: ScheduleEntry = {
    id: shiftEntryId(date, personId, shiftId),
    date,
    personId,
    state: "shift",
    shiftId,
    updatedAt: now,
  };
  return sortById([...others, ...activeShifts, next]);
}

/** 清除某人某天的所有資料（含多診與休假）。 */
export function clearCell(entries: ScheduleEntry[], date: string, personId: string): ScheduleEntry[] {
  return entries.filter((entry) => !isSameCell(entry, date, personId));
}

export function replaceEntry(
  entries: ScheduleEntry[],
  next: ScheduleEntry,
): ScheduleEntry[] {
  return [...entries.filter((entry) => entry.id !== next.id), next].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

export function removeEntry(entries: ScheduleEntry[], id: string): ScheduleEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function findEntries(
  entries: ScheduleEntry[],
  date: string,
  personId: string,
): ScheduleEntry[] {
  return entries.filter((entry) => isSameCell(entry, date, personId));
}

export function findEntry(
  entries: ScheduleEntry[],
  date: string,
  personId: string,
): ScheduleEntry | undefined {
  return entries.find((entry) => entry.id === scheduleEntryId(date, personId));
}

export function isScheduleEntry(value: unknown): value is ScheduleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ScheduleEntry>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.date !== "string" ||
    typeof entry.personId !== "string" ||
    typeof entry.updatedAt !== "number"
  ) {
    return false;
  }
  if (entry.state === "leave") return entry.shiftId === undefined && entry.task === undefined;
  return entry.state === "shift" && typeof entry.shiftId === "string" && (entry.task === undefined || typeof entry.task === "string");
}
