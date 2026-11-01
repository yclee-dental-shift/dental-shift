import type { DemandAdjustments } from "@/domain/rules/assistant-demand";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 推算人數的手動調整（某天某一診在系統人數上加減幾人）。與班表資料分開存放，不含在 JSON 匯出。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:demand-adjustments:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: DemandAdjustments = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readDemandAdjustments(): DemandAdjustments {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter(
                (item): item is [string, number] => typeof item[1] === "number" && Number.isFinite(item[1]) && item[1] !== 0,
              ),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存整份調整；無法寫入時回傳 false。 */
export function saveDemandAdjustments(next: DemandAdjustments): boolean {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeDemandAdjustments(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
