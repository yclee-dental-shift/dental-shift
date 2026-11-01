import { describe, expect, it } from "vitest";
import { doctorIdsByName } from "@/config/doctors";
import { closures2027, defaultDoctorSchedule, specialistVisits2027, weeklyTemplate2027 } from "@/config/doctor-schedule-2027";
import { buildMonthSessions } from "@/domain/rules/doctor-template";
import {
  addWeeklyVersion,
  clearDayOverrides,
  hasDayOverride,
  sessionFloorMap,
  setDayOverride,
  slotsFor,
  extendCalendar,
  removeClosure,
  removeVisit,
  saveVisit,
  setClosure,
  isDoctorScheduleConfig,
  removeWeeklyVersion,
  sessionsForMonth,
  setWeeklySlots,
  weeklyVersionFor,
} from "@/domain/rules/doctor-schedule";

const months2027 = Array.from({ length: 12 }, (_, index) => `2027-${String(index + 1).padStart(2, "0")}`);

describe("doctor schedule config", () => {
  it("matches the original 2027 template except the automatic exclusion rules", () => {
    const config = defaultDoctorSchedule();
    let tuesdays = 0;
    let wednesdays = 0;
    let fridays = 0;
    for (const month of months2027) {
      const original = buildMonthSessions(month, weeklyTemplate2027, specialistVisits2027, closures2027, doctorIdsByName);
      // 原本的算法加上兩條規則：週三晚診除了陳美玲已有 4 位就拿掉他；週五午診有蔡／楊醫師就拿掉林志明。
      // 週五當天有蔡／楊醫師（兒牙口外）：陳美玲早診開放、午晚不開放一般約診。
      const pedoDays = new Set(
        original.filter((item) => item.doctors.some((doctor) => ["0006", "0007"].includes(doctor.personId))).map((item) => item.date),
      );
      const expected = original.map((raw) => {
        const weekday = new Date(`${raw.date}T00:00:00Z`).getUTCDay();
        const session =
          weekday === 5 && pedoDays.has(raw.date)
            ? { ...raw, doctors: raw.doctors.map((doctor) => (doctor.personId === "0002" ? { ...doctor, limitedBooking: raw.shiftId !== "morning" } : doctor)) }
            : raw;
        const ids = session.doctors.map((doctor) => doctor.personId);
        if (weekday === 2 && session.shiftId === "evening" && ids.includes("0002") && ids.includes("0009")) {
          tuesdays += 1;
          return { ...session, doctors: session.doctors.filter((doctor) => doctor.personId !== "0002") };
        }
        if (weekday === 3 && session.shiftId === "evening" && ids.includes("0002") && ids.length - 1 >= 4) {
          wednesdays += 1;
          return { ...session, doctors: session.doctors.filter((doctor) => doctor.personId !== "0002") };
        }
        if (weekday === 5 && session.shiftId === "afternoon" && ids.includes("0001") && (ids.includes("0006") || ids.includes("0007"))) {
          fridays += 1;
          return { ...session, doctors: session.doctors.filter((doctor) => doctor.personId !== "0001") };
        }
        return session;
      });
      expect(sessionsForMonth(config, month)).toEqual(expected);
    }
    expect(tuesdays).toBeGreaterThan(0);
    expect(wednesdays).toBeGreaterThan(0);
    expect(fridays).toBeGreaterThan(0);
  });

  it("drops 陳美玲 on Tuesday evenings with Dr. Xie", () => {
    const evening = (date: string) =>
      sessionsForMonth(defaultDoctorSchedule(), date.slice(0, 7))!
        .find((session) => session.date === date && session.shiftId === "evening")!
        .doctors.map((doctor) => doctor.personId);
    expect(evening("2027-01-12")).toEqual(["0005", "0009"]);
    expect(evening("2027-01-19")).toEqual(["0002", "0005"]);
  });

  it("makes (陳美玲) open only in the morning on Fridays with pediatric/oral surgery", () => {
    const liyoujin = (date: string) =>
      sessionsForMonth(defaultDoctorSchedule(), date.slice(0, 7))!
        .filter((session) => session.date === date)
        .map((session) => {
          const doctor = session.doctors.find((item) => item.personId === "0002");
          return `${session.shiftId}:${doctor ? (doctor.limitedBooking ? "()" : "open") : "-"}`;
        });
    expect(liyoujin("2027-01-08")).toEqual(["morning:open", "afternoon:()", "evening:()"]);
    expect(liyoujin("2027-01-15")).toEqual(["morning:()", "afternoon:()", "evening:open"]);
  });

  it("schedules Dr. Li Bing-hui Thursday morning and evening, Friday afternoon only without pediatric/oral surgery", () => {
    const shiftsOf = (date: string) =>
      sessionsForMonth(defaultDoctorSchedule(), date.slice(0, 7))!
        .filter((session) => session.date === date && session.doctors.some((doctor) => doctor.personId === "0001"))
        .map((session) => session.shiftId);
    expect(shiftsOf("2027-01-07")).toEqual(["morning", "evening"]);
    expect(shiftsOf("2027-01-08")).toEqual(["morning"]);
    expect(shiftsOf("2027-01-15")).toEqual(["morning", "afternoon"]);
  });

  it("drops (陳美玲) on Wednesday evenings with 4 other doctors", () => {
    const evening = (date: string) =>
      sessionsForMonth(defaultDoctorSchedule(), date.slice(0, 7))!
        .find((session) => session.date === date && session.shiftId === "evening")!
        .doctors.map((doctor) => `${doctor.limitedBooking ? "(" : ""}${doctor.personId}${doctor.limitedBooking ? ")" : ""}`);
    expect(evening("2027-01-06")).toEqual(["0001", "0010", "0009", "0005"]);
    expect(evening("2027-01-13")).toEqual(["0001", "0010", "(0002)", "0009"]);
  });

  it("lets a single-day override keep (陳美玲) on a full Wednesday evening", () => {
    const slots = [
      { personId: "0001", limited: false },
      { personId: "0010", limited: false },
      { personId: "0009", limited: false },
      { personId: "0005", limited: false },
      { personId: "0002", limited: true },
    ];
    const config = setDayOverride(defaultDoctorSchedule(), "2027-01-06", "evening", slots);
    const doctors = sessionsForMonth(config, "2027-01")!.find((session) => session.date === "2027-01-06" && session.shiftId === "evening")!.doctors;
    expect(doctors.map((doctor) => doctor.personId)).toContain("0002");
  });

  it("returns nothing outside the calendar range", () => {
    const config = defaultDoctorSchedule();
    expect(sessionsForMonth(config, "2026-12")).toBeUndefined();
    expect(sessionsForMonth(config, "2028-01")).toBeUndefined();
  });

  it("picks the latest weekly version that has started", () => {
    const config = defaultDoctorSchedule();
    config.weekly.push({ from: "2027-07", slots: {} });
    expect(weeklyVersionFor(config, "2027-06")?.from).toBe("2027-01");
    expect(weeklyVersionFor(config, "2027-07")?.from).toBe("2027-07");
    expect(sessionsForMonth(config, "2027-07")!.some((session) => session.date === "2027-07-05")).toBe(false);
  });

  it("keeps Sunday visits even without a weekly template", () => {
    const config = defaultDoctorSchedule();
    config.visits.push({ id: "extra", label: "加開", dates: ["2027-01-03"], sessions: { morning: [{ personId: "0001", limited: false }] } });
    expect(sessionsForMonth(config, "2027-01")!.filter((session) => session.date === "2027-01-03")).toHaveLength(1);
  });
});

