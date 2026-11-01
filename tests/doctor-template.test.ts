import { describe, expect, it } from "vitest";
import { doctorIdsByName } from "@/config/doctors";
import { closures2027, specialistVisits2027, weeklyTemplate2027 } from "@/config/doctor-schedule-2027";
import { buildMonthSessions } from "@/domain/rules/doctor-template";

const build = (month: string) =>
  buildMonthSessions(month, weeklyTemplate2027, specialistVisits2027, closures2027, doctorIdsByName);
const sessionOn = (month: string, date: string, shiftId: string) =>
  build(month).find((session) => session.date === date && session.shiftId === shiftId);
const ids = (month: string, date: string, shiftId: string) =>
  sessionOn(month, date, shiftId)?.doctors.map((doctor) => `${doctor.limitedBooking ? "(" : ""}${doctor.personId}${doctor.limitedBooking ? ")" : ""}`) ?? [];

describe("2027 doctor schedule", () => {
  it("uses the weekly template on an ordinary Tuesday", () => {
    expect(ids("2027-01", "2027-01-05", "afternoon")).toEqual(["0001", "0005"]);
    expect(ids("2027-01", "2027-01-05", "evening")).toEqual(["0002", "0005"]);
  });

  it("adds Dr. Xie on calendar Tuesdays", () => {
    expect(ids("2027-01", "2027-01-12", "afternoon")).toEqual(["0001", "0005", "0009"]);
  });

  it("adds Dr. Liao's evening on calendar Wednesdays and Fridays without duplicates", () => {
    expect(ids("2027-01", "2027-01-15", "evening")).toEqual(["0002", "0005"]);
    expect(ids("2027-01", "2027-01-13", "evening")).not.toContain("0005");
    const wednesday = ids("2027-01", "2027-01-20", "evening");
    expect(wednesday).toContain("0005");
    expect(new Set(wednesday).size).toBe(wednesday.length);
  });

  it("adds Lin and Xu on calendar Fridays and only Lin on the monthly Monday", () => {
    expect(ids("2027-01", "2027-01-08", "afternoon")).toEqual([
      "0001", "(0002)", "0008", "0006", "0007",
    ]);
    expect(ids("2027-01", "2027-01-18", "evening")).toEqual(["0001", "0006"]);
    expect(ids("2027-01", "2027-01-18", "morning")).toEqual(["0001"]);
  });

  it("opens Saturday only when Dr. Wang comes", () => {
    expect(ids("2027-01", "2027-01-23", "morning")).toEqual(["0004", "0001", "(0002)"]);
    expect(ids("2027-01", "2027-01-23", "afternoon")).toEqual(["0004"]);
    expect(sessionOn("2027-01", "2027-01-23", "evening")).toBeUndefined();
    expect(build("2027-01").some((session) => session.date === "2027-01-16")).toBe(false);
  });

  it("closes on holidays and clinic make-up days but opens on swapped holidays", () => {
    expect(build("2027-01").some((session) => session.date === "2027-01-01")).toBe(false);
    expect(build("2027-02").some((session) => ["2027-02-04", "2027-02-10"].includes(session.date))).toBe(false);
    expect(build("2027-06").some((session) => session.date === "2027-06-25")).toBe(false);
    expect(sessionOn("2027-06", "2027-06-09", "morning")).toBeDefined();
    expect(sessionOn("2027-10", "2027-10-11", "morning")).toBeDefined();
    expect(build("2027-10").some((session) => ["2027-10-25", "2027-10-26"].includes(session.date))).toBe(false);
  });

  it("never opens on Sundays", () => {
    const year = Array.from({ length: 12 }, (_, index) => build(`2027-${String(index + 1).padStart(2, "0")}`)).flat();
    expect(year.some((session) => new Date(`${session.date}T00:00:00Z`).getUTCDay() === 0)).toBe(false);
  });
});
