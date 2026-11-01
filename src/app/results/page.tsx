"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { todayString } from "@/domain/dates";
import { formatHours } from "@/domain/rules/labor-hours";
import { withLegacyApplications } from "@/domain/rules/leave-application";
import { scheduleResultOf } from "@/domain/rules/schedule-result";
import { ManagerOnly } from "@/components/ManagerOnly";
import { SaveImageButton } from "@/components/SaveImageButton";
import { ScheduleResultCard } from "@/components/ScheduleResultCard";
import { useSchedule } from "@/components/ScheduleProvider";
import { useLaborTargets } from "@/components/useLaborTargets";
import { useLeaveApplications } from "@/components/useLeaveApplications";
import { usePublications } from "@/components/usePublications";
import { useShiftRequests } from "@/components/useShiftRequests";
import { clampMonth, FIRST_MONTH, fullMonthLabel, LABOR_SETTINGS, shiftMonth } from "@/components/schedule-settings";

const PUBLICATION_TEXT = { draft: "排班中（助理還看不到）", preannounced: "預公告中", published: "已正式公告" } as const;

/**
 * 排班結果統整（管理者）：每月每位助理的排休申請結果、工時、比正常工時少排多少、改成休息日省下的假。
 * 只從現有資料算出來、不另外存；正式公告後班表鎖定，數字就固定。點一列看那位助理的明細（和助理看到的一樣）。
 */
function ResultsContent() {
  const { entries } = useSchedule();
  const { requests } = useShiftRequests();
  const { stored } = useLeaveApplications();
  const { targets } = useLaborTargets();
  const { publicationOf } = usePublications();
  const applications = useMemo(() => withLegacyApplications(stored, entries), [stored, entries]);
  const [month, setMonth] = useState(() => clampMonth(todayString().slice(0, 7)));
  const [openId, setOpenId] = useState<string | null>(null);
  // 「存成圖片」：整張統整表（標題＋表格）。
  const tableRef = useRef<HTMLElement>(null);
  const assistants = courseProfile.people.filter((person) => person.role === "assistant");
  const results = assistants.map((person) => ({
    person,
    result: scheduleResultOf({
      entries,
      applications,
      requests,
      personId: person.id,
      month,
      settings: LABOR_SETTINGS,
      flexNote: FLEX_SHIFT_NOTE,
      targetOverride: targets[month],
    }),
  }));
  const count = (list: Array<{ status: string }>, status: string) => list.filter((item) => item.status === status).length;

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>排班結果</h1>
      <p className="page-intro">每位助理這個月申請了什麼、實際怎麼排、工時多少。助理在「排班結果」與「待確認」頁看到的是自己那一列的明細。</p>

      <div className="assistant-month people-month">
        <button className="button button-quiet" aria-label="上個月" disabled={month <= FIRST_MONTH} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
        <strong>{fullMonthLabel(month)}</strong>
        <button className="button button-quiet" aria-label="下個月" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
      </div>
      <p className="assistant-hint">班表狀態：{PUBLICATION_TEXT[publicationOf(month).status]}。點一位助理看明細。</p>

      <section ref={tableRef} className="info-card">
        <div className="result-card-head">
          <h2>{fullMonthLabel(month)}排班結果統整</h2>
          <SaveImageButton target={tableRef} fileName={`排班結果_${fullMonthLabel(month)}`} />
        </div>
        <div className="table-scroll">
          <table className="info-table result-table">
            <thead>
              <tr>
                <th scope="col">助理</th>
                <th scope="col">整天排休<small>排入／休息／未排入</small></th>
                <th scope="col">指定診次<small>照申請／仍排班</small></th>
                <th scope="col">跟診</th>
                <th scope="col">機動</th>
                <th scope="col">請假</th>
                <th scope="col">合計／正常</th>
                <th scope="col">少排</th>
                <th scope="col">不扣假</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ person, result }) => (
                <Fragment key={person.id}>
                  <tr className={`result-row ${openId === person.id ? "is-open" : ""}`} onClick={() => setOpenId(openId === person.id ? null : person.id)}>
                    <th scope="row">
                      <button className="link-button is-quiet" aria-expanded={openId === person.id}>{person.displayName}</button>
                    </th>
                    <td>
                      {result.wholeDay.length === 0
                        ? "—"
                        : `${count(result.wholeDay, "placed")}／${count(result.wholeDay, "rest")}／${count(result.wholeDay, "unplaced")}`}
                    </td>
                    <td>
                      {result.sessions.length === 0
                        ? "—"
                        : `${result.sessions.length - count(result.sessions, "scheduled")}／${count(result.sessions, "scheduled")}`}
                    </td>
                    <td>{formatHours(result.followMinutes)}</td>
                    <td>{formatHours(result.flexMinutes)}</td>
                    <td>{formatHours(result.leaveMinutes)}</td>
                    <td>
                      {formatHours(result.paidMinutes)}
                      {result.normalMinutes !== undefined && `／${formatHours(result.normalMinutes)}`}
                    </td>
                    <td>{result.belowNormalMinutes > 0 ? formatHours(result.belowNormalMinutes) : "—"}</td>
                    <td>{result.restMinutes > 0 ? `${formatHours(result.restMinutes)} 小時` : "—"}</td>
                  </tr>
                  {openId === person.id && (
                    <tr className="result-detail">
                      <td colSpan={9}>
                        <ScheduleResultCard showFlex result={result} title={`${person.displayName}・${fullMonthLabel(month)}排班結果`} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="assistant-hint">時數單位：小時。少排＝正常工時減去（上班＋請假）；不扣假＝管理者把排休改成休息日（不扣假）的時數。只從班表與申請算出來，不另外存；正式公告後班表鎖定，數字就固定。</p>
      </section>
    </main>
  );
}

export default function ResultsPage() {
  return (
    <ManagerOnly>
      <ResultsContent />
    </ManagerOnly>
  );
}