describe("editing the weekly template", () => {
  const ids = (config: ReturnType<typeof defaultDoctorSchedule>, date: string, shiftId: string) =>
    sessionsForMonth(config, date.slice(0, 7))!
      .find((session) => session.date === date && session.shiftId === shiftId)
      ?.doctors.map((doctor) => `${doctor.limitedBooking ? "(" : ""}${doctor.personId}${doctor.limitedBooking ? ")" : ""}`) ?? [];

  it("changes one slot and keeps the limited-booking flag", () => {
    const config = setWeeklySlots(defaultDoctorSchedule(), "2027-01", 2, "evening", [
      { personId: "0002", limited: true },
    ]);
    expect(ids(config, "2027-01-05", "evening")).toEqual(["(0002)"]);
  });

  it("adds a version from July that only affects July onwards", () => {
    let config = addWeeklyVersion(defaultDoctorSchedule(), "2027-07");
    config = setWeeklySlots(config, "2027-07", 1, "morning", [{ personId: "0008", limited: false }]);
    expect(ids(config, "2027-06-07", "morning")).toEqual(["0001"]);
    expect(ids(config, "2027-07-05", "morning")).toEqual(["0008"]);
    // 新版本先複製舊版本，沒改的格子一樣。
    expect(ids(config, "2027-07-05", "afternoon")).toEqual(["0001"]);
  });

  it("supports a Saturday weekly slot", () => {
    const config = setWeeklySlots(defaultDoctorSchedule(), "2027-01", 6, "morning", [{ personId: "0001", limited: false }]);
    expect(ids(config, "2027-01-02", "morning")).toEqual(["0001"]);
  });

  it("never removes the earliest version", () => {
    const config = addWeeklyVersion(defaultDoctorSchedule(), "2027-07");
    expect(removeWeeklyVersion(config, "2027-01").weekly).toHaveLength(2);
    expect(removeWeeklyVersion(config, "2027-07").weekly).toHaveLength(1);
  });

  it("recognises a valid backup", () => {
    expect(isDoctorScheduleConfig(defaultDoctorSchedule())).toBe(true);
    expect(isDoctorScheduleConfig({ version: 1 })).toBe(false);
  });
});

