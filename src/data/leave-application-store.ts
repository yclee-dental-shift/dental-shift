import type { LeaveApplications } from "@/domain/rules/leave-application";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 助理的排休申請紀錄。與班表資料分開存放：管理者改班表不會刪除申請，不含在 JSON 匯出。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:leave-applications:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: LeaveApplications = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readLeaveApplications(): LeaveApplications {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue = parsed && typeof parsed === "object" ? (parsed as LeaveApplications) : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

export function saveLeaveApplications(applications: LeaveApplications): void {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(applications));
  } catch {
    // 無法寫入時不更新畫面，避免顯示未儲存的狀態。
    return;
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLeaveApplications(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
