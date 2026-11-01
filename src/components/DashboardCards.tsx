"use client";

import Link from "next/link";
import { useMemo } from "react";
import { courseProfile } from "@/config/clinic.config";
import { FLEX_SHIFT_NOTE } from "@/config/labor.config";
import { isLearnerEntry } from "@/domain/rules/ability-schedule";
import { schedulingPreferences } from "@/config/scheduling-preferences";
import { formatDay } from "@/domain/dates";
import type { SessionDemand } from "@/domain/rules/assistant-demand";
import { dayStatus, type DayStatus, type DeadlineItem } from "@/domain/rules/dashboard";
import { formatHours } from "@/domain/rules/labor-hours";
import { TIMELINE_LABELS } from "@/domain/rules/month-timeline";
import type { PublicationStatus } from "@/domain/rules/publication";
import {
  personScheduleStats,
  statsAverage,
  statsFlags,
  type PersonScheduleStats,
  type StatKey,
} from "@/domain/rules/schedule-stats";
import type { ShiftRequests } from "@/domain/rules/shift-request";
import type { ScheduleEntry } from "@/domain/types";
import { StatusBadge, type Tone } from "./OwnerOverview";
import { DayScroller, scrollerDates } from "./DayScroller";
import { ASSISTANT_NAMES, ASSISTANTS, clinicDayOf, FIRST_DAY, fullMonthLabel, LABOR_SETTINGS } from "./schedule-settings";

const SHIFT_IDS = courseProfile.shifts.map((shift) => shift.id);
const nameOf = (id: string) => ASSISTANT_NAMES.get(id) ?? id;
const isAssistant = (id: string) => ASSISTANT_NAMES.has(id);

const DAY_STATUS_TEXT: Record<DayStatus, string> = { closed: "休診", empty: "未排", short: "缺人", ok: "人夠" };
const PUBLICATION_TEXT: Record<PublicationStatus, { text: string; tone: Tone }> = {
  draft: { text: "排班中", tone: "muted" },
  preannounced: { text: "預公告", tone: "warn" },
  published: { text: "已公告", tone: "ok" },
};

/** 每天卡：上方一週日期（圓點＝那天的人力），下方選定那天每一診誰上班。只顯示上班／休，不顯示假別。 */
export function DayCard({
  day,
  onPick,
  entries,
  demandsOf,
  publicationOf,
}: {
  day: string;
  onPick(date: string): void;
  entries: ScheduleEntry[];
  demandsOf(date: string): SessionDemand[];
  publicationOf(month: string): PublicationStatus;
}) {
  const sessionsOf = (date: string, shiftId: string) =>
    entries.filter((entry) => entry.date === date && entry.state === "shift" && entry.shiftId === shiftId && isAssistant(entry.personId));
  // 已排人數和月班表「已排／需求」同一套：算機動、不算帶新手 +1（使用者 2026-10-30）。
  const placed = (demand: SessionDemand) =>
    sessionsOf(demand.date, demand.shiftId).filter((entry) => !isLearnerEntry(entry)).length;
  const demands = demandsOf(day);
  const clinic = clinicDayOf(day);
  const off = entries.filter((entry) => entry.date === day && entry.state === "leave" && isAssistant(entry.personId)).map((entry) => nameOf(entry.personId));
  const publication = PUBLICATION_TEXT[publicationOf(day.slice(0, 7))];

  // 日期帶：2027/1/1 到選定那天往後半年，可以連續左右捲動。
  const scrollDates = useMemo(() => scrollerDates(FIRST_DAY, day, 6), [day]);

  return (
    <section className="pending-card dash-card" aria-label="每天">
      <h2>
        {formatDay(day)}
        <StatusBadge {...publication} />
        <small className="dash-card-link"><Link href="/schedule">看班表 ›</Link></small>
      </h2>
      <DayScroller
        dates={scrollDates}
        selected={day}
        className="dash-week"
        daysClassName="dash-week-days"
        navClassName="button button-quiet"
        label="選擇日期（可左右捲動）"
        renderDay={(date, near) => {
          const status = date < FIRST_DAY ? "closed" : near ? dayStatus(demandsOf(date), placed) : "empty";
          return (
            <button
              key={date}
              className={`dash-day ${date === day ? "is-active" : ""}`}
              disabled={date < FIRST_DAY}
              aria-pressed={date === day}
              aria-label={`${formatDay(date)}：${DAY_STATUS_TEXT[status]}`}
              title={DAY_STATUS_TEXT[status]}
              onClick={() => onPick(date)}
            >
              <small>{formatDay(date).split(" ")[1]?.slice(1)}</small>
              <strong>{Number(date.slice(8))}</strong>
              <i className={`dash-dot is-${status}`} aria-hidden="true" />
            </button>
          );
        }}
      />
      <p className="dash-legend" aria-hidden="true">
        <span><i className="dash-dot is-ok" />人夠</span>
        <span><i className="dash-dot is-short" />缺人</span>
        <span><i className="dash-dot is-empty" />未排</span>
      </p>
      {demands.length === 0 ? (
        <p className="pending-empty">{clinic.open ? "這天沒有醫師看診。" : `休診（${clinic.label}）`}</p>
      ) : (
        <ul className="dash-sessions">
          {demands.map((demand) => {
            const shift = courseProfile.shifts.find((item) => item.id === demand.shiftId);
            const people = sessionsOf(demand.date, demand.shiftId);
            const regular = people.filter((entry) => entry.note !== FLEX_SHIFT_NOTE).map((entry) => nameOf(entry.personId));
            const flex = people.filter((entry) => entry.note === FLEX_SHIFT_NOTE).map((entry) => nameOf(entry.personId));
            const count = placed(demand);
            const tone: Tone = count === 0 ? "muted" : count < demand.total ? "alert" : "ok";
            return (
              <li key={demand.shiftId}>
                <div className="pending-main">
                  <strong>
                    {demand.shiftLabel}
                    <small>{shift ? ` ${shift.start}–${shift.end}` : ""}・醫師 {demand.doctorIds.length} 位</small>
                  </strong>
                  <small>{regular.length > 0 ? regular.join("、") : "還沒排助理"}{flex.length > 0 ? `；機動：${flex.join("、")}` : ""}</small>
                </div>
                <StatusBadge text={`${count}／${demand.total} 人`} tone={tone} />
              </li>
            );
          })}
        </ul>
      )}
      {off.length > 0 && <p className="dash-off">休：{off.join("、")}</p>}
    </section>
  );
}

