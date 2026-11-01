import { describe, expect, it } from "vitest";
import {
  abilityFor,
  abilityRowOnly,
  abilityVersionLabel,
  adjustedCount,
  effectiveMonthFromFileName,
  isAbilityVersion,
  type AbilityVersion,
} from "@/domain/rules/ability";
import { gridOf, importAbilities, levelOf, matchPerson, soloCount, taskOfSection } from "@/domain/rules/ability-import";
import { columnIndex, readFirstSheet } from "@/domain/rules/xlsx-sheet";
import { buildXlsx } from "./ability-helpers";

const people = [
  { id: "1001", displayName: "王小華" },
  { id: "1029", displayName: "楊晴" },
  { id: "1031", displayName: "郭品妍" },
];

/** 和真實能力矩陣同樣的排法：E 欄「可支援人數」，左邊 B＝區塊、C、D＝項目，右邊每欄一個人。 */
const SHEET: string[][] = [
  ["", "", "", "◎", "熟練"],
  [],
  ["", "", "", "", "可支援人數", "小華 \nLv.10", "楊晴\nLv.1", "品妍\nLv.0", "新人"],
  ["", "流動工作", "撤備台", "", "2", "◎", "◎", "※", ""],
  ["", "", "清消", "", "", "◎", "Ø", "◎", ""],
  ["", "衛教", "基礎衛教", "", "3", "◎", "◎", "◎", ""],
  ["", "林志明/醫師", "器械準備", "洗牙", "1", "◎", "Ø", "", ""],
  ["", "", "", "補牙", "", "◎", "Ø", "", ""],
  ["", "", "", "拔牙", "", "◎", "Ø", "", ""],
  ["", "", "自費", "植牙", "", "Ø", "Ø", "", ""],
  ["", "", "", "沒人評的項目", "", "", "", "", ""],
  ["", "張雅文/醫師", "", "補牙", "1", "◎", "◎", "", ""],
  ["", "", "自費", "RPD", "", "※", "※", "", ""],
  ["", "蔡佩君/醫師", "器械熟悉度", "", "1", "◎", "△", "", ""],
  ["", "", "舒眠手術", "", "1", "◎", "※", "", ""],
  ["", "", "", "舒眠後的項目", "", "◎", "※", "", ""],
  ["", "劉醫師", "", "洗牙", "1", "◎", "", "", ""],
  ["", "神秘區", "", "項目", "", "◎", "◎", "", ""],
  [],
  ["", "", "", "", "", "張醫師:自費RPD先排外"],
];

describe("能力矩陣換算", () => {
  const result = importAbilities(SHEET, people);
  const col = (nickname: string) => result.columns.find((column) => column.nickname === nickname)!;

  it("對名字：全名或結尾相同、只有一位", () => {
    expect(result.columns.map((column) => [column.nickname, column.personId])).toEqual([
      ["小華", "1001"],
      ["楊晴", "1029"],
      ["品妍", "1031"],
      ["新人", null],
    ]);
    expect(matchPerson("婷", [...people, { id: "x", displayName: "謝雨萱" }])).toBeNull();
  });

  it("可獨立：Ø 不超過 3、沒有 △ ※ 空白；自費也算", () => {
    expect(col("小華").levels["doctor-0001"]).toBe("solo");
    expect(col("小華").basis["doctor-0001"]).toBe("◎3 Ø1");
    // 楊晴 4 個 Ø（含自費）＝需要有人帶
    expect(col("楊晴").levels["doctor-0001"]).toBe("guided");
    expect(col("品妍").levels["doctor-0001"]).toBe("none");
    expect(col("品妍").levels.float).toBe("guided");
    expect(col("新人").levels.float).toBe("none");
  });

  it("先排外的項目、整列沒人評的項目、另外的小區不算", () => {
    expect(col("楊晴").levels["doctor-0008"]).toBe("solo");
    expect(result.sections.find((section) => section.taskId === "doctor-0001")?.items).toBe(4);
    const lin = result.sections.find((section) => section.taskId === "doctor-0006")!;
    expect(lin.subSections).toEqual(["舒眠手術"]);
    expect(lin.items).toBe(1);
    expect(col("小華").levels["doctor-0006"]).toBe("solo");
  });

  it("別名、不用的區塊、對不到的區塊與表上沒有的醫師", () => {
    expect(col("小華").levels["doctor-0010"]).toBe("solo");
    expect(col("楊晴").levels["doctor-0010"]).toBe("none");
    expect(result.sections.find((section) => section.label === "衛教")?.ignored).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("神秘區"))).toBe(true);
    expect(result.warnings.some((warning) => warning.startsWith("表上沒有：陳美玲"))).toBe(true);
    expect(result.sections.find((section) => section.taskId === "float")?.listed).toBe(2);
    expect(soloCount(result, "float")).toBe(2);
  });

  it("區塊名稱", () => {
    expect(taskOfSection("陳美玲/醫師")).toBe("doctor-0002");
    expect(taskOfSection("櫃/台")).toBe("counter");
    expect(taskOfSection("衛教")).toBe("ignored");
    expect(taskOfSection("其他")).toBeNull();
  });

  it("看不懂的符號當作還不會", () => {
    expect(levelOf(["good", "other"]).level).toBe("guided");
    expect(levelOf([]).level).toBe("none");
  });

  it("不是能力矩陣就說明", () => {
    expect(() => importAbilities([["職能參照表"]], people)).toThrow("可支援人數");
  });

  it("欄對到人才放進格子；同一個人兩欄用前面那欄", () => {
    const mapping = Object.fromEntries(result.columns.map((column) => [column.column, column.personId]));
    expect(Object.keys(gridOf(result, mapping).levels).sort()).toEqual(["1001", "1029", "1031"]);
    const twice = gridOf(result, { ...mapping, [col("新人").column]: "1001" });
    expect(twice.levels["1001"].float).toBe("solo");
  });
});

