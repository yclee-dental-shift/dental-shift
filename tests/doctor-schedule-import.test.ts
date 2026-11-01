import { describe, expect, it } from "vitest";
import { courseProfile } from "@/config/clinic.config";
import { LIMITED_BOOKING_NOTE } from "@/config/doctors";
import { closures2026_10, doctorSessions2026_10 } from "./fixtures/doctor-schedule-2026-10";
import { planAutoSchedule } from "@/domain/rules/auto-schedule";
import { planDoctorScheduleImport, planDoctorScheduleReload, planDoctorSync } from "@/domain/rules/doctor-schedule-import";
import { evaluateAssistantCoverage } from "@/domain/rules/assistant-coverage";
import type { ScheduleEntry } from "@/domain/types";

const doctorIds = new Set(
  courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id),
);

describe("October 2026 doctor schedule data", () => {
  it("only references doctors in the roster", () => {
    const referenced = doctorSessions2026_10.flatMap((session) => session.doctors.map((doctor) => doctor.personId));
    expect(referenced.every((id) => doctorIds.has(id))).toBe(true);
    expect(new Set(referenced).size).toBe(9);
  });

  it("has no sessions on closure days and no duplicate sessions", () => {
    const closed = new Set(closures2026_10.map((closure) => closure.date));
    expect(doctorSessions2026_10.some((session) => closed.has(session.date))).toBe(false);
    const keys = doctorSessions2026_10.map((session) => `${session.date}_${session.shiftId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(doctorSessions2026_10).toHaveLength(62);
  });

  it("keeps the transcribed details for a busy Wednesday afternoon", () => {
    const session = doctorSessions2026_10.find(
      (item) => item.date === "2026-10-07" && item.shiftId === "afternoon",
    );
    expect(session?.assistantsNeeded).toBe(11);
    expect(session?.doctors.map((doctor) => doctor.personId)).toEqual([
      "0008",
      "0009",
      "0010",
      "0002",
    ]);
  });
});

describe("doctor schedule import", () => {
  it("creates one entry per doctor per session with limited-booking notes", () => {
    const planned = planDoctorScheduleImport([], doctorSessions2026_10, 1);
    const expected = doctorSessions2026_10.reduce((sum, session) => sum + session.doctors.length, 0);
    expect(planned).toHaveLength(expected);
    expect(new Set(planned.map((entry) => entry.id)).size).toBe(planned.length);
    const limited = planned.find((entry) => entry.id === "2026-10-02_0002_morning");
    expect(limited?.note).toBe(LIMITED_BOOKING_NOTE);
    expect(planned.find((entry) => entry.id === "2026-10-01_0002_morning")).not.toHaveProperty("note");
  });

  it("never overwrites existing shifts or leave", () => {
    const existing: ScheduleEntry[] = [
      { id: "2026-10-05_0001", date: "2026-10-05", personId: "0001", state: "leave", updatedAt: 1 },
      { id: "2026-10-06_0001_morning", date: "2026-10-06", personId: "0001", state: "shift", shiftId: "morning", updatedAt: 1 },
    ];
    const planned = planDoctorScheduleImport(existing, doctorSessions2026_10, 2);
    expect(planned.some((entry) => entry.date === "2026-10-05" && entry.personId === "0001")).toBe(false);
    expect(planned.some((entry) => entry.id === "2026-10-06_0001_morning")).toBe(false);
    expect(planned.some((entry) => entry.id === "2026-10-06_0001_afternoon")).toBe(true);
    expect(planDoctorScheduleImport([...existing, ...planned], doctorSessions2026_10, 3)).toEqual([]);
  });

  it("lets auto schedule cover the Saturday sessions with assistants", () => {
    const saturday = ["2026-10-17"];
    const doctors = planDoctorScheduleImport([], doctorSessions2026_10, 1).filter((entry) => entry.date === "2026-10-17");
    const assistants = planAutoSchedule(doctors, courseProfile.people, saturday, courseProfile.shifts, 2, 1);
    const issues = evaluateAssistantCoverage([...doctors, ...assistants], courseProfile.people, saturday, courseProfile.shifts, 2);
    expect(issues.map((issue) => issue.shiftId)).toEqual(["evening"]);
  });
});

describe("reloading the doctor schedule", () => {
  const doctorSet = new Set(doctorIds);
  const sessions = [
    { date: "2027-01-06", shiftId: "evening" as const, doctors: [{ personId: "0005", limitedBooking: false }] },
    { date: "2027-01-07", shiftId: "morning" as const, doctors: [{ personId: "0002", limitedBooking: true }] },
  ];
  const shift = (date: string, personId: string, shiftId: string, note?: string): ScheduleEntry => ({
    id: `${date}_${personId}_${shiftId}`, date, personId, state: "shift", shiftId, updatedAt: 1, ...(note ? { note } : {}),
  });

  it("removes stale doctor shifts, keeps matching ones and adds the missing", () => {
    const keep = shift("2027-01-06", "0005", "evening");
    const stale = shift("2027-01-08", "0005", "evening");
    const assistant = shift("2027-01-08", "1001", "evening");
    const otherMonth = shift("2027-02-01", "0005", "evening");
    const { remove, add, assistantRemoved } = planDoctorScheduleReload([keep, stale, assistant, otherMonth], sessions, ["2027-01"], doctorSet, 1);
    expect(remove).toEqual([stale, assistant]);
    expect(assistantRemoved).toBe(1);
    expect(add.map((entry) => entry.id)).toEqual(["2027-01-07_0002_morning"]);
    expect(add[0].note).toBe(LIMITED_BOOKING_NOTE);
  });

  it("keeps doctor leave and does not schedule over it", () => {
    const leave: ScheduleEntry = { id: "2027-01-06_0005", date: "2027-01-06", personId: "0005", state: "leave", updatedAt: 1 };
    const { remove, add } = planDoctorScheduleReload([leave], sessions, ["2027-01"], doctorSet, 1);
    expect(remove).toEqual([]);
    expect(add.map((entry) => entry.personId)).toEqual(["0002"]);
  });

  it("replaces a shift whose limited-booking mark changed", () => {
    const plain = shift("2027-01-07", "0002", "morning");
    const { remove, add } = planDoctorScheduleReload([plain], sessions, ["2027-01"], doctorSet, 1);
    expect(remove).toEqual([plain]);
    expect(add.find((entry) => entry.id === plain.id)?.note).toBe(LIMITED_BOOKING_NOTE);
  });

  it("removes assistants only from sessions left without a doctor", () => {
    const staffed = shift("2027-01-06", "1001", "evening");
    const orphan = shift("2027-01-13", "1001", "evening");
    const leave: ScheduleEntry = { id: "2027-01-14_1001", date: "2027-01-14", personId: "1001", state: "leave", updatedAt: 1 };
    const otherMonth = shift("2027-02-03", "1001", "evening");
    const { remove, assistantRemoved } = planDoctorScheduleReload([staffed, orphan, leave, otherMonth], sessions, ["2027-01"], doctorSet, 1);
    expect(remove).toEqual([orphan]);
    expect(assistantRemoved).toBe(1);
  });
});

describe("syncing doctor shifts with the doctor schedule", () => {
  const doctorSet = new Set(doctorIds);
  const shift = (date: string, personId: string, shiftId: string): ScheduleEntry => ({
    id: `${date}_${personId}_${shiftId}`, date, personId, state: "shift", shiftId, updatedAt: 1,
  });
  const sessionsByMonth: Record<string, Array<{ date: string; shiftId: "morning" | "afternoon" | "evening"; doctors: Array<{ personId: string; limitedBooking: boolean }> }>> = {
    "2027-01": [{ date: "2027-01-04", shiftId: "morning", doctors: [{ personId: "0001", limitedBooking: false }] }],
    "2027-02": [{ date: "2027-02-01", shiftId: "morning", doctors: [{ personId: "0001", limitedBooking: false }] }],
  };

  it("applies months without assistant changes automatically and holds back the rest", () => {
    // 1 月：醫師班表多了 1/4 早診，沒有助理受影響 → 自動。
    // 2 月：2/2 晚診已排助理，但醫師班表拿掉這一診 → 等管理者確認。
    const entries = [shift("2027-02-02", "0005", "evening"), shift("2027-02-02", "1001", "evening")];
    const { auto, blocked } = planDoctorSync(entries, ["2027-01", "2027-02", "2028-01"], (month) => sessionsByMonth[month], doctorSet, 1);
    expect(auto.add.map((entry) => entry.id)).toEqual(["2027-01-04_0001_morning"]);
    expect(auto.remove).toEqual([]);
    expect(blocked.map((item) => [item.month, item.assistantRemoved])).toEqual([["2027-02", 1]]);
  });

  it("does nothing when everything already matches", () => {
    const entries = [shift("2027-01-04", "0001", "morning")];
    const { auto, blocked } = planDoctorSync(entries, ["2027-01"], (month) => sessionsByMonth[month], doctorSet, 1);
    expect(auto).toEqual({ remove: [], add: [] });
    expect(blocked).toEqual([]);
  });
});
