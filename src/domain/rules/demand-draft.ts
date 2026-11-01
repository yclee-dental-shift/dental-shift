import { courseProfile } from "@/config/clinic.config";
import { formatDay } from "@/domain/dates";
import type { DemandAdjustments } from "./assistant-demand";
import {
  sessionsForMonth,
  slotsFor,
  SHIFT_KEYS,
  WEEKDAY_LABELS,
  type DoctorScheduleConfig,
  type DoctorSlot,
} from "./doctor-schedule";

/**
 * 「醫師與人數」整頁草稿：醫師班表與人數手動調整先改在草稿，按「儲存」才寫入。
 * 這裡比對草稿和上次儲存的內容，列出還沒儲存的修改；改回原樣的項目自然消失。
 */
export interface DraftChange {
  key: string;
  /** 跟某一天有關的修改；長期設定（固定班版本、行事曆範圍）沒有日期。 */
  date?: string;
  text: string;
}

const nameOf = (personId: string) =>
  (courseProfile.people.find((person) => person.id === personId)?.displayName ?? personId).replace(/醫師$/, "");
const shiftLabel = (shiftId: string) => courseProfile.shifts.find((shift) => shift.id === shiftId)?.label ?? shiftId;
const monthLabel = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;

/** 一診醫師的差異：加、減、改約診；沒有差異回傳空字串。 */
export function describeSlotChange(before: DoctorSlot[], after: DoctorSlot[]): string {
  const added = after.filter((slot) => !before.some((item) => item.personId === slot.personId));
  const removed = before.filter((slot) => !after.some((item) => item.personId === slot.personId));
  const toggled = after.filter((slot) => before.some((item) => item.personId === slot.personId && item.limited !== slot.limited));
  const moved = after.filter((slot) => before.some((item) => item.personId === slot.personId && item.floor !== slot.floor));
  return [
    added.length > 0 && `加 ${added.map((slot) => (slot.limited ? `(${nameOf(slot.personId)})` : nameOf(slot.personId))).join("、")}`,
    removed.length > 0 && `減 ${removed.map((slot) => nameOf(slot.personId)).join("、")}`,
    ...toggled.map((slot) => `${nameOf(slot.personId)}改為${slot.limited ? "不開放" : "開放"}一般約診`),
    ...moved.map((slot) => `${nameOf(slot.personId)}${slot.floor ? `指定 ${slot.floor}F` : "位置改回依規則"}`),
  ]
    .filter(Boolean)
    .join("；");
}

/** 醫師班表的修改：單日調整、固定班、來診／加開、休診日、行事曆範圍。 */
export function describeDoctorScheduleChanges(saved: DoctorScheduleConfig, draft: DoctorScheduleConfig): DraftChange[] {
  if (saved === draft) return [];
  const changes: DraftChange[] = [];

  if (saved.firstMonth !== draft.firstMonth || saved.lastMonth !== draft.lastMonth) {
    changes.push({ key: "range", text: `行事曆範圍改為 ${monthLabel(draft.firstMonth)}～${monthLabel(draft.lastMonth)}` });
  }

  const versions = [...new Set([...saved.weekly, ...draft.weekly].map((version) => version.from))].sort();
  versions.forEach((from) => {
    const before = saved.weekly.find((version) => version.from === from);
    const after = draft.weekly.find((version) => version.from === from);
    const title = `「${monthLabel(from)}起」固定班`;
    if (!before) return changes.push({ key: `weekly-${from}`, text: `新增${title}版本` });
    if (!after) return changes.push({ key: `weekly-${from}`, text: `刪除${title}版本` });
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      SHIFT_KEYS.forEach((shiftId) => {
        const text = describeSlotChange(before.slots[weekday]?.[shiftId] ?? [], after.slots[weekday]?.[shiftId] ?? []);
        if (text) changes.push({ key: `weekly-${from}-${weekday}-${shiftId}`, text: `${title} ${WEEKDAY_LABELS[weekday]}${shiftLabel(shiftId)}：${text}` });
      });
    }
  });

  const visitIds = [...new Set([...saved.visits, ...draft.visits].map((visit) => visit.id))];
  visitIds.forEach((id) => {
    const before = saved.visits.find((visit) => visit.id === id);
    const after = draft.visits.find((visit) => visit.id === id);
    const date = (after ?? before)?.dates[0];
    if (!before) changes.push({ key: `visit-${id}`, date, text: `新增來診／加開「${after!.label}」` });
    else if (!after) changes.push({ key: `visit-${id}`, date, text: `刪除來診／加開「${before.label}」` });
    else if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ key: `visit-${id}`, date, text: `修改來診／加開「${after.label}」` });
  });

  const closureDates = [...new Set([...saved.closures, ...draft.closures].map((closure) => closure.date))];
  closureDates.forEach((date) => {
    const before = saved.closures.find((closure) => closure.date === date);
    const after = draft.closures.find((closure) => closure.date === date);
    const day = formatDay(date);
    if (!before) changes.push({ key: `closure-${date}`, date, text: `${day}：設為休診（${after!.label}）` });
    else if (!after) changes.push({ key: `closure-${date}`, date, text: `${day}：取消休診` });
    else if (before.label !== after.label) changes.push({ key: `closure-${date}`, date, text: `${day}：休診原因改為「${after.label}」` });
  });

  // 單日調整：比對那一診實際的醫師（含固定班），改回原樣就不列。
  const overrideKeys = new Map(
    [...(saved.overrides ?? []), ...(draft.overrides ?? [])].map((item) => [`${item.date}_${item.shiftId}`, item]),
  );
  overrideKeys.forEach(({ date, shiftId }, key) => {
    const text = describeSlotChange(slotsFor(saved, date, shiftId), slotsFor(draft, date, shiftId));
    if (text) changes.push({ key: `override-${key}`, date, text: `${formatDay(date)} ${shiftLabel(shiftId)}：${text}` });
  });

  return sortChanges(changes);
}

