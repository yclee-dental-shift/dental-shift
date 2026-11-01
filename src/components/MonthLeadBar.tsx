"use client";

import { LEAD_CANDIDATES } from "@/domain/rules/month-lead";
import { useMonthAccess } from "./useMonthAccess";

const nameOf = (personId: string | null) => LEAD_CANDIDATES.find((candidate) => candidate.personId === personId)?.name ?? "（未指定）";

/**
 * 排班工作台上方：這個月的排班負責人。最高管理者、助理長可以換人（沒指定＝助理長）；
 * 不是負責人的人看到「這個月只能看」。
 */
export function MonthLeadBar({ month, monthLabel }: { month: string; monthLabel: string }) {
  const { leads, leadOf, canManage, canAssign, setLead } = useMonthAccess();
  const current = leadOf(month);
  const assigned = leads[month];
  return (
    <div className="month-lead-bar">
      <span>
        {monthLabel}排班負責人：
        {canAssign ? (
          <select
            aria-label={`${monthLabel}排班負責人`}
            value={assigned ? assigned.personId : ""}
            onChange={(event) => setLead(month, event.target.value || null)}
          >
            <option value="">{`預設（助理長 ${nameOf(leadOf(""))}）`}</option>
            {LEAD_CANDIDATES.map((candidate) => (
              <option key={candidate.personId} value={candidate.personId}>
                {candidate.name}（{candidate.title}）
              </option>
            ))}
          </select>
        ) : (
          <strong>{nameOf(current)}</strong>
        )}
      </span>
      {assigned && <small>{assigned.by} 指定</small>}
      {!canManage(month) && <span className="month-lead-note">你不是這個月的負責人：班表只能看，自己的排休請到「我的排休」。</span>}
    </div>
  );
}
