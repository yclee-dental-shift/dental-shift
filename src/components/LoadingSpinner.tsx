/**
 * 等待畫面：轉圈＋文字（使用者 2026-10-31）。
 * 只用 CSS 動畫，程式還沒跑起來（建置好的 HTML 一打開）就看得到：
 * 0.3 秒內載完就不出現（不閃一下），超過 10 秒多一行「網路較慢」＋重新整理。
 * `full`＝整頁正中間（確認登入）；沒有＝放在原本那一行（頁面、班表載入中）。
 */
export function LoadingSpinner({ label, full = false }: { label: string; full?: boolean }) {
  return (
    <div className={full ? "loading-state is-full" : "loading-state"} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span className="loading-label">{label}</span>
      <span className="loading-slow">
        網路較慢，請稍候
        <a className="button loading-reload" href="">重新整理</a>
      </span>
    </div>
  );
}
