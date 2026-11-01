"use client";

import { DATA_VERSION } from "@/config/data-format";
import { createScheduleRepository } from "@/data/create-schedule-repository";
import { clearCell, isScheduleEntry, setLeave, setShift, toggleShift } from "@/domain/schedule";
import type {
  CourseExport,
  RepositoryMode,
  ScheduleEntry,
  SyncState,
} from "@/domain/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ScheduleContextValue {
  entries: ScheduleEntry[];
  mode: RepositoryMode;
  syncState: SyncState;
  error: string | null;
  saveShift(date: string, personId: string, shiftId: string): Promise<void>;
  toggleShift(date: string, personId: string, shiftId: string): Promise<void>;
  saveLeave(date: string, personId: string, note?: string): Promise<void>;
  clearEntry(date: string, personId: string): Promise<void>;
  saveEntries(entries: ScheduleEntry[]): Promise<void>;
  /** 一次刪除與新增多筆（ID 相同時視為更新）。 */
  replaceEntries(remove: ScheduleEntry[], add: ScheduleEntry[]): Promise<void>;
  importEntries(value: unknown): Promise<number>;
  clearAll(): Promise<void>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => createScheduleRepository(), []);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      repository.subscribe(
        (nextEntries) => {
          setEntries(nextEntries);
          if (repository.mode === "remote") return;
          setSyncState("synced");
          setError(null);
        },
        (nextError) => {
          setError(nextError.message);
          setSyncState("error");
        },
        (state, nextError) => {
          setSyncState(state);
          setError(nextError);
        },
      ),
    [repository],
  );

  // 比對修改前後的資料：刪掉消失的 ID，儲存新增或變更的文件。
  const applyChange = useCallback(
    async (next: ScheduleEntry[]) => {
      const before = new Map(entries.map((entry) => [entry.id, entry]));
      const after = new Set(next.map((entry) => entry.id));
      setSyncState("saving");
      setError(null);
      try {
        // 一次寫入（大量變更時不會一筆一筆重寫整份資料）。
        const removeIds = [...before.keys()].filter((id) => !after.has(id));
        const saves = next.filter((entry) => before.get(entry.id) !== entry);
        if (removeIds.length > 0 || saves.length > 0) await repository.applyBatch(removeIds, saves);
        if (repository.mode === "local") setSyncState("synced");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "儲存失敗");
        setSyncState("error");
      }
    },
    [entries, repository],
  );

  const value = useMemo<ScheduleContextValue>(
    () => ({
      entries,
      mode: repository.mode,
      syncState,
      error,
      async saveShift(date, personId, shiftId) {
        await applyChange(setShift(entries, date, personId, shiftId));
      },
      async toggleShift(date, personId, shiftId) {
        await applyChange(toggleShift(entries, date, personId, shiftId));
      },
      async saveLeave(date, personId, note) {
        await applyChange(setLeave(entries, date, personId, Date.now(), note));
      },
      async clearEntry(date, personId) {
        await applyChange(clearCell(entries, date, personId));
      },
      async saveEntries(nextEntries) {
        await applyChange([...entries, ...nextEntries]);
      },
      async replaceEntries(remove, add) {
        const removed = new Set(remove.map((entry) => entry.id));
        const added = new Set(add.map((entry) => entry.id));
        await applyChange([...entries.filter((entry) => !removed.has(entry.id) && !added.has(entry.id)), ...add]);
      },
      async importEntries(input) {
        const source = input as Partial<CourseExport>;
        if (
          !source ||
          source.kind !== "clinic-schedule-workshop" ||
          source.version !== DATA_VERSION ||
          !Array.isArray(source.entries)
        ) {
          throw new Error("這不是相容的排班匯出檔");
        }
        const nextEntries = source.entries.filter(isScheduleEntry);
        if (nextEntries.length !== source.entries.length) {
          throw new Error("匯出檔含有無法辨識的班表資料");
        }
        setSyncState("saving");
        await repository.replaceAll(nextEntries);
        if (repository.mode === "local") setSyncState("synced");
        return nextEntries.length;
      },
      async clearAll() {
        setSyncState("saving");
        await repository.replaceAll([]);
        if (repository.mode === "local") setSyncState("synced");
      },
    }),
    [entries, repository, applyChange, syncState, error],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useSchedule 必須在 ScheduleProvider 內使用");
  return value;
}
