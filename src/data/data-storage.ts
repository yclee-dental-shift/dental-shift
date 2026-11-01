/**
 * 各 store 讀寫資料的地方：瀏覽器 localStorage。
 * 之後要改成存到雲端資料庫，只要改這個檔，store 的程式不用改。
 * 寫入失敗時丟出錯誤，store 照舊不更新畫面。
 */
export function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function writeStored(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

export function removeStored(key: string): void {
  window.localStorage.removeItem(key);
}

/** 資料被別的分頁改了時通知。 */
export function subscribeStored(key: string, listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