const signed = (value: number) => (value === 0 ? "無" : value > 0 ? `+${value}` : `${value}`);

/** 人數手動調整的修改。key 為 `日期_班別ID`。 */
export function describeAdjustmentChanges(saved: DemandAdjustments, draft: DemandAdjustments): DraftChange[] {
  if (saved === draft) return [];
  const keys = [...new Set([...Object.keys(saved), ...Object.keys(draft)])];
  return sortChanges(
    keys.flatMap((key) => {
      const before = saved[key] ?? 0;
      const after = draft[key] ?? 0;
      if (before === after) return [];
      const [date, shiftId] = [key.slice(0, 10), key.slice(11)];
      return [{ key: `adjust-${key}`, date, text: `${formatDay(date)} ${shiftLabel(shiftId)}：人數手動調整 ${signed(before)} → ${signed(after)}` }];
    }),
  );
}

function sortChanges(changes: DraftChange[]): DraftChange[] {
  return [...changes].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** 某月有未儲存修改的日期（醫師、休診或人數調整不同），用來在月曆上標「未存」。 */
export function changedDatesInMonth(
  saved: { config: DoctorScheduleConfig; adjustments: DemandAdjustments },
  draft: { config: DoctorScheduleConfig; adjustments: DemandAdjustments },
  month: string,
): Set<string> {
  const dates = new Set<string>();
  if (saved.config !== draft.config) {
    const keyOf = (config: DoctorScheduleConfig) =>
      new Map(
        (sessionsForMonth(config, month) ?? []).map((session) => [
          `${session.date}_${session.shiftId}`,
          session.doctors.map((doctor) => `${doctor.personId}:${doctor.limitedBooking}:${doctor.floor ?? ""}`).sort().join(","),
        ]),
      );
    const before = keyOf(saved.config);
    const after = keyOf(draft.config);
    new Set([...before.keys(), ...after.keys()]).forEach((key) => {
      if (before.get(key) !== after.get(key)) dates.add(key.slice(0, 10));
    });
    const closed = (config: DoctorScheduleConfig) =>
      new Map(config.closures.filter((closure) => closure.date.startsWith(month)).map((closure) => [closure.date, closure.label]));
    const closedBefore = closed(saved.config);
    const closedAfter = closed(draft.config);
    new Set([...closedBefore.keys(), ...closedAfter.keys()]).forEach((date) => {
      if (closedBefore.get(date) !== closedAfter.get(date)) dates.add(date);
    });
  }
  new Set([...Object.keys(saved.adjustments), ...Object.keys(draft.adjustments)]).forEach((key) => {
    if (key.startsWith(month) && (saved.adjustments[key] ?? 0) !== (draft.adjustments[key] ?? 0)) dates.add(key.slice(0, 10));
  });
  return dates;
}
