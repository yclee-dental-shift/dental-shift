import { isWorkAssignments, type WorkAssignments, type WorkAssignmentMap } from "@/domain/rules/work-assignment";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 工作分配（每月一份：每一診每個崗位排了誰＋雜務；key＝月份）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 * 所有人都看得到；能改的人照 `canEditAssignments`（伺服器擋）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:work-assignments:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: WorkAssignmentMap = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readWorkAssignments(): WorkAssignmentMap {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, WorkAssignments] =>
                isWorkAssignments(item[1], item[0]),
              ),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某個月的工作分配；version 為 undefined 時刪掉那一份。無法寫入時回傳 false。 */
export function saveWorkAssignments(month: string, version: WorkAssignments | undefined): boolean {
  const next = { ...readWorkAssignments() };
  if (version) next[month] = version;
  else delete next[month];
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeWorkAssignments(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
