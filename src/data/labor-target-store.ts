import type { TargetHours } from "@/domain/rules/labor-hours";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月目標工時（小時）的手動設定；沒設定的月份用預設（正常工時少 8～10 小時）。
 * 與班表資料分開存放，不含在 JSON 匯出；存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
export type LaborTargets = Record<string, TargetHours>;

const STORAGE_KEY = "clinic-schedule-workshop:labor-targets:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: LaborTargets = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isTarget(value: unknown): value is TargetHours {
  if (!value || typeof value !== "object") return false;
  const { min, max } = value as Record<string, unknown>;
  return typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max;
}

export function readLaborTargets(): LaborTargets {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, TargetHours] => isTarget(item[1])),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 設定某月目標；target 為 undefined 時恢復預設。無法寫入時回傳 false。 */
export function saveLaborTarget(month: string, target: TargetHours | undefined): boolean {
  const next = { ...readLaborTargets() };
  if (target) next[month] = target;
  else delete next[month];
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeLaborTargets(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
