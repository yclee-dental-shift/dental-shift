import { isAbilityVersion, type AbilityVersion, type AbilityVersions } from "@/domain/rules/ability";
import { readStored, writeStored, subscribeStored } from "./data-storage";

/**
 * 能力表（每月一份，key＝從哪個月起生效）。與班表資料分開存放，不含在 JSON 匯出；
 * 存在瀏覽器 localStorage（經 `data-storage.ts`）。
 */
const STORAGE_KEY = "clinic-schedule-workshop:abilities:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue: AbilityVersions = {};

function readRaw(): string | null {
  try {
    return readStored(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readAbilities(): AbilityVersions {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedValue =
        parsed && typeof parsed === "object"
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter((item): item is [string, AbilityVersion] =>
                isAbilityVersion(item[1], item[0]),
              ),
            )
          : {};
    } catch {
      cachedValue = {};
    }
  }
  return cachedValue;
}

/** 存某個月起生效的能力表；version 為 undefined 時刪掉那一份。無法寫入時回傳 false。 */
export function saveAbility(month: string, version: AbilityVersion | undefined): boolean {
  const next = { ...readAbilities() };
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

export function subscribeAbilities(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeStored(STORAGE_KEY, listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}
