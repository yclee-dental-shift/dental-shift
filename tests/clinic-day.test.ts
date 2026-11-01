import { describe, expect, it } from "vitest";
import { clinicDayOf } from "@/components/schedule-settings";

describe("clinicDayOf", () => {
  it("labels holidays from the clinic calendar", () => {
    expect(clinicDayOf("2027-01-01")).toMatchObject({ known: true, open: false, label: "元旦" });
    expect(clinicDayOf("2027-02-04")).toMatchObject({ open: false, label: "春節" });
  });

  it("labels clinic make-up days off with the holiday they replace", () => {
    expect(clinicDayOf("2027-06-25")).toMatchObject({ open: false, label: "補 6/9 端午" });
    expect(clinicDayOf("2027-06-09").open).toBe(true);
  });

  it("labels Sundays without sessions", () => {
    expect(clinicDayOf("2027-01-03")).toMatchObject({ open: false, label: "週日" });
  });

  it("lists only the shifts the clinic opens", () => {
    expect(clinicDayOf("2027-01-04").shiftIds).toEqual(["morning", "afternoon", "evening"]);
    const saturday = clinicDayOf("2027-01-23");
    expect(saturday.open).toBe(true);
    expect(saturday.shiftIds).not.toContain("evening");
  });

  it("does not restrict months without a calendar", () => {
    expect(clinicDayOf("2028-01-03")).toMatchObject({ known: false, open: true });
  });
});
