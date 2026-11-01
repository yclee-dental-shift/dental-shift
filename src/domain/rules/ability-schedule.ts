import { FLEX_SHIFT_NOTE } from "../../config/labor.config";
import type { ScheduleEntry } from "../types";
import type { AbilityGrid, AbilityLevel } from "./ability";
import { taskDoctorId } from "./shift-task";
import { countsForTarget, type TrainingAssignment, type TrainingPlan } from "./training";

/**
 * 一鍵排班照能力與培訓清單排（能力排班第 5 階段，使用者 2026-10-28，見 `docs/ability-plan.md` 第 5 節）。
 * - 每一診的每位醫師，要有一位能「可獨立」跟他的人（`matchSession`：醫師 ↔ 助理的配對，找最多的組合）。
 * - 要人帶的新手跟某位醫師＝多出來的 1 人（工作 `learn-醫師代號`），不算進每診人數；一位醫師一診只帶 1 位。
 * - 指定安排先排、一定排（休假、請假、超過工時規定才排不上）；培訓目標排不下就跳過，先顧每診人數。
 * 這裡只放判斷，一鍵排班的流程在 `auto-schedule.ts`，畫面在 `ScheduleBoard.tsx`。
 */

/** 新手學習（帶新手 +1）：不算進每診人數。 */
export const isLearnerEntry = (entry: ScheduleEntry) => entry.state === "shift" && !!entry.task?.startsWith("learn-");

export const levelOf = (levels: AbilityGrid, personId: string, task: string): AbilityLevel => levels[personId]?.[task] ?? "none";

/** 一診裡參加配對的助理：上班、不是機動、不是新手學習、沒記工作或記的是跟某位醫師。 */
function matchable(entry: ScheduleEntry, assistantIds: Set<string>): boolean {
  if (entry.state !== "shift" || !assistantIds.has(entry.personId) || entry.note === FLEX_SHIFT_NOTE) return false;
  return !entry.task || entry.task.startsWith("doctor-");
}

export interface SessionMatch {
  /** 人員代號 → 工作（只有配到的人）。 */
  tasks: Map<string, string>;
  /** 沒有可獨立的人可以跟的醫師。 */
  uncovered: string[];
  /** 照需求還缺人的崗位（`counter`、`float-1`、`float-2`，一個位置一筆；沒給需求時是空的）。 */
  unfilledPosts: string[];
}

/** 一診的崗位需求（照每診人數的組成，`assistant-demand.ts` 的 `computeDemand`）：櫃台、流動 1F、流動 2F 各幾位。 */
export interface PostSlots {
  counter: number;
  float1: number;
  float2: number;
}

/**
 * 每診需求 → 崗位。人數手動調高的部分（`adjustment`）沒說是哪個崗位，先算流動 1F；預留不看能力、由排班者自己排（`docs/ability-plan.md` 第 2 節第 10 點）。
 */
export function postSlotsOf(demand: { counter: number; floats: { 1: number; 2: number }; adjustment?: number }): PostSlots {
  return { counter: demand.counter, float1: demand.floats[1] + Math.max(0, demand.adjustment ?? 0), float2: demand.floats[2] };
}

/** 崗位 → 能力表的工作。 */
const postAbility = (post: string) => (post === "counter" ? "counter" : "float");

export interface PostOptions {
  /** 這一診的崗位需求；沒有＝照舊（櫃台 1 位，其他人流動 1F／2F 輪流）。 */
  posts?: PostSlots;
  /** 誰先拿這個崗位（`counter`／`float`）：數字小的先（例如這個月以這個崗位為主＝0、培訓目標還沒排夠＝1、其他＝2）。 */
  postRank?: (personId: string, post: "counter" | "float") => number;
  /** 這個月以櫃台或流動為主的人：先不拿去配醫師，醫師真的沒人跟才用他。 */
  holdBack?: (personId: string) => boolean;
}

/**
 * 一診的配對：記好「跟某醫師」的人照記的（不是可獨立就不算有人跟）；其他人配給還沒人跟的醫師（要可獨立），找最多的組合。
 * prefer(人, 醫師)＝true 的組合先配（例如培訓目標）。剩下的人照崗位需求記櫃台、流動 1F／2F（使用者 2026-10-31，`PostOptions`）；
 * 超過需求的人不記（工作分配表上是「機動」）。沒給需求時照舊：櫃台 1 位，其他人流動 1F／2F 輪流。
 */
