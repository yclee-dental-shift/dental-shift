"use client";

import { courseProfile } from "@/config/clinic.config";
import { formatDay } from "@/domain/dates";
import { formatHours } from "@/domain/rules/labor-hours";
import type { ScheduleResult, SessionStatus } from "@/domain/rules/schedule-result";
import type { ApplicationStatus } from "@/domain/rules/leave-application";
import { useRef } from "react";
import { SaveImageButton } from "./SaveImageButton";
import { fullMonthLabel } from "./schedule-settings";

const shiftLabel = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;
const WHOLE_DAY: Record<ApplicationStatus, [string, string]> = {
  placed: ["已排入", "tone-ok"],
  rest: ["改成休息日（不扣假）", "tone-ok"],
  unplaced: ["未排入", "tone-warn"],
};
const sessionText = (status: SessionStatus, useLeave: boolean): [string, string] =>
  status === "scheduled"
    ? ["仍排班", "tone-warn"]
    : status === "rest"
      ? ["改成休息（不扣假）", "tone-ok"]
      : [useLeave ? "照申請請假" : "照希望沒排", "tone-ok"];

/**
 * 一位助理一個月的排班結果：工時（跟診／機動／請假，對照正常工時與目標）、排休申請與指定診次的結果、
 * 改成休息日省下的假。助理頁、待確認頁與管理者的「排班結果」頁共用；不顯示事由。
 * 跟診、機動分開只給管理者（`showFlex`）；助理看到合在一起的「上班」（使用者 2026-10-31：助理不用知道哪些是補工時多排的）。
 */
export function ScheduleResultCard({ result, title, showFlex = false }: { result: ScheduleResult; title?: string; showFlex?: boolean }) {
  const hours = (minutes: number) => `${formatHours(minutes)} 小時`;
  const total = result.wholeDay.length + result.sessions.length;
  const cardRef = useRef<HTMLElement>(null);
  const heading = title ?? `${fullMonthLabel(result.month)}排班結果`;
  return (
    <section ref={cardRef} className="result-card" aria-label={heading}>
      <div className="result-card-head">
        <h3>{heading}</h3>
        <SaveImageButton target={cardRef} fileName={heading.replace(/[・\s]/g, "_")} />
      </div>
      <dl className="result-hours">
        {showFlex ? (
          <>
            <div><dt>跟診</dt><dd>{hours(result.followMinutes)}</dd></div>
            <div><dt>機動</dt><dd>{hours(result.flexMinutes)}</dd></div>
          </>
        ) : (
          <div><dt>上班</dt><dd>{hours(result.followMinutes + result.flexMinutes)}</dd></div>
        )}
        <div><dt>請假</dt><dd>{hours(result.leaveMinutes)}</dd></div>
        <div className="is-total"><dt>合計</dt><dd>{hours(result.paidMinutes)}</dd></div>
      </dl>
      {result.normalMinutes !== undefined && (
        <p className="result-line">
          本月正常工時 {hours(result.normalMinutes)}
          {result.target && `（目標 ${formatHours(Math.min(result.target.minMinutes, result.target.maxMinutes))}～${formatHours(Math.max(result.target.minMinutes, result.target.maxMinutes))} 小時）`}；
          {result.belowNormalMinutes > 0 ? `比正常工時少排 ${hours(result.belowNormalMinutes)}。` : "已達正常工時。"}
        </p>
      )}
      {result.restMinutes > 0 && (
        <p className="result-benefit">
          配合排休申請，改成休息日（不扣假）{result.restDays > 0 ? `${result.restDays} 天，` : ""}共 {hours(result.restMinutes)}，這些時數不用請假。
        </p>
      )}
      {total === 0 ? (
        <p className="assistant-empty">這個月沒有排休申請或指定診次。</p>
      ) : (
        <ul className="result-list">
          {result.wholeDay.map((item) => {
            const [text, tone] = WHOLE_DAY[item.status];
            return (
              <li key={`d-${item.date}`}>
                <span>{formatDay(item.date)}・整天・{item.leaveType}</span>
                <span className={`status-badge ${tone}`}>{text}</span>
              </li>
            );
          })}
          {result.sessions.map((item) => {
            const [text, tone] = sessionText(item.status, !!item.leaveType);
            return (
              <li key={`s-${item.date}-${item.shiftId}`}>
                <span>{formatDay(item.date)}・{shiftLabel(item.shiftId)}・{item.leaveType ?? "不用假（希望不排）"}</span>
                <span className={`status-badge ${tone}`}>{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