describe("讀 Excel", () => {
  it("欄位字母", () => {
    expect([columnIndex("A1"), columnIndex("J5"), columnIndex("AA3")]).toEqual([0, 9, 26]);
  });

  for (const compress of [false, true]) {
    it(`讀第一個工作表（${compress ? "壓縮" : "不壓縮"}）`, async () => {
      const rows = await readFirstSheet(await buildXlsx(compress));
      expect(rows[0]).toEqual(["", "可支援人數", "小華\nLv.10"]);
      expect(rows[1]).toEqual(["流動", "2", "◎"]);
      expect(rows[2]).toEqual(["", "", "Ø"]);
    });
  }

  it("不是 Excel 就說明", async () => {
    await expect(readFirstSheet(new TextEncoder().encode("hello"))).rejects.toThrow("不是 Excel");
  });
});

const version = (month: string, overrides: Partial<AbilityVersion> = {}): AbilityVersion => ({
  month,
  at: "2026-10-27T10:00",
  by: "陳美玲",
  tasks: [{ id: "float", label: "流動" }],
  levels: { "1001": { float: "solo" }, "1029": { float: "guided" } },
  imported: { "1001": { float: "solo" }, "1029": { float: "none" } },
  basis: { "1001": { float: "◎2" }, "1029": { float: "◎1 ※1" } },
  ...overrides,
});

describe("能力表資料", () => {
  it("排某個月用那個月或之前最近的一份", () => {
    const versions = { "2026-09": version("2026-09"), "2026-12": version("2026-12") };
    expect(abilityFor(versions, "2026-08")).toBeNull();
    expect(abilityFor(versions, "2026-11")?.month).toBe("2026-09");
    expect(abilityFor(versions, "2027-03")?.month).toBe("2026-12");
  });

  it("格式檢查", () => {
    expect(isAbilityVersion(version("2026-10"), "2026-10")).toBe(true);
    expect(isAbilityVersion(version("2026-10"), "2026-11")).toBe(false);
    expect(isAbilityVersion(version("2026-10", { levels: { "1001": { float: "good" as never } } }), "2026-10")).toBe(false);
    expect(isAbilityVersion(version("2026-10", { levels: { "a_b": { float: "solo" } } }), "2026-10")).toBe(false);
  });

  it("只留自己那一列；人工調整格數", () => {
    const own = abilityRowOnly(version("2026-10"), "1029");
    expect(own.levels).toEqual({ "1029": { float: "guided" } });
    expect(own.basis).toEqual({ "1029": { float: "◎1 ※1" } });
    expect(abilityRowOnly(version("2026-10"), undefined).levels).toEqual({});
    expect(adjustedCount(version("2026-10"))).toBe(1);
  });

  it("名稱寫評估月份與排班月份；從檔名猜生效月份", () => {
    expect(abilityVersionLabel("2026-09")).toBe("2026 年 8 月評估 → 9 月起排班用");
    expect(abilityVersionLabel("2027-01")).toBe("2026 年 12 月評估 → 2027 年 1 月起排班用");
    expect(effectiveMonthFromFileName("8月助理工作能力表_20260901.xlsx", "2026-10")).toBe("2026-09");
    expect(effectiveMonthFromFileName("9月助理工作能力表_202601002.xlsx", "2026-10")).toBe("2026-10");
    expect(effectiveMonthFromFileName("10 月能力表.xlsx", "2026-10")).toBe("2026-11");
    expect(effectiveMonthFromFileName("12月能力表.xlsx", "2027-01")).toBe("2027-01");
    expect(effectiveMonthFromFileName("能力矩陣.xlsx", "2026-10")).toBeNull();
  });
});

