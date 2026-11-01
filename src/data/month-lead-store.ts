import { isMonthLeadValue, type MonthLead, type MonthLeads } from "@/domain/rules/month-lead";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月排班負責人（助理長指定；沒指定的月份＝助理長）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:month-leads:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: MonthLeads = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readMonthLeads(): MonthLeads {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, MonthLead] => isMonthLeadValue(item[1])))
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 指定某月的負責人；lead 為 undefined 時恢復預設（助理長）。無法寫入時回傳 false。 */
export function saveMonthLead(month: string, lead: MonthLead | undefined): boolean {
  const next = { ...readMonthLeads() };
  if (lead) next[month] = lead;
  else delete next[month];
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeMonthLeads(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