export function matchSession(
  doctorIds: string[],
  assistants: Array<{ personId: string; task?: string }>,
  levels: AbilityGrid,
  prefer: (personId: string, doctorId: string) => boolean = () => false,
  options: PostOptions = {},
): SessionMatch {
  const tasks = new Map<string, string>();
  const doctorOf = new Map<string, string>(); // 醫師 → 人
  const free: string[] = [];
  for (const assistant of assistants) {
    const fixed = taskDoctorId(assistant.task);
    if (fixed && assistant.task?.startsWith("doctor-")) {
      // 記好的照記的；但他不是可獨立的話，那位醫師還是算沒人跟（畫面標提醒）。
      tasks.set(assistant.personId, assistant.task);
      if (doctorIds.includes(fixed) && !doctorOf.has(fixed) && levelOf(levels, assistant.personId, assistant.task) === "solo") {
        doctorOf.set(fixed, assistant.personId);
      }
    } else if (!assistant.task) {
      free.push(assistant.personId);
    }
  }
  const open = doctorIds.filter((id) => !doctorOf.has(id));
  const personOf = new Map<string, string>(); // 人 → 醫師（這次配的）
  const solo = (personId: string, doctorId: string) => levelOf(levels, personId, `doctor-${doctorId}`) === "solo";

  // 增廣路徑：每個人試著配一位醫師，必要時讓已配的人換一位。
  const tryAssign = (personId: string, seen: Set<string>, edge: (p: string, d: string) => boolean): boolean => {
    for (const doctorId of open) {
      if (seen.has(doctorId) || !edge(personId, doctorId)) continue;
      seen.add(doctorId);
      const holder = [...personOf.entries()].find(([, d]) => d === doctorId)?.[0];
      if (!holder || tryAssign(holder, seen, edge)) {
        personOf.set(personId, doctorId);
        return true;
      }
    }
    return false;
  };
  // 以櫃台、流動為主的人最後才拿去配醫師（醫師沒人跟比較嚴重，所以還是會用他）。
  const held = free.filter((personId) => options.holdBack?.(personId));
  const first = free.filter((personId) => !held.includes(personId));
  for (const personId of first) tryAssign(personId, new Set(), (p, d) => solo(p, d) && prefer(p, d));
  for (const personId of first) if (!personOf.has(personId)) tryAssign(personId, new Set(), solo);
  for (const personId of held) if (!personOf.has(personId)) tryAssign(personId, new Set(), solo);

  for (const [personId, doctorId] of personOf) tasks.set(personId, `doctor-${doctorId}`);
  const covered = new Set([...doctorOf.keys(), ...personOf.values()]);
  const uncovered = doctorIds.filter((id) => !covered.has(id));
  const leftover = free.filter((personId) => !personOf.has(personId));
  if (!options.posts) {
    let counter = assistants.some((assistant) => assistant.task === "counter");
    let floor = 0;
    for (const personId of leftover) {
      if (!counter && levelOf(levels, personId, "counter") === "solo") {
        tasks.set(personId, "counter");
        counter = true;
      } else if (levelOf(levels, personId, "float") === "solo") {
        tasks.set(personId, floor % 2 === 0 ? "float-1" : "float-2");
        floor += 1;
      }
    }
    return { tasks, uncovered, unfilledPosts: [] };
  }
  // 照需求一個位置一個位置排：已記好的先扣掉；每個位置先挑「為主／目標」的人，再挑會的崗位少的人（會很多種的人留給後面的位置）。
  const have = (task: string) => assistants.filter((assistant) => assistant.task === task).length;
  const { posts } = options;
  const slots = [
    ...Array<string>(Math.max(0, posts.counter - have("counter"))).fill("counter"),
    ...Array<string>(Math.max(0, posts.float1 - have("float-1"))).fill("float-1"),
    ...Array<string>(Math.max(0, posts.float2 - have("float-2"))).fill("float-2"),
  ];
  const remaining = new Set(leftover);
  const skills = (personId: string) => ["counter", "float"].filter((task) => levelOf(levels, personId, task) === "solo").length;
  const rank = (personId: string, slot: string) => options.postRank?.(personId, postAbility(slot) as "counter" | "float") ?? 2;
  const unfilledPosts: string[] = [];
  for (const slot of slots) {
    const pick = [...remaining]
      .filter((personId) => levelOf(levels, personId, postAbility(slot)) === "solo")
      .sort((a, b) => rank(a, slot) - rank(b, slot) || skills(a) - skills(b))[0];
    if (!pick) {
      unfilledPosts.push(slot);
      continue;
    }
    tasks.set(pick, slot);
    remaining.delete(pick);
  }
  return { tasks, uncovered, unfilledPosts };
}

