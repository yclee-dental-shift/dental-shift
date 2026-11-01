"use client";

import { useRef, useState } from "react";
import { ManagerOnly } from "@/components/ManagerOnly";
import { useSchedule } from "@/components/ScheduleProvider";
import { useViewer } from "@/components/ViewerProvider";
import { courseProfile } from "@/config/clinic.config";
import { DATA_VERSION } from "@/config/data-format";
import type { CourseExport } from "@/domain/types";

/** 資料工具：最高管理者與排班者可以匯出；匯入與清空只給最高管理者（模擬身分，非正式保護）。 */
function SettingsContent() {
  const { entries, importEntries, clearAll } = useSchedule();
  const { viewer } = useViewer();
  const isOwner = viewer === "owner";
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  function exportData() {
    const value: CourseExport = {
      kind: "clinic-schedule-workshop",
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      clinicName: courseProfile.clinicName,
      entries,
    };
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `schedule-demo-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`已匯出 ${entries.length} 筆班表資料。`);
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      const count = await importEntries(value);
      setMessage(`已匯入 ${count} 筆班表資料。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "匯入失敗");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function clearDemoData() {
    if (!window.confirm(`確定清除目前所有班表資料？建議先匯出 JSON 備份。此動作不會刪除程式碼。`)) return;
    await clearAll();
    setMessage("班表已清空。");
  }

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">備份與救援</p>
      <h1>資料工具</h1>
      <p className="page-intro">
        目前使用<strong>本機模式（資料只存在這台裝置的瀏覽器）</strong>。程式版本與班表資料是兩件事，切換程式版本不會還原班表資料，請定期匯出 JSON 備份。
      </p>
      {message && <div className="info-callout" role="status">{message}</div>}
      <div className="tool-grid">
        <section className="tool-card">
          <p className="eyebrow">推薦</p>
          <h2>匯出 JSON</h2>
          <p>修改程式或更新版本前，先下載目前的班表資料。</p>
          <button className="button" onClick={exportData}>下載備份</button>
        </section>
        {isOwner && <section className="tool-card">
          <h2>匯入 JSON</h2>
          <p>只接受由本系統匯出的相同版本檔案，匯入會取代現有班表。</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={(event) => onImport(event.target.files?.[0])}
          />
        </section>}
        {isOwner && <section className="tool-card danger-card">
          <h2>清空班表資料</h2>
          <p>只清除排班資料，不會動到程式碼或設定。</p>
          <button className="button button-danger" onClick={clearDemoData}>清空全部班表</button>
        </section>}
      </div>
      {!isOwner && <p className="assistant-hint">匯入與清空只有最高管理者可以使用。</p>}
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ManagerOnly>
      <SettingsContent />
    </ManagerOnly>
  );
}
