"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { courseProfile } from "@/config/clinic.config";
import { AssistantView, type AssistantTab } from "./AssistantView";
import { useViewer } from "./ViewerProvider";
import { LoadingSpinner } from "./LoadingSpinner";

const noopSubscribe = () => () => {};

/** 助理的「排休申請」「待確認」頁；管理者打開時只說明這是助理頁面（模擬身分，非登入）。 */
export function AssistantPage({ tab }: { tab: AssistantTab }) {
  const { viewer, member, acting } = useViewer();
  // 身分與資料都在瀏覽器裡，建置時先顯示載入中。
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <main className="page-shell"><LoadingSpinner label="載入中…" /></main>;
  // 助理長、組長（排班者畫面）看自己的排休與班表確認。
  const ownId = viewer === "scheduler" && (acting?.role === "lead" || acting?.role === "leader") ? acting.personId : undefined;
  const assistant = courseProfile.people.find((person) => person.id === (ownId ?? viewer));
  if (assistant) return <AssistantView key={assistant.id} person={assistant} tab={tab} />;
  return (
    <main className="page-shell narrow-page">
      <p className="info-callout">
        {member
          ? `這是助理的頁面。${member.role === "owner" ? "要看某位助理的畫面，請從左側「用某人的身分看」選一位。" : ""}`
          : "這是助理的頁面。請從左側選單切換成某位助理的模擬身分再看。"}
      </p>
      <Link className="button" href="/">回總覽</Link>
    </main>
  );
}
