import { normalizeApproval, type DemandApproval } from "@/domain/rules/workflow";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月助理人數的送審紀錄（送出、退回、同意、發布的時間與當時每診人數）。與班表資料分開存放，不含在 JSON 匯出。
 * 舊版只有「同意」紀錄，讀取時視為已同意、尚未發布。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:demand-approvals";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: Record<string, DemandApproval> = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readDemandApprovals(): Record<string, DemandApproval> {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const records = parsed && typeof parsed === "object" ? (parsed as Record<string, DemandApproval>) : {};
      cachedValue = Object.fromEntries(
        Object.entries(records).map(([month, record]) => [month, normalizeApproval({ ...record, month })]),
      );
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

function write(next: Record<string, DemandApproval>): void {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 無法寫入時不更新畫面，避免顯示未儲存的狀態。
    return;
  }
  listeners.forEach((listener) => listener());
}

export function saveDemandApproval(approval: DemandApproval): void {
  write({ ...readDemandApprovals(), [approval.month]: approval });
}

/** 取消某些月份的同意（重新計算人數時使用）。 */
export function removeDemandApprovals(months: string[]): void {
  const next = { ...readDemandApprovals() };
  months.forEach((month) => delete next[month]);
  write(next);
}

export function subscribeDemandApprovals(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
