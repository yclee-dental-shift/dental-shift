import { isDutySupervisors, type DutySupervisors, type DutySupervisorMap } from "@/domain/rules/duty-supervisor";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每一診的值班主管（每月一份，只存指定的；key＝月份）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 * 所有人都看得到。
 */
const STORAGE_KEY = "clinic-schedule-workshop:duty-supervisors:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: DutySupervisorMap = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readDutySupervisors(): DutySupervisorMap {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, DutySupervisors] =>
                isDutySupervisors(item[1], item[0]),
              ),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某個月的值班主管；version 為 undefined 時刪掉那一份。無法寫入時回傳 false。 */
export function saveDutySupervisors(month: string, version: DutySupervisors | undefined): boolean {
  const next = { ...readDutySupervisors() };
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

export function subscribeDutySupervisors(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
