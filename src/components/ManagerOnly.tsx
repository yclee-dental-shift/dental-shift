"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useViewer } from "./ViewerProvider";
import { LoadingSpinner } from "./LoadingSpinner";

/** 最高管理者、排班者與行政專員才看得到的頁面。依模擬身分判斷（只在畫面上，不是正式保護）。 */
export function isManagerViewer(viewer: string) {
  return viewer === "owner" || viewer === "scheduler" || viewer === "clerk";
}

const noopSubscribe = () => () => {};

export function ManagerOnly({ children }: { children: ReactNode }) {
  const { viewer, member } = useViewer();
  // 身分與資料都在瀏覽器裡，建置時先顯示載入中。
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <main className="page-shell"><LoadingSpinner label="載入中…" /></main>;
  if (isManagerViewer(viewer)) return children;
  return (
    <main className="page-shell narrow-page">
      <p className="info-callout">這一頁只有最高管理者、排班者與行政專員可以看。{member ? "" : "請從左側選單切換模擬身分。"}</p>
    </main>
  );
}
