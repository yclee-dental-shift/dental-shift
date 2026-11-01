"use client";

import Link from "next/link";
import { courseProfile } from "@/config/clinic.config";
import { todayString } from "@/domain/dates";
import { LEAD_CANDIDATES } from "@/domain/rules/month-lead";
import { ManagerOnly } from "@/components/ManagerOnly";
import { useMonthAccess } from "@/components/useMonthAccess";
import { clampMonth, fullMonthLabel, shiftMonth } from "@/components/schedule-settings";

/** 一次列出的月份：這個月起 12 個月。 */
const MONTHS = 12;
const nameOf = (personId: string | null) => LEAD_CANDIDATES.find((candidate) => candidate.personId === personId)?.name ?? "（未指定）";
const timeText = (at: string) => at.replace("T", " ").slice(0, 16).replace(/-/g, "/");

/**
 * 排班負責人（使用者 2026-10-27）：助理長先排好之後幾個月由誰排班，存了馬上生效（那個人就能開始編輯那個月）。
 * 最高管理者也可以改；其他人只能看。工作台上方的「○月排班負責人」是同一份資料。
 */
function LeadsContent() {
  const { leads, leadOf, canAssign, setLead } = useMonthAccess();
  const start = clampMonth(todayString().slice(0, 7));
  const months = Array.from({ length: MONTHS }, (_, index) => shiftMonth(start, index));
  const defaultName = nameOf(leadOf(""));
  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>排班負責人</h1>
      <p className="page-intro">
        每個月由一位助理長或組長負責排班，負責人那個月有排班的全部權限（人數與班表仍要最高管理者確認）。
        沒指定的月份由助理長（{defaultName}）負責。{canAssign ? "改了馬上生效。" : "只有助理長與最高管理者可以改。"}
      </p>
      <section className="info-card">
        <div className="table-scroll">
          <table className="info-table leads-table">
            <thead>
              <tr><th scope="col">月份</th><th scope="col">負責人</th><th scope="col">指定紀錄</th></tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const assigned = leads[month];
                return (
                  <tr key={month}>
                    <th scope="row">
                      <Link href={`/workbench?month=${month}`}>{fullMonthLabel(month)}</Link>
                    </th>
                    <td>
                      {canAssign ? (
                        <select
                          aria-label={`${fullMonthLabel(month)}排班負責人`}
                          value={assigned ? assigned.personId : ""}
                          onChange={(event) => setLead(month, event.target.value || null)}
                        >
                          <option value="">{`預設（助理長 ${defaultName}）`}</option>
                          {LEAD_CANDIDATES.map((candidate) => (
                            <option key={candidate.personId} value={candidate.personId}>
                              {candidate.name}（{candidate.title}）
                            </option>
                          ))}
                        </select>
                      ) : (
                        nameOf(leadOf(month))
                      )}
                    </td>
                    <td className="leads-by">{assigned ? `${assigned.by} ${timeText(assigned.at)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function LeadsPage() {
  return (
    <ManagerOnly>
      <LeadsContent />
    </ManagerOnly>
  );
}
