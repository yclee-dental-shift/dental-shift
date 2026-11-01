import type { MonthPublication } from "@/domain/rules/publication";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 班表公告狀態（預公告、確認、正式公告）。與班表資料分開存放，不影響既有的班表文件。
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:publications:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: Record<string, MonthPublication> = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readPublications(): Record<string, MonthPublication> {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue = parsed && typeof parsed === "object" ? (parsed as Record<string, MonthPublication>) : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

export function savePublication(publication: MonthPublication): void {
  const next = { ...readPublications(), [publication.month]: publication };
  try {
    writeStored(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 無法寫入時不更新畫面，避免顯示未儲存的狀態。
    return;
  }
  listeners.forEach((listener) => listener());
}

export function subscribePublications(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
