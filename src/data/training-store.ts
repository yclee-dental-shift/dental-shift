import { isTrainingPlan, type TrainingPlan, type TrainingPlans } from "@/domain/rules/training";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 每月培訓清單（指定安排與培訓目標，key＝月份）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:training-plans:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: TrainingPlans = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readTrainingPlans(): TrainingPlans {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, TrainingPlan] =>
                isTrainingPlan(item[1], item[0]),
              ),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某個月的培訓清單；version 為 undefined 時刪掉那一份。無法寫入時回傳 false。 */
export function saveTrainingPlan(month: string, version: TrainingPlan | undefined): boolean {
  const next = { ...readTrainingPlans() };
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

export function subscribeTrainingPlans(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
