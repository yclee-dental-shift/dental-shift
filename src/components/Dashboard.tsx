"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { courseProfile, doctorDefaultFloors, doctorWeekdayFloors, pediatricDoctorIds } from "@/config/clinic.config";
import { nowString, todayString } from "@/domain/dates";
import { evaluateSessionDemand } from "@/domain/rules/assistant-demand";
import { sessionFloorMap } from "@/domain/rules/doctor-schedule";
import { upcomingDeadlines } from "@/domain/rules/dashboard";
import { abilityFor } from "@/domain/rules/ability";
import { abilityIssueCounts } from "@/domain/rules/ability-schedule";
import { summarizeMonth, targetRange } from "@/domain/rules/labor-hours";
import { isPreLeave, monthSchedule } from "@/domain/rules/leave-window";
import { timelineFor, timelineStates } from "@/domain/rules/month-timeline";
import { summarizeResponses } from "@/domain/rules/publication";
import { currentStep, demandMismatches, effectiveReleasedAt, phaseOf, stepTitle, WORKFLOW_PHASES, type WorkflowStepId } from "@/domain/rules/workflow";
import { AssistantView } from "./AssistantView";
import { DayCard, DeadlineCard, FairnessCard, HoursCard } from "./DashboardCards";
import { PendingCard, StatCards, StatusBadge, type OverviewCard, type OverviewItem } from "./OwnerOverview";
import { useLaborTargets } from "./useLaborTargets";
import { useAbilities } from "./useAbilities";
import { trainingIssueCount, useTrainingPlans } from "./TrainingPanel";
import { targetWishImpact } from "@/domain/rules/training-wish";
import { sessionDoctorIds } from "@/domain/rules/shift-task";
import { monthSupervisorIssues, useDutySupervisors } from "./DutySupervisorPanel";
import { useSchedule } from "./ScheduleProvider";
import { useDemandAdjustments } from "./useDemandAdjustments";
import { useDemandApprovals } from "./useDemandApprovals";
import { useDoctorSchedule } from "./useDoctorSchedule";
import { useLeaveWindow } from "./useLeaveWindow";
import { usePublications } from "./usePublications";
import { useReviewTodos } from "./useReviewTodos";
import { useScheduleReviews } from "./useScheduleReviews";
import { useShiftRequests } from "./useShiftRequests";
import { useViewer } from "./ViewerProvider";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  ASSISTANT_IDS,
  clampDay,
  clampMonth,
  FIRST_MONTH,
  fullMonthLabel,
  LABOR_SETTINGS,
  monthDates,
  shiftMonth as addMonths,
  shortDate,
} from "./schedule-settings";

const BASE_STAFFING_RULES = { pediatricDoctorIds, defaultFloors: doctorDefaultFloors, weekdayFloors: doctorWeekdayFloors };
/** 「各月進度」列出這個月起的幾個月（長假開放＝前 4 個月，所以看到第 5 個月）。 */
const PROGRESS_MONTHS = 5;
/** 「近期期限」列出幾天內到期的日程。 */
const DEADLINE_DAYS = 14;

/** 到排班工作台某個月份的某一步。 */
const SHIFT_IDS = courseProfile.shifts.map((shift) => shift.id);
const DOCTOR_SET = new Set(courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id));

export function workbenchHref(month: string, step?: WorkflowStepId) {
  return `/workbench?month=${month}${step ? `&step=${step}` : ""}`;
}

/** 這一步在第幾段（1～5，WORKFLOW_PHASES）。 */
const phaseNumber = (step: WorkflowStepId) => WORKFLOW_PHASES.findIndex((phase) => phase.id === phaseOf(step).id) + 1;
const timeText = (value?: string) => (value ? `${shortDate(value.slice(0, 10))} ${value.slice(11)}` : "");

