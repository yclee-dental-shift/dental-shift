import { TIMELINE_KEYS, type TimelineOverrides } from "@/domain/rules/month-timeline";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月排班日程的手動調整（只存和通則不同的日期）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:month-timeline:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: Record<string, TimelineOverrides> = {};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readTimelineOverrides(): Record<string, TimelineOverrides> {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, Record<string, unknown>>).map(([month, value]) => [
                month,
                Object.fromEntries(
                  TIMELINE_KEYS.filter((key) => typeof value?.[key] === "string" && DATE.test(value[key] as string)).map((key) => [
                    key,
                    value[key] as string,
                  ]),
                ),
              ]),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某月的調整；空物件＝恢復通則。無法寫入時回傳 false。 */
export function saveTimelineOverrides(month: string, overrides: TimelineOverrides): boolean {
  const next = { ...readTimelineOverrides() };
  if (Object.keys(overrides).length > 0) next[month] = overrides;
  else delete next[month];
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeTimelineOverrides(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
