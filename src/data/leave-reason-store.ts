import type { LeaveReasons } from "@/domain/rules/leave-reason";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 排休與「指定診次不排」的理由。與班表資料分開存放，不含在 JSON 匯出。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:leave-reasons:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: LeaveReasons = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readLeaveReasons(): LeaveReasons {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue = parsed && typeof parsed === "object" ? (parsed as LeaveReasons) : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

export function saveLeaveReasons(reasons: LeaveReasons): void {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(reasons));
  } catch {
    // 無法寫入時不更新畫面，避免顯示未儲存的狀態。
    return;
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLeaveReasons(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
