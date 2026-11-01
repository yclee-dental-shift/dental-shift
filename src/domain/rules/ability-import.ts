import {
  ABILITY_EXCLUDED_ITEMS,
  ABILITY_IGNORED_SECTIONS,
  ABILITY_MAX_NOT_YET,
  ABILITY_SECTION_ALIASES,
  ABILITY_TASKS,
} from "../../config/ability.config";
import type { AbilityGrid, AbilityLevel } from "./ability";

/**
 * 能力矩陣 Excel → 三種狀態（使用者 2026-10-27，照表上「可支援人數評估」）：
 * - 每一區（某位醫師、流動工作、櫃台）裡，Ø 不超過 3 個、沒有 △、※、空白＝可獨立；
 * - 有評分但不符合＝需要有人帶；那一區完全沒評分＝不排。
 * - 自費、手術項目也算；表上註明「先排外」的項目不算；整列都沒人評的項目不算。
 * - 區塊裡另外有自己「可支援人數」的小區（例如舒眠手術）不算進那位醫師。
 * 表的樣子：有一格寫「可支援人數」，它右邊每一欄是一個人（「小華 /Lv.10」）；
 * 它左邊第 3 欄是區塊名稱、左邊 1～2 欄是項目名稱；它那一欄是表上寫的可支援人數。
 */

type Mark = "good" | "notYet" | "weak" | "learning" | "blank" | "other";

const MARKS: Record<string, Mark> = {
  "◎": "good",
  "Ø": "notYet",
  ø: "notYet",
  Φ: "notYet",
  φ: "notYet",
  "⌀": "notYet",
  "△": "weak",
  "▲": "weak",
  "※": "learning",
};
const MARK_SYMBOLS: Record<Exclude<Mark, "blank" | "other">, string> = { good: "◎", notYet: "Ø", weak: "△", learning: "※" };

const clean = (text: string | undefined) => (text ?? "").replace(/\s+/g, "");
const markOf = (text: string | undefined): Mark => {
  const value = clean(text);
  if (!value) return "blank";
  return MARKS[value] ?? "other";
};

export interface AbilityColumn {
  /** 表上的欄（從 0 起算）。 */
  column: number;
  /** 表上的標題，例如「小華 /Lv.10」。 */
  header: string;
  /** 名字部分，例如「小華」。 */
  nickname: string;
  /** 自動對到的人員代號（對不上＝null，要人選）。 */
  personId: string | null;
  /** 工作代號 → 換算結果。 */
  levels: Record<string, AbilityLevel>;
  /** 工作代號 → 依據，例如「◎12 Ø2 ※1」。 */
  basis: Record<string, string>;
}

export interface AbilitySection {
  label: string;
  /** 對到的工作；沒對到或不用的＝null。 */
  taskId: string | null;
  ignored: boolean;
  /** 算進去的項目數。 */
  items: number;
  /** 表上寫的可支援人數（沒寫＝null）。 */
  listed: number | null;
  /** 不算進去的小區（例如舒眠手術）。 */
  subSections: string[];
}

export interface AbilityImport {
  columns: AbilityColumn[];
  sections: AbilitySection[];
  /** 看不懂的符號、表上沒有的工作等提醒。 */
  warnings: string[];
}

export interface AssistantName {
  id: string;
  displayName: string;
}

/** 表上的名字（「小華」「楊晴」）→ 人員代號：全名相同，或全名結尾是這個名字，而且只有一位。 */
export function matchPerson(nickname: string, people: AssistantName[]): string | null {
  if (!nickname) return null;
  const exact = people.filter((person) => person.displayName === nickname);
  if (exact.length === 1) return exact[0].id;
  const tail = people.filter((person) => person.displayName.endsWith(nickname));
  return tail.length === 1 ? tail[0].id : null;
}

