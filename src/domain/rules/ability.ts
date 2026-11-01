import { ABILITY_TASKS, type AbilityTask } from "../../config/ability.config";
import { seesAllOfMonth, type MonthLead, type RoleHolder } from "./month-lead";

/**
 * 能力表（使用者 2026-10-27，見 `docs/ability-plan.md`）：每位助理 × 每個工作一格，三種狀態。
 * 每月存一份（key＝從哪個月起生效）；排某個月時用「那個月或之前最近的一份」，已排好的月份不受之後更新影響。
 * 伺服器（`server/data-api.ts`、`server/permissions.ts`）與畫面共用這裡的判斷。
 */

/** solo＝可獨立、guided＝需要有人帶、none＝不排（還沒評）。 */
export type AbilityLevel = "solo" | "guided" | "none";

export const ABILITY_LEVELS: AbilityLevel[] = ["solo", "guided", "none"];
export const ABILITY_LEVEL_LABELS: Record<AbilityLevel, string> = { solo: "可獨立", guided: "需要有人帶", none: "不排" };
export const ABILITY_LEVEL_SHORT: Record<AbilityLevel, string> = { solo: "獨", guided: "帶", none: "—" };

/** personId → 工作代號 → 狀態。 */
export type AbilityGrid = Record<string, Record<string, AbilityLevel>>;

export interface AbilityVersion {
  /** 從這個月起生效（YYYY-MM）。 */
  month: string;
  /** 確認時間 YYYY-MM-DDTHH:mm。 */
  at: string;
  /** 誰確認的（姓名）。 */
  by: string;
  /** 上傳的檔名（只記名字，檔案本身不存）。 */
  source?: string;
  tasks: AbilityTask[];
  /** 確認後的狀態（排班用這個）。 */
  levels: AbilityGrid;
  /** Excel 換算出來的狀態（和 levels 不同的格子＝人工調整過）。 */
  imported?: AbilityGrid;
  /** 換算依據，例如「◎12 Ø2 ※1」（給確認時看）。 */
  basis?: Record<string, Record<string, string>>;
}

export type AbilityVersions = Record<string, AbilityVersion>;

/** 排某個月用哪一份：那個月或之前最近的一份（沒有＝null）。 */
export function abilityFor(versions: AbilityVersions, month: string): AbilityVersion | null {
  const key = Object.keys(versions)
    .filter((key) => key <= month)
    .sort()
    .pop();
  return key ? versions[key] : null;
}

const shiftMonth = (month: string, offset: number) => {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
};
const monthText = (month: string, withYear: boolean) =>
  `${withYear ? `${month.slice(0, 4)} 年 ` : ""}${Number(month.slice(5))} 月`;

/** 評估月份＝生效月份的前一個月（使用者 2026-10-27：8 月評估、9/1 完成的表，9 月起排班用）。 */
export const assessedMonthOf = (month: string) => shiftMonth(month, -1);

/** 畫面上一律這樣寫，例如「2026 年 8 月評估 → 9 月起排班用」；跨年時兩邊都寫年份。 */
export function abilityVersionLabel(month: string): string {
  const assessed = assessedMonthOf(month);
  const crossYear = assessed.slice(0, 4) !== month.slice(0, 4);
  return `${monthText(assessed, true)}評估 → ${monthText(month, crossYear)}起排班用`;
}

/**
 * 從檔名（例如「8月助理工作能力表_20260901.xlsx」）猜生效月份：檔名的月份是評估月份，下個月起排班用。
 * 年份取今年；評估月份比這個月還晚 1 個月以上時算去年的。讀不到＝null。
 */
export function effectiveMonthFromFileName(fileName: string, thisMonth: string): string | null {
  const found = fileName.match(/(\d{1,2})\s*月/);
  const value = found ? Number(found[1]) : NaN;
  if (!(value >= 1 && value <= 12)) return null;
  const year = Number(thisMonth.slice(0, 4));
  const assessed = `${year}-${String(value).padStart(2, "0")}`;
  return shiftMonth(assessed > shiftMonth(thisMonth, 1) ? `${year - 1}-${assessed.slice(5)}` : assessed, 1);
}

/** 能改能力表：最高管理者、助理長。 */
export const canEditAbilities = (viewer: RoleHolder) => viewer.role === "owner" || viewer.role === "lead";

/** 看得到所有人的能力：最高管理者、行政專員、助理長、這個月的排班負責人；其他人只看自己那一列。 */
export const seesAllAbilities = (viewer: RoleHolder, lead: MonthLead | null | undefined) =>
  viewer.role === "lead" || seesAllOfMonth(viewer, lead);

/** 只留某個人那一列（別人的格子、依據都拿掉）。 */
export function abilityRowOnly(version: AbilityVersion, personId: string | undefined): AbilityVersion {
  const pick = <T,>(grid: Record<string, T> | undefined) => (grid && personId && grid[personId] ? { [personId]: grid[personId] } : {});
  return {
    ...version,
    levels: pick(version.levels),
    ...(version.imported ? { imported: pick(version.imported) } : {}),
    ...(version.basis ? { basis: pick(version.basis) } : {}),
  };
}

const isText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const CODE = /^[A-Za-z0-9-]{1,64}$/;

function isGrid(value: unknown, check: (cell: unknown) => boolean): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([personId, row]) =>
      CODE.test(personId) &&
      !!row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      Object.entries(row as Record<string, unknown>).every(([taskId, cell]) => CODE.test(taskId) && check(cell)),
  );
}

const isLevel = (value: unknown) => ABILITY_LEVELS.includes(value as AbilityLevel);

/** 能力表一份的格式（伺服器存之前檢查）。 */
export function isAbilityVersion(value: unknown, month: string): value is AbilityVersion {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.month === month &&
    isText(record.at, 40) &&
    isText(record.by, 40) &&
    (record.source === undefined || isText(record.source, 200)) &&
    Array.isArray(record.tasks) &&
    record.tasks.length <= 50 &&
    record.tasks.every((task) => !!task && typeof task === "object" && CODE.test(String(task.id)) && isText(task.label, 40)) &&
    isGrid(record.levels, isLevel) &&
    (record.imported === undefined || isGrid(record.imported, isLevel)) &&
    (record.basis === undefined || isGrid(record.basis, (cell) => isText(cell, 60)))
  );
}

/** 工作清單：用那一份存的（舊版本的醫師名單），沒有就用目前設定。 */
export const tasksOf = (version: AbilityVersion | null) => (version?.tasks.length ? version.tasks : ABILITY_TASKS);

/** 人工調整過的格子數（沒有的格子＝不排）。 */
export function adjustedCount(version: Pick<AbilityVersion, "levels" | "imported">): number {
  const imported = version.imported;
  if (!imported) return 0;
  const people = new Set([...Object.keys(version.levels), ...Object.keys(imported)]);
  let count = 0;
  for (const personId of people) {
    const tasks = new Set([...Object.keys(version.levels[personId] ?? {}), ...Object.keys(imported[personId] ?? {})]);
    for (const taskId of tasks) {
      if ((version.levels[personId]?.[taskId] ?? "none") !== (imported[personId]?.[taskId] ?? "none")) count += 1;
    }
  }
  return count;
}
