import { describe, expect, it } from "vitest";
import { VIEW_AS_CHOICES, viewOfChoice } from "@/components/ViewerProvider";
import { managesMonth } from "@/domain/rules/month-lead";

describe("用某人的身分看：照職稱換算畫面", () => {
  it("選單列出助理長、組長、助理與行政專員，不列管理階層", () => {
    const labels = VIEW_AS_CHOICES.map((choice) => choice.label);
    expect(labels).toContain("王小華（助理長）");
    expect(labels).toContain("李佳穎（組長）");
    expect(labels).toContain("陳怡君（組長）");
    expect(labels).toContain("孫雅惠（行政專員）");
    expect(labels.some((label) => label.includes("管理階層"))).toBe(false);
  });

  it("助理長、組長＝排班者畫面，照自己負責的月份算能不能改", () => {
    expect(viewOfChoice("1001")).toEqual({ viewer: "scheduler", acting: { role: "lead", personId: "1001" } });
    const yijun = viewOfChoice("1004");
    expect(yijun).toEqual({ viewer: "scheduler", acting: { role: "leader", personId: "1004" } });
    const lead = { personId: "1004", at: "2026-10-29 20:08", by: "王小華" };
    expect(managesMonth(yijun.acting!, lead)).toBe(true);
    expect(managesMonth(yijun.acting!, undefined)).toBe(false);
  });

  it("助理＝助理畫面；clerk＝行政專員；其他照舊", () => {
    expect(viewOfChoice("1020")).toEqual({ viewer: "1020", acting: { role: "assistant", personId: "1020" } });
    expect(viewOfChoice("clerk")).toEqual({ viewer: "clerk", acting: { role: "clerk" } });
    expect(viewOfChoice("scheduler")).toEqual({ viewer: "scheduler", acting: null });
  });
});