/** 區塊名稱 → 工作代號（醫師名字、別名）；不用的區塊回傳 "ignored"，對不上回傳 null。 */
export function taskOfSection(label: string): string | "ignored" | null {
  const text = clean(label).replace(/\//g, "");
  if (ABILITY_IGNORED_SECTIONS.some((name) => text.includes(name))) return "ignored";
  const doctor = ABILITY_TASKS.find((task) => task.id.startsWith("doctor-") && text.includes(task.label));
  if (doctor) return doctor.id;
  const alias = Object.entries(ABILITY_SECTION_ALIASES).find(([name]) => text.includes(name));
  return alias ? alias[1] : null;
}

const isExcluded = (taskId: string, item: string) =>
  ABILITY_EXCLUDED_ITEMS.some((rule) => rule.taskId === taskId && clean(item).includes(rule.item));

/** 一個人在一區的所有符號 → 狀態與依據。 */
export function levelOf(marks: Mark[]): { level: AbilityLevel; basis: string } {
  const count = (mark: Mark) => marks.filter((value) => value === mark).length;
  if (marks.length === 0 || marks.every((mark) => mark === "blank")) return { level: "none", basis: "沒有評分" };
  const parts = (Object.keys(MARK_SYMBOLS) as Array<keyof typeof MARK_SYMBOLS>)
    .filter((mark) => count(mark) > 0)
    .map((mark) => `${MARK_SYMBOLS[mark]}${count(mark)}`);
  if (count("blank") > 0) parts.push(`空白${count("blank")}`);
  if (count("other") > 0) parts.push(`其他${count("other")}`);
  const solo = count("weak") + count("learning") + count("blank") + count("other") === 0 && count("notYet") <= ABILITY_MAX_NOT_YET;
  return { level: solo ? "solo" : "guided", basis: parts.join(" ") };
}

/** 換算整張表。people＝班表上的助理（用來對名字）。 */
export function importAbilities(rows: string[][], people: AssistantName[]): AbilityImport {
  let headerRow = -1;
  let countColumn = -1;
  rows.some((row, rowIndex) => {
    const column = row.findIndex((text) => clean(text) === "可支援人數");
    if (column < 0) return false;
    headerRow = rowIndex;
    countColumn = column;
    return true;
  });
  if (headerRow < 0 || countColumn < 3) {
    throw new Error("找不到「可支援人數」那一格，這可能不是能力矩陣的表");
  }
  const sectionColumn = countColumn - 3;
  const itemColumns = [countColumn - 1, countColumn - 2];
  const header = rows[headerRow];
  const personColumns = header
    .map((text, column) => ({ text: text ?? "", column }))
    .filter(({ text, column }) => column > countColumn && clean(text));
  const warnings: string[] = [];

  // 先把每一列分到區塊裡（小區另外記，不算）。
  interface Section extends AbilitySection {
    rows: string[][];
  }
  const sections: Section[] = [];
  let current: Section | null = null;
  let inSub = false;
  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const label = clean(row[sectionColumn]);
    const listed = clean(row[countColumn]);
    if (label) {
      const task = taskOfSection(label);
      current = {
        label: label.replace(/\//g, ""),
        taskId: task === "ignored" ? null : task,
        ignored: task === "ignored",
        items: 0,
        listed: /^\d+$/.test(listed) ? Number(listed) : null,
        subSections: [],
        rows: [],
      };
      sections.push(current);
      inSub = false;
    } else if (current && /^\d+$/.test(listed)) {
      inSub = true;
      current.subSections.push(itemColumns.map((column) => clean(row[column])).filter(Boolean).reverse().join(" ") || "小區");
    }
    if (!current || inSub) continue;
    const item = itemColumns.map((column) => clean(row[column])).find(Boolean) ?? "";
    if (!item) continue;
    const marks = personColumns.map(({ column }) => markOf(row[column]));
    if (marks.every((mark) => mark === "blank")) continue; // 整列都沒人評：不算
    if (current.taskId && isExcluded(current.taskId, item)) continue;
    current.rows.push(personColumns.map(({ column }) => row[column] ?? ""));
    current.items += 1;
  }

  const used = sections.filter((section) => section.taskId);
  const seen = new Set<string>();
  for (const section of sections) {
    if (section.ignored) continue;
    if (!section.taskId) warnings.push(`「${section.label}」對不到醫師或工作，沒有算進去`);
    else if (seen.has(section.taskId)) warnings.push(`「${section.label}」重複出現，用第一個`);
    else seen.add(section.taskId);
  }
  const missing = ABILITY_TASKS.filter((task) => !seen.has(task.id));
  if (missing.length > 0) warnings.push(`表上沒有：${missing.map((task) => task.label).join("、")}（全部當作「不排」）`);

  const firstOf = (taskId: string) => used.find((section) => section.taskId === taskId);
  const columns: AbilityColumn[] = personColumns.map(({ text, column }, position) => {
    const nickname = clean(text.split(/[/\n]|Lv/i)[0]);
    const levels: Record<string, AbilityLevel> = {};
    const basis: Record<string, string> = {};
    for (const task of ABILITY_TASKS) {
      const section = firstOf(task.id);
      const result = levelOf(section ? section.rows.map((cells) => markOf(cells[position])) : []);
      levels[task.id] = result.level;
      basis[task.id] = result.basis;
    }
    return { column, header: text.replace(/\s+/g, " ").trim(), nickname, personId: matchPerson(nickname, people), levels, basis };
  });
  const others = sections.flatMap((section) => section.rows).flat().filter((text) => markOf(text) === "other");
  if (others.length > 0) warnings.push(`有 ${others.length} 格符號看不懂（例如「${clean(others[0])}」），當作還不會`);

  return {
    columns,
    sections: sections.map((section) => ({
      label: section.label,
      taskId: section.taskId,
      ignored: section.ignored,
      items: section.items,
      listed: section.listed,
      subSections: section.subSections,
    })),
    warnings,
  };
}

/** 依「欄 → 人員代號」的對照組成格子（同一個人對到兩欄時用前面那欄；沒對到的欄不放）。 */
export function gridOf(result: AbilityImport, mapping: Record<number, string | null>): { levels: AbilityGrid; basis: Record<string, Record<string, string>> } {
  const levels: AbilityGrid = {};
  const basis: Record<string, Record<string, string>> = {};
  for (const column of result.columns) {
    const personId = mapping[column.column] ?? null;
    if (!personId || levels[personId]) continue;
    levels[personId] = { ...column.levels };
    basis[personId] = { ...column.basis };
  }
  return { levels, basis };
}

/** 這一區算出幾位可獨立（給對照表上寫的可支援人數）。 */
export const soloCount = (result: AbilityImport, taskId: string) =>
  result.columns.filter((column) => column.levels[taskId] === "solo").length;
