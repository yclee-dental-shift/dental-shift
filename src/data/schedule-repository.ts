import type { RepositoryMode, ScheduleEntry, SyncState } from "@/domain/types";

export interface ScheduleRepository {
  mode: RepositoryMode;
  subscribe(
    onEntries: (entries: ScheduleEntry[]) => void,
    onError: (error: Error) => void,
    /** 存到雲端時自己回報連線／儲存狀態（本機模式不用）。 */
    onStatus?: (state: SyncState, error: string | null) => void,
  ): () => void;
  save(entry: ScheduleEntry): Promise<void>;
  remove(id: string): Promise<void>;
  replaceAll(entries: ScheduleEntry[]): Promise<void>;
  /** 一次刪除與儲存多筆（只寫一次），給一鍵排班、醫師班同步等大量變更使用。 */
  applyBatch(removeIds: string[], saves: ScheduleEntry[]): Promise<void>;
}
