import { describe, expect, it } from "vitest";
import { defaultDoctorSchedule } from "@/config/doctor-schedule-2027";
import {
  changedDatesInMonth,
  describeAdjustmentChanges,
  describeDoctorScheduleChanges,
  describeSlotChange,
} from "@/domain/rules/demand-draft";
import { addWeeklyVersion, setClosure, setDayOverride, slotsFor, setWeeklySlots } from "@/domain/rules/doctor-schedule";

const saved = defaultDoctorSchedule();

describe("demand draft changes", () => {
  it("has no changes for the same config", () => {
    expect(describeDoctorScheduleChanges(saved, saved)).toEqual([]);
    expect(describeDoctorScheduleChanges(saved, structuredClone(saved))).toEqual([]);
  });

  it("lists a day override and drops it when toggled back", () => {
    const date = "2027-01-05";
    const before = slotsFor(saved, date, "morning");
    const extra = before.some((slot) => slot.personId === "0008") ? "0009" : "0008";
    const added = setDayOverride(saved, date, "morning", [...before, { personId: extra, limited: false }]);
    const changes = describeDoctorScheduleChanges(saved, added);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ date });
    expect(changes[0].text).toContain("加");
    const back = setDayOverride(added, date, "morning", before);
    expect(describeDoctorScheduleChanges(saved, back)).toEqual([]);
    expect([...changedDatesInMonth({ config: saved, adjustments: {} }, { config: added, adjustments: {} }, "2027-01")]).toEqual([date]);
  });

  it("lists closures, weekly versions and weekly slots", () => {
    const closed = setClosure(saved, "2027-01-20", "颱風停診");
    expect(describeDoctorScheduleChanges(saved, closed).map((change) => change.text)).toEqual(["1/20 週三：設為休診（颱風停診）"]);
    const version = addWeeklyVersion(saved, "2027-06");
    expect(describeDoctorScheduleChanges(saved, version).map((change) => change.text)).toEqual(["新增「2027 年 6 月起」固定班版本"]);
    const from = saved.weekly[0].from;
    const weekly = setWeeklySlots(saved, from, 2, "morning", []);
    const texts = describeDoctorScheduleChanges(saved, weekly).map((change) => change.text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("週二早診：減");
  });

  it("lists adjustment changes and ignores equal values", () => {
    expect(describeAdjustmentChanges({}, { "2027-01-05_morning": 1 }).map((change) => change.text)).toEqual([
      "1/5 週二 早診：人數手動調整 無 → +1",
    ]);
    expect(describeAdjustmentChanges({ "2027-01-05_morning": 1 }, { "2027-01-05_morning": 1 })).toEqual([]);
  });

  it("describes doctor slot differences", () => {
    expect(describeSlotChange([{ personId: "0001", limited: false }], [{ personId: "0001", limited: true }])).toBe(
      "林志明改為不開放一般約診",
    );
  });
});
