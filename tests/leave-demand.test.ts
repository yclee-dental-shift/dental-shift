import { describe, expect, it } from "vitest";
import type { DoctorSession } from "@/config/doctors";
import { evaluateLeaveLoad, heatOf, shortIfOff } from "@/domain/rules/leave-demand";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";

const rules = { pediatricDoctorIds: [], defaultFloors: { doc: 1 as const } };
const date = "2027-03-03";
// 1 位醫師：跟診 1、流動 1、櫃檯 1，共需 3 位助理。
const sessions: DoctorSession[] = [
  { date, shiftId: "morning", doctors: [{ personId: "doc", limitedBooking: false }] },
  { date, shiftId: "evening", doctors: [{ personId: "doc", limitedBooking: false }] },
];
const people: CoursePerson[] = [
  { id: "doc", displayName: "醫師", role: "doctor" },
  ...["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => ({ id, displayName: id, role: "assistant" as const })),
];
const leave = (personId: string, day = date): ScheduleEntry => ({
  id: `${day}_${personId}`,
  date: day,
  personId,
  state: "leave",
  note: "預假｜特休",
  updatedAt: 1,
});

describe("leave load", () => {
  it("is ok when there is room", () => {
    const [day] = evaluateLeaveLoad([leave("a1")], people, sessions, {}, rules);
    expect(day.sessions[0]).toMatchObject({ needed: 3, available: 5, onLeave: ["a1"] });
    expect(day.heat).toBe("ok");
  });

  it("turns hot, then short, as more assistants take leave", () => {
    const two = evaluateLeaveLoad([leave("a1"), leave("a2")], people, sessions, {}, rules)[0];
    expect(two.heat).toBe("hot");
    const four = evaluateLeaveLoad(["a1", "a2", "a3", "a4"].map((id) => leave(id)), people, sessions, {}, rules)[0];
    expect(four.heat).toBe("short");
  });

  it("counts shift requests only for that session", () => {
    const requests = {
      [`${date}_a1_evening`]: { date, personId: "a1", shiftId: "evening", at: "" },
      [`${date}_a2_evening`]: { date, personId: "a2", shiftId: "evening", at: "" },
      [`${date}_a3_evening`]: { date, personId: "a3", shiftId: "evening", at: "" },
      [`${date}_a4_evening`]: { date, personId: "a4", shiftId: "evening", at: "" },
    };
    const [day] = evaluateLeaveLoad([], people, sessions, requests, rules);
    expect(day.sessions.map((session) => session.available)).toEqual([6, 2]);
    expect(day.sessions[1].requestedOff).toEqual(["a1", "a2", "a3", "a4"]);
    expect(day.heat).toBe("short");
  });

  it("skips sessions whose doctors are all on leave", () => {
    expect(evaluateLeaveLoad([leave("doc")], people, sessions, {}, rules)).toEqual([]);
  });

  it("warns only when one more leave would cause a shortage", () => {
    const [day] = evaluateLeaveLoad(["a1", "a2", "a3"].map((id) => leave(id)), people, sessions, {}, rules);
    expect(heatOf(day.sessions)).toBe("hot");
    expect(shortIfOff(day, "a4").map((session) => session.shiftId)).toEqual(["morning", "evening"]);
    expect(shortIfOff(day, "a1")).toEqual([]);
  });
});