describe("editing closures, visits and the calendar range", () => {
  const sessionsOn = (config: ReturnType<typeof defaultDoctorSchedule>, date: string) =>
    sessionsForMonth(config, date.slice(0, 7))!.filter((session) => session.date === date);

  it("adds and removes a closure", () => {
    const closed = setClosure(defaultDoctorSchedule(), "2027-03-15", "颱風停診");
    expect(sessionsOn(closed, "2027-03-15")).toHaveLength(0);
    expect(closed.closures.find((closure) => closure.date === "2027-03-15")?.label).toBe("颱風停診");
    expect(sessionsOn(removeClosure(closed, "2027-03-15"), "2027-03-15").length).toBeGreaterThan(0);
  });

  it("adds, edits and removes a visit", () => {
    let config = saveVisit(defaultDoctorSchedule(), {
      id: "extra-sunday",
      label: " 週日加開 ",
      dates: ["2027-01-10", "2027-01-10"],
      sessions: { morning: [{ personId: "0001", limited: false }], evening: [] },
    });
    const visit = config.visits.find((item) => item.id === "extra-sunday")!;
    expect(visit.label).toBe("週日加開");
    expect(visit.dates).toEqual(["2027-01-10"]);
    expect(Object.keys(visit.sessions)).toEqual(["morning"]);
    expect(sessionsOn(config, "2027-01-10").map((session) => session.shiftId)).toEqual(["morning"]);
    config = saveVisit(config, { ...visit, dates: ["2027-01-17"] });
    expect(sessionsOn(config, "2027-01-10")).toHaveLength(0);
    expect(sessionsOn(config, "2027-01-17")).toHaveLength(1);
    expect(sessionsOn(removeVisit(config, "extra-sunday"), "2027-01-17")).toHaveLength(0);
  });

  it("extends the calendar so later months produce sessions", () => {
    const config = extendCalendar(defaultDoctorSchedule(), "2028-12");
    expect(sessionsForMonth(config, "2028-01")!.length).toBeGreaterThan(0);
    expect(extendCalendar(config, "2028-06").lastMonth).toBe("2028-12");
  });
});

describe("single-day overrides", () => {
  const ids = (config: ReturnType<typeof defaultDoctorSchedule>, date: string, shiftId: string) =>
    sessionsForMonth(config, date.slice(0, 7))!
      .find((session) => session.date === date && session.shiftId === shiftId)
      ?.doctors.map((doctor) => doctor.personId) ?? [];

  it("removes one doctor on one day only", () => {
    const config = setDayOverride(defaultDoctorSchedule(), "2027-01-07", "morning", [{ personId: "0002", limited: false }]);
    expect(ids(config, "2027-01-07", "morning")).toEqual(["0002"]);
    expect(ids(config, "2027-01-14", "morning")).toEqual(["0001", "0002"]);
    expect(hasDayOverride(config, "2027-01-07")).toBe(true);
  });

  it("adds a doctor on a Sunday", () => {
    const config = setDayOverride(defaultDoctorSchedule(), "2027-01-10", "morning", [{ personId: "0001", limited: false }]);
    expect(ids(config, "2027-01-10", "morning")).toEqual(["0001"]);
  });

  it("wins over specialist visits, and an empty list means no session", () => {
    const config = setDayOverride(defaultDoctorSchedule(), "2027-01-06", "evening", []);
    expect(ids(config, "2027-01-06", "evening")).toEqual([]);
  });

  it("does not store an override equal to the plan, and can be cleared", () => {
    const base = defaultDoctorSchedule();
    const same = setDayOverride(base, "2027-01-07", "morning", [
      { personId: "0002", limited: false },
      { personId: "0001", limited: false },
    ]);
    expect(same.overrides ?? []).toHaveLength(0);
    const changed = setDayOverride(base, "2027-01-07", "morning", []);
    expect(ids(clearDayOverrides(changed, "2027-01-07"), "2027-01-07", "morning")).toEqual(["0001", "0002"]);
  });

  it("keeps closures closed", () => {
    const config = setDayOverride(defaultDoctorSchedule(), "2027-01-01", "morning", [{ personId: "0001", limited: false }]);
    expect(sessionsForMonth(config, "2027-01")!.filter((session) => session.date === "2027-01-01")).toHaveLength(0);
  });

  it("reads old data without overrides", () => {
    const { overrides: _unused, ...old } = { ...defaultDoctorSchedule(), overrides: undefined };
    void _unused;
    expect(isDoctorScheduleConfig(old)).toBe(true);
    expect(sessionsForMonth(old, "2027-01")!.length).toBeGreaterThan(0);
  });
});

describe("single-day floor", () => {
  it("keeps a floor-only change as a day override and exposes it for the headcount", () => {
    const base = defaultDoctorSchedule();
    const slots = slotsFor(base, "2027-01-06", "morning").map((slot) =>
      slot.personId === "0001" ? { ...slot, floor: 2 as const } : slot,
    );
    const config = setDayOverride(base, "2027-01-06", "morning", slots);
    expect(config.overrides).toHaveLength(1);
    expect(sessionFloorMap(config).get("2027-01-06_morning_0001")).toBe(2);
    // 拿掉指定樓層就回到固定班，不留單日調整。
    const back = setDayOverride(config, "2027-01-06", "morning", slots.map((slot) => ({ personId: slot.personId, limited: slot.limited })));
    expect(back.overrides).toHaveLength(0);
  });
});