/** 某天某一診看診的醫師、參加配對的助理。 */
export function sessionPeople(entries: ScheduleEntry[], date: string, shiftId: string, doctorIds: Set<string>, assistantIds: Set<string>) {
  const session = entries.filter((entry) => entry.date === date && entry.shiftId === shiftId && entry.state === "shift");
  return {
    doctors: [...new Set(session.filter((entry) => doctorIds.has(entry.personId)).map((entry) => entry.personId))],
    assistants: session.filter((entry) => matchable(entry, assistantIds)),
  };
}

/** 這一診有幾位醫師配得到可獨立的人。 */
export function coveredCount(
  entries: ScheduleEntry[],
  date: string,
  shiftId: string,
  levels: AbilityGrid,
  doctorIds: Set<string>,
  assistantIds: Set<string>,
): number {
  const { doctors, assistants } = sessionPeople(entries, date, shiftId, doctorIds, assistantIds);
  return doctors.length - matchSession(doctors, assistants, levels).uncovered.length;
}

/** 培訓目標裡「跟某位醫師」的部分：可獨立的人＝排班時優先；其他（要人帶）＝帶新手 +1。 */
export function doctorTargets(plan: TrainingPlan | undefined, levels: AbilityGrid | null) {
  const solo: Array<{ personId: string; doctorId: string; minSessions: number }> = [];
  const learner: Array<{ personId: string; doctorId: string; minSessions: number }> = [];
  for (const target of plan?.targets ?? []) {
    if (!target.task.startsWith("doctor-")) continue;
    const item = { personId: target.personId, doctorId: target.task.slice("doctor-".length), minSessions: target.minSessions };
    if (levels && levelOf(levels, target.personId, target.task) !== "solo") learner.push(item);
    else solo.push(item);
  }
  return { solo, learner };
}

export interface PrePlacementContext {
  /** 這位助理加排這一診是否仍符合工時與休息規定。 */
  canAssign: (personId: string, date: string, shiftId: string, entries: ScheduleEntry[]) => boolean;
  /** 這一診請假（用假）。 */
  leaveOff: (personId: string, date: string, shiftId: string) => boolean;
  /** 登記「希望不排」。 */
  requestedOff: (personId: string, date: string, shiftId: string) => boolean;
  doctorIds: Set<string>;
  /** 新排的班的時間；沒有＝現在。 */
  now?: number;
}

const newShift = (date: string, personId: string, shiftId: string, task: string, now = Date.now()): ScheduleEntry => ({
  id: `${date}_${personId}_${shiftId}`,
  date,
  personId,
  state: "shift",
  shiftId,
  task,
  updatedAt: now,
});

/** 這一診能不能先排進去：那天沒休、這一診還沒排、沒請假、符合工時規定。 */
function placeable(all: ScheduleEntry[], personId: string, date: string, shiftId: string, context: PrePlacementContext): boolean {
  const own = all.filter((entry) => entry.personId === personId && entry.date === date);
  if (own.some((entry) => entry.state === "leave" || entry.shiftId === shiftId)) return false;
  if (own.filter((entry) => entry.state === "shift").length >= 3) return false;
  if (context.leaveOff(personId, date, shiftId)) return false;
  return context.canAssign(personId, date, shiftId, all);
}

/** 先排指定安排（一定排；希望不排也照排）。回傳新排的班。 */
export function placeAssignments(
  entries: ScheduleEntry[],
  assignments: TrainingAssignment[],
  dates: Set<string>,
  context: PrePlacementContext,
): ScheduleEntry[] {
  const placed: ScheduleEntry[] = [];
  for (const item of [...assignments].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!dates.has(item.date)) continue;
    const all = [...entries, ...placed];
    if (!placeable(all, item.personId, item.date, item.shiftId, context)) continue;
    // 學習（帶新手 +1）：那位醫師那一診要有看診，而且還沒有別的新手。
    const learnDoctor = item.task.startsWith("learn-") ? taskDoctorId(item.task) : undefined;
    if (learnDoctor && all.some((entry) => entry.date === item.date && entry.shiftId === item.shiftId && entry.task === item.task)) continue;
    placed.push(newShift(item.date, item.personId, item.shiftId, item.task, context.now));
  }
  return placed;
}

/**
 * 帶新手 +1：要人帶的培訓目標，在那位醫師看診的診平均排進去（記 `learn-醫師代號`），補到最少診數。
 * 已經排過的（班表上記了跟那位醫師或學習）先扣掉；希望不排、請假、休假、超過工時規定的診不排。
 */
