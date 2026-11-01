import { describe, expect, it } from "vitest";
import { holidaySwaps } from "@/config/holiday-swaps";
import { holidayNoteOf } from "@/domain/rules/holiday-swap";

describe("holidayNoteOf", () => {
  it("國定假日照常看診：標名稱與改休日", () => {
    expect(holidayNoteOf("2027-06-09", holidaySwaps)).toEqual({ kind: "worked", short: "端午 照常", detail: "端午節照常看診，改 6/25 休" });
  });

  it("補休日：標補哪一天的哪個節日", () => {
    expect(holidayNoteOf("2027-06-25", holidaySwaps)).toEqual({ kind: "dayOff", short: "補 6/9 端午", detail: "6/9 端午節照常看診，改這天休" });
    expect(holidayNoteOf("2027-10-26", holidaySwaps)?.short).toBe("補 10/11 國慶");
  });

  it("一般日子沒有標示", () => {
    expect(holidayNoteOf("2027-06-10", holidaySwaps)).toBeUndefined();
  });

  it("每一天最多只出現在一組對照", () => {
    const days = holidaySwaps.flatMap((swap) => [swap.holiday, swap.dayOff]);
    expect(new Set(days).size).toBe(days.length);
  });
});
