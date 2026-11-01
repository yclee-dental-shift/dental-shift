"use client";

/**
 * 「還差什麼」清單（使用者 2026-10-30，照 Apple HIG：一眼看到狀態、只有一個主要動作）：
 * 一項一行，打勾＝好了、打叉＝擋住送出、驚嘆號＝提醒（不擋）；有 onAction 的點了跳到要處理的地方。
 * 只把原本散在各處的提醒集中顯示，不另外存資料；能不能送出照舊由呼叫的地方判斷。
 * 跳過去只是看，不改資料，所以已完成的步驟（只能看）也能點（data-view-control）。
 */
export interface ChecklistItem {
  id: string;
  ok: boolean;
  /** block＝沒過就不能送出；warn＝只提醒。 */
  level: "block" | "warn";
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ScheduleChecklist({ items, label = "還差什麼" }: { items: ChecklistItem[]; label?: string }) {
  const left = items.filter((item) => !item.ok);
  return (
    <section className="step-checklist" aria-label={label}>
      <p className="step-checklist-head">
        <strong>{label}</strong>
        <small>{left.length === 0 ? "都好了" : `還有 ${left.length} 項`}</small>
      </p>
      <ul>
        {items.map((item) => {
          const tone = item.ok ? "is-ok" : item.level === "block" ? "is-block" : "is-warn";
          const mark = item.ok ? "✓" : item.level === "block" ? "✕" : "!";
          const state = item.ok ? "已完成" : item.level === "block" ? "要先處理" : "提醒";
          const body = (
            <>
              <span className={`step-check-mark ${tone}`} aria-label={state}>{mark}</span>
              <span className="step-check-title">{item.title}</span>
              <span className="step-check-detail">{item.detail}</span>
              {item.onAction && <span className="step-check-go" aria-hidden="true">{item.actionLabel ?? "前往"} ›</span>}
            </>
          );
          return (
            <li key={item.id} className={tone}>
              {item.onAction ? (
                <button type="button" className="step-check-row" data-view-control onClick={item.onAction}>
                  {body}
                </button>
              ) : (
                <div className="step-check-row">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
