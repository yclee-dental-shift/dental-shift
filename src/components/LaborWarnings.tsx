import type { LaborIssue } from "@/domain/rules/labor-hours";

export function LaborWarnings({ issues, names }: { issues: LaborIssue[]; names: Map<string, string> }) {
  if (issues.length === 0) return null;
  return (
    <section className="coverage-panel labor-panel" aria-live="polite">
      <div>
        <p className="eyebrow">四週變形工時</p>
        <h2>助理工時檢查</h2>
        <p>每月正常工時＝應上班天數 × 8 小時；每兩週至少休 2 天；每天最多 10 小時。規定以勞動部公告為準。</p>
      </div>
      <div className="coverage-results">
        <strong>{issues.length} 項工時或休息不符規定</strong>
        <div className="coverage-chips">
          {issues.map((issue) => (
            <span className="coverage-chip" key={`${issue.personId}_${issue.month}_${issue.message}`}>
              {names.get(issue.personId) ?? issue.personId} · {Number(issue.month.slice(5))} 月 · {issue.message}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