export function placeLearners(
  entries: ScheduleEntry[],
  targets: Array<{ personId: string; doctorId: string; minSessions: number }>,
  dates: string[],
  shiftIds: string[],
  context: PrePlacementContext,
): ScheduleEntry[] {
  const placed: ScheduleEntry[] = [];
  for (const target of targets) {
    const months = new Set(dates.map((date) => date.slice(0, 7)));
    for (const month of months) {
      const all = () => [...entries, ...placed];
      const done = all().filter(
        (entry) =>
          entry.personId === target.personId &&
          entry.date.startsWith(month) &&
          (entry.task === `doctor-${target.doctorId}` || entry.task === `learn-${target.doctorId}`),
      ).length;
      let need = target.minSessions - done;
      if (need <= 0) continue;
      const sessions = dates
        .filter((date) => date.startsWith(month))
        .flatMap((date) => shiftIds.map((shiftId) => ({ date, shiftId })))
        .filter(({ date, shiftId }) =>
          entries.some((entry) => entry.date === date && entry.shiftId === shiftId && entry.state === "shift" && entry.personId === target.doctorId),
        );
      // 平均分散：從整個月的診裡每隔幾診挑一診，挑不到的再往後找。
      const step = Math.max(1, Math.floor(sessions.length / need));
      const order = [...sessions.filter((_, index) => index % step === 0), ...sessions.filter((_, index) => index % step !== 0)];
      for (const { date, shiftId } of order) {
        if (need <= 0) break;
        const current = all();
        if (current.some((entry) => entry.date === date && entry.shiftId === shiftId && entry.task === `learn-${target.doctorId}`)) continue;
        if (context.requestedOff(target.personId, date, shiftId)) continue;
        if (!placeable(current, target.personId, date, shiftId, context)) continue;
        placed.push(newShift(date, target.personId, shiftId, `learn-${target.doctorId}`, context.now));
        need -= 1;
      }
    }
  }
  return placed;
}

/**
 * 排完後替這次新排的班記工作（每一診配對一次）。已存在的班、已記工作的班不動；
 * 沒記工作的舊班一起參加配對（可能已經有人跟那位醫師），但不改它。
 */
export function assignTasks(
  entries: ScheduleEntry[],
  planned: ScheduleEntry[],
  levelsFor: (date: string) => AbilityGrid | null,
  doctorIds: Set<string>,
  assistantIds: Set<string>,
  prefer: (personId: string, doctorId: string, date: string) => boolean = () => false,
  options: {
    postsFor?: (date: string, shiftId: string) => PostSlots | undefined;
    postRank?: (personId: string, post: "counter" | "float", date: string, list: ScheduleEntry[]) => number;
    holdBack?: (personId: string, date: string) => boolean;
  } = {},
): ScheduleEntry[] {
  const all = [...entries, ...planned];
  const result = new Map<ScheduleEntry, ScheduleEntry>();
  const sessions = new Set(planned.filter((entry) => entry.state === "shift" && !entry.task).map((entry) => `${entry.date}|${entry.shiftId}`));
  for (const key of sessions) {
    const [date, shiftId] = key.split("|");
    const levels = levelsFor(date);
    if (!levels) continue;
    const { doctors, assistants } = sessionPeople(all, date, shiftId, doctorIds, assistantIds);
    const current = [...entries, ...planned.map((entry) => result.get(entry) ?? entry)];
    const { tasks } = matchSession(doctors, assistants, levels, (personId, doctorId) => prefer(personId, doctorId, date), {
      posts: options.postsFor?.(date, shiftId),
      postRank: options.postRank && ((personId, post) => options.postRank!(personId, post, date, current)),
      holdBack: options.holdBack && ((personId) => options.holdBack!(personId, date)),
    });
    for (const entry of planned) {
      if (entry.date !== date || entry.shiftId !== shiftId || entry.task || entry.state !== "shift" || entry.note === FLEX_SHIFT_NOTE) continue;
      const task = tasks.get(entry.personId);
      if (task) result.set(entry, { ...entry, task });
    }
  }
  return planned.map((entry) => result.get(entry) ?? entry);
}

