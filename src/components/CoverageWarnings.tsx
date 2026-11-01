import { formatDay } from "@/domain/dates";
import type { SessionDemand } from "@/domain/rules/assistant-demand";

export function CoverageWarnings({ demands }: { demands: SessionDemand[] }) {
  const issues = demands.filter((demand) => demand.scheduled < demand.total);

  return (
    <section className="coverage-panel" aria-live="polite">
      <div>
        <p className="eyebrow">助理人力規則</p>
        <h2>助理人力檢查</h2>
        <p>依醫師人數、樓層與兒牙醫師計算每診需求；只顯示提示，不會自動排班。</p>
      </div>
      {issues.length === 0 ? (
        <div className="coverage-ok">畫面上所有診次人力充足</div>
      ) : (
        <div className="coverage-results">
          <strong>{issues.length} 個診次人力不足</strong>
          <div className="coverage-chips">
            {issues.slice(0, 8).map((issue) => (
              <span className="coverage-chip" key={`${issue.date}_${issue.shiftId}`}>
                {formatDay(issue.date)} · {issue.shiftLabel} · {issue.scheduled}/{issue.total}
              </span>
            ))}
            {issues.length > 8 && <span className="coverage-more">另有 {issues.length - 8} 筆</span>}
          </div>
        </div>
      )}
    </section>
  );
}