/** 近期期限：班表日程裡 14 天內到期或已延遲的項目。 */
export function DeadlineCard({ items, hrefOf }: { items: DeadlineItem[]; hrefOf(month: string): string }) {
  const badge = (item: DeadlineItem): { text: string; tone: Tone } =>
    item.state === "late"
      ? { text: `延遲 ${-item.daysLeft} 天`, tone: "alert" }
      : item.daysLeft === 0
        ? { text: "今天", tone: "warn" }
        : { text: `還有 ${item.daysLeft} 天`, tone: item.daysLeft <= 3 ? "warn" : "muted" };
  return (
    <section className="pending-card dash-card" aria-label="近期期限">
      <h2>
        近期期限
        <small>班表日程，14 天內</small>
      </h2>
      {items.length === 0 ? (
        <p className="pending-empty">14 天內沒有到期的事。</p>
      ) : (
        <ul className="pending-list">
          {items.map((item) => (
            <li key={`${item.month}-${item.key}`}>
              <div className="pending-main">
                <strong>{TIMELINE_LABELS[item.key]}</strong>
                <small>{fullMonthLabel(item.month)}班表・{formatDay(item.date)}</small>
              </div>
              <div className="pending-badges">
                <StatusBadge {...badge(item)} />
              </div>
              <Link className="button button-quiet" href={hrefOf(item.month)}>前往</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function useMonthStats(entries: ScheduleEntry[], month: string, requests: ShiftRequests) {
  return useMemo(
    () =>
      ASSISTANTS.map((person) =>
        personScheduleStats(entries, person.id, month, LABOR_SETTINGS, {
          requests,
          flexNote: FLEX_SHIFT_NOTE,
          eveningShiftId: schedulingPreferences.eveningShiftId,
        }),
      ),
    [entries, month, requests],
  );
}

/** 本月工時：全部助理合計，分跟診／機動／請假；幾人在目標內。 */
export function HoursCard({
  month,
  entries,
  requests,
  target,
}: {
  month: string;
  entries: ScheduleEntry[];
  requests: ShiftRequests;
  target?: { minMinutes: number; maxMinutes: number };
}) {
  const rows = useMonthStats(entries, month, requests);
  const sum = (pick: (row: PersonScheduleStats) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const parts = [
    { key: "clinical", label: "跟診", minutes: sum((row) => row.clinical.minutes) },
    { key: "flex", label: "機動", minutes: sum((row) => row.flex.minutes) },
    { key: "leave", label: "請假", minutes: sum((row) => row.annualLeave.minutes + row.otherLeave.minutes) },
  ];
  const total = parts.reduce((value, part) => value + part.minutes, 0);
  const scheduled = rows.filter((row) => row.clinical.count + row.flex.count > 0);
  const under = target ? scheduled.filter((row) => row.totalMinutes < target.minMinutes).length : 0;
  const over = target ? scheduled.filter((row) => row.totalMinutes > target.maxMinutes).length : 0;

  return (
    <section className="pending-card dash-card" aria-label="本月工時">
      <h2>
        本月工時
        <small>{fullMonthLabel(month)}・{ASSISTANTS.length} 位助理合計</small>
      </h2>
      {total === 0 ? (
        <p className="pending-empty">這個月還沒排班。</p>
      ) : (
        <>
          <p className="dash-total">
            <strong>{formatHours(total)}</strong> 小時
          </p>
          <span className="dash-bar" aria-hidden="true">
            {parts.map((part) => part.minutes > 0 && <i key={part.key} className={`is-${part.key}`} style={{ flexGrow: part.minutes }} />)}
          </span>
          <p className="dash-legend">
            {parts.map((part) => (
              <span key={part.key}><i className={`dash-swatch is-${part.key}`} aria-hidden="true" />{part.label} {formatHours(part.minutes)}</span>
            ))}
          </p>
          {target && (
            <div className="pending-badges dash-target">
              <span>目標 {formatHours(target.minMinutes)}～{formatHours(target.maxMinutes)} 小時：</span>
              <StatusBadge text={`達標 ${scheduled.length - under - over} 人`} tone="ok" />
              {under > 0 && <StatusBadge text={`不足 ${under} 人`} tone="warn" />}
              {over > 0 && <StatusBadge text={`超過 ${over} 人`} tone="alert" />}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const FAIRNESS_KEYS: Array<{ key: StatKey; label: string; value(row: PersonScheduleStats): number; average(avg: ReturnType<typeof statsAverage>): number; unit: string }> = [
  { key: "maxEveningStreak", label: "連續晚診", value: (row) => row.maxEveningStreak, average: (avg) => avg.maxEveningStreak, unit: "天" },
  { key: "splitDays", label: "兩頭班", value: (row) => row.splitDays, average: (avg) => avg.splitDays, unit: "天" },
  { key: "tripleDays", label: "三診", value: (row) => row.tripleDays, average: (avg) => avg.tripleDays, unit: "天" },
  { key: "evenings", label: "晚診", value: (row) => row.evenings, average: (avg) => avg.evenings, unit: "次" },
  { key: "saturdaysYear", label: "週六（今年）", value: (row) => row.saturdaysYear, average: (avg) => avg.saturdaysYear, unit: "次" },
];

/** 公平度：排班統計裡比平均多很多（橘）或超過規定（紅）的人，和排班統計同一套標準。 */
export function FairnessCard({ month, entries, requests }: { month: string; entries: ScheduleEntry[]; requests: ShiftRequests }) {
  const rows = useMonthStats(entries, month, requests);
  const average = statsAverage(rows, SHIFT_IDS);
  const items = rows
    .flatMap((row) => {
      const flags = statsFlags(row, average, { maxConsecutiveEvenings: schedulingPreferences.maxConsecutiveEvenings });
      return FAIRNESS_KEYS.filter((item) => flags.has(item.key)).map((item) => ({
        key: `${row.personId}-${item.key}`,
        name: nameOf(row.personId),
        label: item.label,
        text: `${item.value(row)} ${item.unit}（平均 ${item.average(average).toFixed(1)}）`,
        tone: flags.get(item.key) as "warn" | "alert",
      }));
    })
    .sort((a, b) => Number(b.tone === "alert") - Number(a.tone === "alert"));

  return (
    <section className="pending-card dash-card" aria-label="公平度">
      <h2>
        公平度
        <small className="dash-card-link"><Link href="/schedule">看排班統計 ›</Link></small>
      </h2>
      {average.count === 0 ? (
        <p className="pending-empty">這個月還沒排班。</p>
      ) : items.length === 0 ? (
        <p className="pending-empty">這個月的晚診、兩頭班、三診、週六都很平均。</p>
      ) : (
        <ul className="pending-list dash-fairness">
          {items.map((item) => (
            <li key={item.key}>
              <div className="pending-main">
                <strong>{item.name}</strong>
                <small>{item.label} {item.text}</small>
              </div>
              <StatusBadge text={item.tone === "alert" ? "超過規定" : "偏多"} tone={item.tone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