/** 排完後：哪些診有醫師沒配到可獨立的人（只看已經排了助理的診）。 */
export function uncoveredSessions(
  entries: ScheduleEntry[],
  dates: string[],
  shiftIds: string[],
  levelsFor: (date: string) => AbilityGrid | null,
  doctorIds: Set<string>,
  assistantIds: Set<string>,
): Array<{ date: string; shiftId: string; doctorIds: string[] }> {
  return dates.flatMap((date) => {
    const levels = levelsFor(date);
    if (!levels) return [];
    return shiftIds.flatMap((shiftId) => {
      const { doctors, assistants } = sessionPeople(entries, date, shiftId, doctorIds, assistantIds);
      // 還沒排助理的診算「缺人」，不算能力問題。
      if (doctors.length === 0 || assistants.length === 0) return [];
      const { uncovered } = matchSession(doctors, assistants, levels);
      return uncovered.length ? [{ date, shiftId, doctorIds: uncovered }] : [];
    });
  });
}

/** 排完後：哪些診的櫃台、流動照需求還缺人（只看有能力表、已經排了助理的診）。`posts` 一個位置一筆。 */
export function unfilledPostSessions(
  entries: ScheduleEntry[],
  dates: string[],
  shiftIds: string[],
  postsFor: (date: string, shiftId: string) => PostSlots | undefined,
  levelsFor: (date: string) => AbilityGrid | null,
  assistantIds: Set<string>,
): Array<{ date: string; shiftId: string; posts: string[] }> {
  return dates.flatMap((date) => {
    if (!levelsFor(date)) return [];
    return shiftIds.flatMap((shiftId) => {
      const posts = postsFor(date, shiftId);
      const session = entries.filter(
        (entry) => entry.date === date && entry.shiftId === shiftId && entry.state === "shift" && assistantIds.has(entry.personId),
      );
      if (!posts || session.length === 0) return [];
      const count = (task: string) => session.filter((entry) => entry.task === task).length;
      const missing = [
        ...Array<string>(Math.max(0, posts.counter - count("counter"))).fill("counter"),
        ...Array<string>(Math.max(0, posts.float1 - count("float-1"))).fill("float-1"),
        ...Array<string>(Math.max(0, posts.float2 - count("float-2"))).fill("float-2"),
      ];
      return missing.length ? [{ date, shiftId, posts: missing }] : [];
    });
  });
}

/**
 * 一鍵排班要用的判斷（畫面與測試共用）：
 * coverageOf＝排他能讓這一診多一位醫師有可獨立的人跟（0）；trainingOf＝培訓目標還沒排夠、這一診有他要跟的醫師（0）；
 * canSwap＝交換後配得到可獨立的人不能變少；prefer＝記工作時培訓目標的人先配給他要跟的醫師。
 * levelsFor 回傳 null＝那個月沒有能力表，照原本的排法。
 */
export function abilityHooks(input: {
  levelsFor: (date: string) => AbilityGrid | null;
  planFor: (date: string) => TrainingPlan | undefined;
  doctorIds: Set<string>;
  assistantIds: Set<string>;
}) {
  const { levelsFor, planFor, doctorIds, assistantIds } = input;
  const soloTargetsOf = (date: string) => doctorTargets(planFor(date), levelsFor(date)).solo;
  const doctorPresent = (list: ScheduleEntry[], date: string, shiftId: string, doctorId: string) =>
    list.some((entry) => entry.date === date && entry.shiftId === shiftId && entry.state === "shift" && entry.personId === doctorId);
  /** 這個月和那位醫師同一診的次數還不夠。 */
  const pending = (list: ScheduleEntry[], personId: string, date: string, target: { doctorId: string; minSessions: number }) => {
    const month = date.slice(0, 7);
    const together = list.filter(
      (entry) =>
        entry.personId === personId && entry.state === "shift" && entry.date.startsWith(month) && !!entry.shiftId &&
        doctorPresent(list, entry.date, entry.shiftId, target.doctorId),
    ).length;
    return together < target.minSessions;
  };
  return {
    coverageOf(personId: string, date: string, shiftId: string, list: ScheduleEntry[]): number {
      const levels = levelsFor(date);
      if (!levels) return 0;
      const before = coveredCount(list, date, shiftId, levels, doctorIds, assistantIds);
      const trial: ScheduleEntry = { id: "trial", date, personId, state: "shift", shiftId, updatedAt: 0 };
      return coveredCount([...list, trial], date, shiftId, levels, doctorIds, assistantIds) > before ? 0 : 1;
    },
    trainingOf(personId: string, date: string, shiftId: string, list: ScheduleEntry[]): number {
      return soloTargetsOf(date).some(
        (target) => target.personId === personId && doctorPresent(list, date, shiftId, target.doctorId) && pending(list, personId, date, target),
      )
        ? 0
        : 1;
    },
    canSwap(before: ScheduleEntry[], after: ScheduleEntry[], date: string, shiftIds: string[]): boolean {
      const levels = levelsFor(date);
      if (!levels) return true;
      const covered = (list: ScheduleEntry[]) =>
        shiftIds.reduce((sum, shiftId) => sum + coveredCount(list, date, shiftId, levels, doctorIds, assistantIds), 0);
      return covered(after) >= covered(before);
    },
    prefer(personId: string, doctorId: string, date: string): boolean {
      return soloTargetsOf(date).some((target) => target.personId === personId && target.doctorId === doctorId);
    },
    /** 崗位先給誰：這個月以這個崗位為主＝0、這個崗位的目標還沒排夠＝1、其他＝2。 */
    postRank(personId: string, post: "counter" | "float", date: string, list: ScheduleEntry[]): number {
      const month = date.slice(0, 7);
      const targets = (planFor(date)?.targets ?? []).filter((target) => target.personId === personId && target.task === post);
      if (targets.some((target) => target.main)) return 0;
      const done = list.filter(
        (entry) => entry.personId === personId && entry.state === "shift" && entry.date.startsWith(month) && countsForTarget(post, entry.task),
      ).length;
      return targets.some((target) => done < target.minSessions) ? 1 : 2;
    },
    /** 這個月以櫃台或流動為主：先不拿去配醫師。 */
    holdBack(personId: string, date: string): boolean {
      return (planFor(date)?.targets ?? []).some((target) => target.personId === personId && target.main && (target.task === "counter" || target.task === "float"));
    },
  };
}

