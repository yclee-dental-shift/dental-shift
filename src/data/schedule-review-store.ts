import type { ScheduleReview } from "@/domain/rules/schedule-review";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月班表審核（行政檢查、最高管理者確認班表）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:schedule-reviews:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: Record<string, ScheduleReview> = {};

function isReview(value: unknown): value is ScheduleReview {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.month === "string" && typeof record.status === "string" && Array.isArray(record.suggestions) && Array.isArray(record.log);
}

export function readScheduleReviews(): Record<string, ScheduleReview> {
  let raw: string | null = null;
  try {
    raw = readStored(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, ScheduleReview] => isReview(item[1])))
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某月的審核紀錄。無法寫入時回傳 false。 */
export function saveScheduleReview(review: ScheduleReview): boolean {
  try {
    writeStored(STORAGE_KEY, JSON.stringify({ ...readScheduleReviews(), [review.month]: review }));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

/** 刪掉某月的審核紀錄。 */
export function removeScheduleReview(month: string): boolean {
  const rest = Object.fromEntries(Object.entries(readScheduleReviews()).filter(([key]) => key !== month));
  try {
    writeStored(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeScheduleReviews(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
