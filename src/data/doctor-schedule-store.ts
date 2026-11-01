import { defaultDoctorSchedule } from "@/config/doctor-schedule-2027";
import { isDoctorScheduleConfig, type DoctorScheduleConfig } from "@/domain/rules/doctor-schedule";
import { readStored, writeStored, removeStored, subscribeStored } from "./data-storage";

/**
 * 醫師班表（每週固定班、專科醫師來診日、休診日）。與班表資料分開存放，不含在「資料工具」的 JSON 匯出。
 * 沒有存過時使用 2027 年原始設定。存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:doctor-schedule:v1";
const listeners = new Set<() => void>();
const DEFAULT = defaultDoctorSchedule();
let cachedRaw: string | null = null;
let cachedValue: DoctorScheduleConfig = DEFAULT;

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readDoctorSchedule(): DoctorScheduleConfig {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      cachedValue = isDoctorScheduleConfig(parsed) ? parsed : DEFAULT;
    } catch {
      cachedValue = DEFAULT;
    }
  }
  return cachedValue;
}

/** 建置時（沒有瀏覽器）用原始設定。 */
export function readDefaultDoctorSchedule(): DoctorScheduleConfig {
  return DEFAULT;
}

export function saveDoctorSchedule(config: DoctorScheduleConfig): boolean {
  try {
    writeStored(STORAGE_KEY, JSON.stringify(config));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

/** 還原成原始 2027 設定。 */
export function resetDoctorSchedule(): boolean {
  try {
    removeStored(STORAGE_KEY);
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeDoctorSchedule(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
