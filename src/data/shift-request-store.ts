import type { ShiftRequests } from "@/domain/rules/shift-request";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 「指定診次不排」登記。與班表資料分開存放，不影響既有的班表文件與匯出格式。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:shift-requests:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: ShiftRequests = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readShiftRequests(): ShiftRequests {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue = parsed && typeof parsed === "object" ? (parsed as ShiftRequests) : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

export function saveShiftRequests(requests: ShiftRequests): void {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // 無法寫入時不更新畫面，避免顯示未儲存的狀態。
    return;
  }
  listeners.forEach((listener) => listener());
}

export function subscribeShiftRequests(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