/** 班表的工作 → 能力表的工作（預留、學習不看能力＝null）。 */
export function abilityTaskOf(task: string | undefined): string | null {
  if (!task) return null;
  if (task.startsWith("doctor-")) return task;
  if (task === "float-1" || task === "float-2") return "float";
  if (task === "counter") return "counter";
  return null;
}

/** 記的工作他不是「可獨立」（手動排的也算）：回傳能力表上的狀態，沒問題回傳 null。 */
export function unableLevel(entry: ScheduleEntry, levels: AbilityGrid | null): AbilityLevel | null {
  const task = abilityTaskOf(entry.task);
  if (!levels || !task || entry.state !== "shift") return null;
  const level = levelOf(levels, entry.personId, task);
  return level === "solo" ? null : level;
}

const uncoveredCache = new WeakMap<ScheduleEntry[], Map<string, Set<string>>>();

/** 某個月沒有可獨立的人跟的「日期|診|醫師」（畫面標格子用；同一份班表只算一次）。 */
export function uncoveredKeys(
  all: ScheduleEntry[],
  month: string,
  levels: AbilityGrid | null,
  shiftIds: string[],
  doctorIds: Set<string>,
  assistantIds: Set<string>,
): Set<string> {
  if (!levels) return new Set();
  let byMonth = uncoveredCache.get(all);
  if (!byMonth) uncoveredCache.set(all, (byMonth = new Map()));
  const cacheKey = `${month}|${Object.keys(levels).length}|${JSON.stringify(levels).length}`;
  const cached = byMonth.get(cacheKey);
  if (cached) return cached;
  const dates = [...new Set(all.filter((entry) => entry.date.startsWith(month)).map((entry) => entry.date))];
  const keys = new Set(
    uncoveredSessions(all, dates, shiftIds, () => levels, doctorIds, assistantIds).flatMap((item) =>
      item.doctorIds.map((doctorId) => `${item.date}|${item.shiftId}|${doctorId}`),
    ),
  );
  byMonth.set(cacheKey, keys);
  return keys;
}

/** 一個月的能力問題（總覽用）：醫師沒有可獨立的人跟的診數、記了不會的工作的人次。 */
export function abilityIssueCounts(
  all: ScheduleEntry[],
  month: string,
  levels: AbilityGrid | null,
  shiftIds: string[],
  doctorIds: Set<string>,
  assistantIds: Set<string>,
): { uncovered: number; unable: number } {
  if (!levels) return { uncovered: 0, unable: 0 };
  const sessions = new Set([...uncoveredKeys(all, month, levels, shiftIds, doctorIds, assistantIds)].map((key) => key.split("|").slice(0, 2).join("|")));
  const unable = all.filter((entry) => entry.date.startsWith(month) && assistantIds.has(entry.personId) && unableLevel(entry, levels)).length;
  return { uncovered: sessions.size, unable };
}
