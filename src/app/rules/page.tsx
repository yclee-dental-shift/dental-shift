"use client";

import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE, laborRules, workdaysByMonth } from "@/config/labor.config";
import { REASON_MAX_LENGTH, reasonCategories } from "@/config/leave-reason.config";
import { leaveTypes, leaveWindow } from "@/config/leave.config";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import { ManagerOnly } from "@/components/ManagerOnly";
import { LIMITED_BOOKING_RULES, SESSION_EXCLUSION_RULES } from "@/config/doctors";

const shiftLabel = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;

/** 目前的排班規則整理（只能看）。數字寫在 src/config/，要改請找系統負責人。 */
function RulesContent() {
  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>設定</h1>
      <p className="page-intro">目前使用中的排班規則。這裡只能看；要調整請告訴系統負責人修改程式設定。</p>

      <section className="info-card">
        <h2>診別時段</h2>
        <p className="assistant-hint">助理實際上班時間。</p>
        <div className="list-group">
          {courseProfile.shifts.map((shift) => (
            <div key={shift.id} className="list-row">
              <span className={`shift-dot dot-${shift.id}`} aria-hidden="true" />
              <strong className="list-row-title">{shift.label}</strong>
              <span className="list-row-value">{shift.start}–{shift.end}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="info-card">
        <h2>醫師班表自動規則</h2>
        <ul className="rule-bullets">
          {[...SESSION_EXCLUSION_RULES, ...LIMITED_BOOKING_RULES].map((rule) => <li key={rule.label}>{rule.label}</li>)}
          <li>單日調整優先於固定班、專科醫師來診與上面的規則。</li>
        </ul>
      </section>

      <section className="info-card">
        <h2>排休時程</h2>
        <dl className="rule-list">
          <dt>人數發布、長假（同月 {leaveWindow.longLeaveMinDays} 天以上）開放</dt><dd>前 {leaveWindow.longLeaveOpenMonthsBefore} 個月的 1 日（開始準備：再前 {leaveWindow.prepareDaysBefore} 天）</dd>
          <dt>一般排休</dt><dd>排班前 {leaveWindow.generalLeaveDays} 天，共 {leaveWindow.generalLeaveDays} 天</dd>
          <dt>排班</dt><dd>排休截止後 {leaveWindow.schedulingDays} 天</dd>
          <dt>預公告</dt><dd>正式公告前 {leaveWindow.confirmDays} 天（助理確認到隔天下班）</dd>
          <dt>正式公告</dt><dd>前 {leaveWindow.publishMonthsBefore} 個月的 1 日</dd>
          <dt>說明</dt><dd>都是日曆天，不扣假日；每個月可在排班工作台「班表日程」個別調整</dd>
          <dt>其他條件</dt><dd>該月助理人數由管理者發布後才開放；沒有醫師看診的日子不能申請排休</dd>
        </dl>
      </section>

      <section className="info-card">
        <h2>假別與理由</h2>
        <dl className="rule-list">
          <dt>假別</dt>
          <dd className="chip-row">{leaveTypes.map((type) => <span key={type} className="month-tag tag-pre-leave">{type}</span>)}</dd>
          <dt>理由大項目</dt>
          <dd className="chip-row">{reasonCategories.map((category) => <span key={category.id} className="status-badge tone-muted">{category.id}</span>)}</dd>
          <dt>文字理由</dt><dd>最多 {REASON_MAX_LENGTH} 字；只有本人與管理者看得到</dd>
        </dl>
      </section>

      <section className="info-card">
        <h2>工時（四週變形工時）</h2>
        <dl className="rule-list">
          <dt>每日正常工時上限</dt><dd>{laborRules.dailyMaxMinutes / 60} 小時</dd>
          <dt>每月正常工時</dt><dd>應上班天數 × {laborRules.hoursPerWorkday} 小時</dd>
          <dt>每月加班上限</dt><dd>{laborRules.monthlyOvertimeHours} 小時（只提醒；一鍵排班不排加班）</dd>
          <dt>休息日</dt><dd>每四週至少 {laborRules.restDaysPerFourWeeks} 天；每兩週至少 {laborRules.restDaysPerTwoWeeks} 天例假</dd>
          <dt>請假時數</dt><dd>有假別的排休每天算 {laborRules.leaveHoursPerDay} 小時，含在每月工時裡（上班＋請假不超過正常工時）</dd>
          <dt>目標工時</dt><dd>預設比正常工時少 {laborRules.targetBelowNormalHours.max}～{laborRules.targetBelowNormalHours.min} 小時，可在排班步驟逐月調整</dd>
          <dt>補工時（機動）</dt><dd>一鍵排班補齊需求後，幫還沒到目標下限的人加排「{FLEX_SHIFT_NOTE}」，補到目標內就停；工時最少的人先排，優先接在當天已排的診前後</dd>
        </dl>
        <div className="table-scroll">
          <table className="info-table workdays-table">
            <thead>
              <tr><th scope="col">月份</th>{Object.keys(workdaysByMonth).map((month) => <th scope="col" key={month}>{Number(month.slice(5))} 月</th>)}</tr>
            </thead>
            <tbody>
              <tr><th scope="row">應上班天數</th>{Object.entries(workdaysByMonth).map(([month, days]) => <td key={month}>{days}</td>)}</tr>
              <tr><th scope="row">正常工時</th>{Object.entries(workdaysByMonth).map(([month, days]) => <td key={month}>{days * laborRules.hoursPerWorkday}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="info-card">
        <h2>一鍵排班偏好</h2>
        <dl className="rule-list">
          <dt>一天三診</dt><dd>{schedulingPreferences.avoidTripleShift ? "盡量不排" : "不限制"}</dd>
          <dt>連續兩天三診</dt><dd>{schedulingPreferences.avoidConsecutiveTripleDays ? "盡量不排" : "不限制"}</dd>
          <dt>{shiftLabel(schedulingPreferences.eveningShiftId)}最多連續</dt><dd>{schedulingPreferences.maxConsecutiveEvenings} 天</dd>
          <dt>兩頭班（早＋晚空午）</dt>
          <dd>可以排，先排連續的班；要排時挑這個月最少的人、不排連續兩天、不集中在同一個星期幾；每人每週最多 {schedulingPreferences.maxSplitDaysPerWeek} 天</dd>
          <dt>排不滿時</dt><dd>才放寬偏好，挑次數最少的人；「指定診次不排」最後才排入</dd>
        </dl>
      </section>
    </main>
  );
}

export default function RulesPage() {
  return (
    <ManagerOnly>
      <RulesContent />
    </ManagerOnly>
  );
}