/** 總覽（最高管理者、排班者的首頁）：只看狀況，點了到排班工作台處理。 */
function DashboardBoard({ isOwner }: { isOwner: boolean }) {
  const today = todayString();
  const month = clampMonth(today.slice(0, 7));
  // 每天卡選的日子；班表從 FIRST_MONTH 開始，今天更早時先看第一天。
  const [day, setDay] = useState(() => clampDay(today));
  const { targets: laborTargets } = useLaborTargets();
  const { entries } = useSchedule();
  const abilities = useAbilities();
  const trainingPlans = useTrainingPlans();
  const dutySupervisors = useDutySupervisors();
  const { requests } = useShiftRequests();
  const { approvals } = useDemandApprovals();
  const { publications, publicationOf } = usePublications();
  const { adjustments } = useDemandAdjustments();
  const { settings: leaveWindow } = useLeaveWindow();
  const { reviews } = useScheduleReviews();
  const reviewTodos = useReviewTodos();
  const doctorConfig = useDoctorSchedule();
  const staffingRules = useMemo(() => ({ ...BASE_STAFFING_RULES, sessionFloors: sessionFloorMap(doctorConfig) }), [doctorConfig]);
  const demandsOf = (target: string) =>
    evaluateSessionDemand(entries, courseProfile.people, monthDates(target), courseProfile.shifts, staffingRules, adjustments);

  // 各月目前停在第幾步（和工作台流程列同一套推算）。
  const progress = Array.from({ length: PROGRESS_MONTHS }, (_, index) => addMonths(month, index)).map((target) => {
    const approval = approvals[target];
    const publication = publicationOf(target).status;
    const timeline = timelineFor(target, leaveWindow);
    const released = !!effectiveReleasedAt(approval, today, timeline.release);
    // 日程卡的完成狀態（和工作台「班表日程」同一套）。
    const states = timelineStates(timeline, today, {
      prepared: !!approval && (approval.status !== "returned" || released),
      released,
      preannounced: publication !== "draft",
      published: publication === "published",
    });
    const step = currentStep({
      demandStatus: approval?.status,
      demandReleased: released,
      demandMismatchCount: approval ? demandMismatches(approval, demandsOf(target)).length : 0,
      leavePhase: monthSchedule(target, today, leaveWindow).phase,
      publication,
      review: reviews[target] ?? null,
    });
    return { month: target, step, done: publication === "published", timeline, states };
  });
  const next = progress.find((item) => !item.done);
  const deadlines = upcomingDeadlines(progress, today, DEADLINE_DAYS);

  // 待確認：送審的人數、被退回的人數、預公告後助理的回覆。
  const waitingMonths = Object.values(approvals)
    .filter((approval) => approval.status === "submitted")
    .sort((a, b) => a.month.localeCompare(b.month));
  const returnedMonths = Object.values(approvals)
    .filter((approval) => approval.status === "returned" && approval.month >= month)
    .sort((a, b) => a.month.localeCompare(b.month));
  const responseSummaries = Object.values(publications)
    .filter((publication) => publication.status === "preannounced")
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((publication) => ({ publication, summary: summarizeResponses(publication, ASSISTANT_IDS, nowString()) }));
  // 能力與培訓（能力排班第 6 階段）：還沒正式公告的月份，醫師沒有可獨立的人跟、排了不會的工作、培訓沒照排。
  const abilityTodos = progress
    .filter((item) => !item.done)
    .flatMap((item) => {
      const levels = abilityFor(abilities, item.month)?.levels ?? null;
      const counts = abilityIssueCounts(entries, item.month, levels, SHIFT_IDS, DOCTOR_SET, new Set(ASSISTANT_IDS));
      const training = trainingIssueCount(trainingPlans[item.month], entries, item.month);
      // 培訓目標因為助理自己希望不排而少排（使用者 2026-10-31：負責人要看到）。
      const wishLost = (trainingPlans[item.month]?.targets ?? []).filter(
        (target) =>
          (targetWishImpact(target, entries, requests, item.month, (date, shiftId) => sessionDoctorIds(entries, date, shiftId), SHIFT_IDS)?.lostToWish ?? 0) > 0,
      ).length;
      const parts = [
        counts.uncovered ? `${counts.uncovered} 診醫師沒有可獨立的人跟` : "",
        counts.unable ? `${counts.unable} 人次排了能力表上不是可獨立的工作` : "",
        training ? `培訓清單 ${training} 項沒照排` : "",
        wishLost ? `${wishLost} 個培訓目標因助理希望不排而少排（能力表頁「培訓執行紀錄」）` : "",
      ].filter(Boolean);
      return parts.length ? [{ month: item.month, detail: parts.join("、") }] : [];
    });
  // 值班主管：沒有主管、指定的人沒上班（臨時請假）→ 通知助理長處理；正式公告後的月份也列。
  const supervisorTodos = progress.flatMap((item) => {
    const issues = monthSupervisorIssues(entries, item.month, dutySupervisors);
    if (issues.length === 0) return [];
    const none = issues.filter((issue) => issue.reason === "none").length;
    const away = issues.length - none;
    return [{ month: item.month, done: item.done, detail: [none ? `${none} 診沒有值班主管` : "", away ? `${away} 診指定的主管沒上班（已改由自動帶出的人）` : ""].filter(Boolean).join("、") }];
  });
  const items: OverviewItem[] = [
    ...supervisorTodos.map((todo) => ({
      key: `supervisor-${todo.month}`,
      title: `${fullMonthLabel(todo.month)} 值班主管`,
      detail: todo.detail,
      badges: [{ text: "請助理長處理", tone: "warn" as const }],
      actionLabel: "去指定",
      href: workbenchHref(todo.month, todo.done ? "publish" : "schedule"),
    })),
    ...abilityTodos.map((todo) => ({
      key: `ability-${todo.month}`,
      title: `${fullMonthLabel(todo.month)} 能力與培訓`,
      detail: todo.detail,
      badges: [{ text: "請確認", tone: "warn" as const }],
      actionLabel: "去調整",
      href: workbenchHref(todo.month, "schedule"),
    })),
    ...reviewTodos.map((todo) => ({
      key: `review-${todo.month}`,
      title: `${fullMonthLabel(todo.month)} 班表審核`,
      detail: todo.text,
      badges: [{ text: "待處理", tone: "warn" as const }],
      actionLabel: "去處理",
      href: workbenchHref(todo.month, todo.step),
    })),
    ...waitingMonths.map((approval) => ({
      key: `demand-${approval.month}`,
      title: `${fullMonthLabel(approval.month)} 助理人數`,
      detail: `${Object.keys(approval.totals).length} 診，${timeText(approval.submittedAt)} 送出`,
      badges: [isOwner ? { text: "待確認", tone: "warn" as const } : { text: "等管理者確認", tone: "muted" as const }],
      actionLabel: isOwner ? "查看並確認" : "查看",
      href: workbenchHref(approval.month, "review"),
    })),
    ...returnedMonths.map((approval) => ({
      key: `returned-${approval.month}`,
      title: `${fullMonthLabel(approval.month)} 助理人數`,
      detail: approval.returnReason ? `${approval.withdrawn ? "撤回" : "退回"}：${approval.returnReason}` : undefined,
      badges: [{ text: approval.withdrawn ? "已撤回，修改中" : "已退回，待修改", tone: "warn" as const }],
      actionLabel: "去修改",
      href: workbenchHref(approval.month, "demand"),
    })),
    ...responseSummaries.map(({ publication, summary }) => ({
      key: `publication-${publication.month}`,
      title: `${fullMonthLabel(publication.month)} 班表預公告`,
      detail: publication.confirmDeadline ? `確認期限 ${timeText(publication.confirmDeadline)}` : undefined,
      badges: [
        { text: `已確認 ${summary.confirmed.length}`, tone: "ok" as const },
        ...(summary.issues.length > 0 ? [{ text: `有問題 ${summary.issues.length}`, tone: "alert" as const }] : []),
        ...(summary.pending.length > 0 ? [{ text: `未回覆 ${summary.pending.length}`, tone: "warn" as const }] : []),
        ...(summary.expired.length > 0 ? [{ text: `逾期視同接受 ${summary.expired.length}`, tone: "muted" as const }] : []),
      ],
      actionLabel: "查看",
      href: workbenchHref(publication.month, "confirm"),
    })),
  ];

  // 數字卡：只算這個月；上個月早於 FIRST_MONTH 時沒有資料可比。
  const monthMetrics = (target: string) => ({
    short: demandsOf(target).filter((demand) => demand.scheduled < demand.total).length,
    preLeave: entries.filter((entry) => isPreLeave(entry) && entry.date.startsWith(target)).length,
    over: ASSISTANT_IDS.filter((id) => {
      const summary = summarizeMonth(entries, id, target, LABOR_SETTINGS, requests);
      return summary.normalCapMinutes !== undefined && summary.paidMinutes > summary.normalCapMinutes;
    }).length,
  });
  const previousMonth = addMonths(month, -1);
  const current = monthMetrics(month);
  const previous = previousMonth >= FIRST_MONTH ? monthMetrics(previousMonth) : null;
  const compareText = (key: keyof typeof current) => {
    if (!previous) return "上月無資料";
    const diff = current[key] - previous[key];
    return `上月 ${previous[key]}・${diff === 0 ? "持平" : diff > 0 ? `多 ${diff}` : `少 ${-diff}`}`;
  };
  const cards: OverviewCard[] = [
    {
      label: "待確認",
      value: waitingMonths.length + responseSummaries.reduce((sum, { summary }) => sum + summary.issues.length, 0),
      unit: "件",
      tone: "warn",
      hint: "送審人數＋助理提出的問題",
    },
    { label: "本月缺人診次", value: current.short, unit: "診", tone: "alert", hint: "已排助理少於需求", compare: compareText("short"), href: workbenchHref(month) },
    { label: "已申請排休", value: current.preLeave, unit: "天", tone: "warn", hint: "本月助理排休合計", compare: compareText("preLeave"), href: "/schedule" },
    {
      label: "工時超標",
      value: current.over,
      unit: "人",
      tone: "alert",
      hint: "超過本月正常工時",
      compare: compareText("over"),
      href: workbenchHref(month),
    },
  ];

  return (
    <main className="page-shell">
      <section className="hero-row">
        <div>
          <p className="eyebrow">{courseProfile.clinicName}</p>
          <h1>總覽</h1>
          <p>{isOwner ? "最高管理者" : "排班者"}：一眼看狀況，要處理的事點進去會到排班工作台。</p>
        </div>
        {next && (
          <Link className="button dashboard-cta" href={workbenchHref(next.month, next.step)}>
            繼續 {Number(next.month.slice(5))} 月：{stepTitle(next.step)}
          </Link>
        )}
      </section>

      <section className="owner-overview print-only-hide" aria-label="總覽">
        <StatCards cards={cards} />
        <div className="dash-grid">
          <DayCard
            day={day}
            onPick={(date) => setDay(clampDay(date))}
            entries={entries}
            demandsOf={(date) => evaluateSessionDemand(entries, courseProfile.people, [date], courseProfile.shifts, staffingRules, adjustments)}
            publicationOf={(target) => publicationOf(target).status}
          />
          <PendingCard monthLabel={fullMonthLabel(month)} items={items} />
          <DeadlineCard items={deadlines} hrefOf={(target) => workbenchHref(target)} />
          <HoursCard month={month} entries={entries} requests={requests} target={targetRange(month, LABOR_SETTINGS, laborTargets[month])} />
          <FairnessCard month={month} entries={entries} requests={requests} />
          <section className="pending-card dash-card" aria-label="各月進度">
            <h2>
              各月排班進度
              <small>共 {WORKFLOW_PHASES.length} 段</small>
            </h2>
            <ul className="pending-list">
              {progress.map((item) => (
                <li key={item.month}>
                  <div className="pending-main">
                    <strong>{fullMonthLabel(item.month)}</strong>
                    <small>{item.done ? "已正式公告" : stepTitle(item.step)}</small>
                  </div>
                  <div className="pending-badges">
                    <span className="progress-dots" aria-hidden="true">
                      {WORKFLOW_PHASES.map((phase, index) => (
                        <i key={phase.id} className={item.done || index < phaseNumber(item.step) - 1 ? "is-done" : index === phaseNumber(item.step) - 1 ? "is-now" : undefined} />
                      ))}
                    </span>
                    {item.done && <StatusBadge text="完成" tone="ok" />}
                  </div>
                  <Link className="button button-quiet" href={workbenchHref(item.month, item.done ? undefined : item.step)}>
                    {item.done ? "查看" : "前往"}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

const noopSubscribe = () => () => {};

/** 首頁：管理者、排班者看總覽；助理看自己的頁面（模擬身分，非登入）。資料只在瀏覽器，所以只在瀏覽器端繪製。 */
export function Dashboard() {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { viewer } = useViewer();
  if (!isClient) {
    return (
      <main className="page-shell">
        <LoadingSpinner label="載入中…" />
      </main>
    );
  }
  const assistant = courseProfile.people.find((person) => person.id === viewer);
  if (assistant) return <AssistantView key={assistant.id} person={assistant} tab="schedule" />;
  return <DashboardBoard key={viewer} isOwner={viewer === "owner"} />;
}
