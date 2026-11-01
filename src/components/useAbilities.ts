"use client";

import { useSyncExternalStore } from "react";
import { courseProfile } from "@/config/clinic.config";
import { readAbilities, subscribeAbilities } from "@/data/ability-store";
import { ABILITY_LEVEL_LABELS, abilityFor, type AbilityVersions } from "@/domain/rules/ability";
import { isLearnerEntry, uncoveredKeys, unableLevel } from "@/domain/rules/ability-schedule";
import type { ScheduleEntry } from "@/domain/types";

const EMPTY: AbilityVersions = {};

/** 所有月份的能力表（每月一份，見 `ability-store.ts`）。 */
export function useAbilities(): AbilityVersions {
  return useSyncExternalStore(subscribeAbilities, readAbilities, () => EMPTY);
}

const DOCTOR_SET = new Set(courseProfile.people.filter((person) => person.role === "doctor").map((person) => person.id));
const ASSISTANT_SET = new Set(courseProfile.people.filter((person) => person.role === "assistant").map((person) => person.id));
const SHIFT_IDS = courseProfile.shifts.map((shift) => shift.id);

/**
 * 班表格子的能力提醒（能力排班第 6 階段）：醫師這一診沒有可獨立的人跟（is-uncovered）、
 * 助理記了能力表上不是可獨立的工作（is-unable）、帶新手 +1（is-learner）。沒有能力表的月份不提醒。
 */
export function abilityMark(entry: ScheduleEntry, all: ScheduleEntry[], versions: AbilityVersions): { className: string; title: string } | null {
  if (entry.state !== "shift" || !entry.shiftId) return null;
  if (isLearnerEntry(entry)) return { className: "is-learner", title: "帶新手 +1（不算進人數）" };
  const levels = abilityFor(versions, entry.date.slice(0, 7))?.levels ?? null;
  if (!levels) return null;
  if (DOCTOR_SET.has(entry.personId)) {
    const keys = uncoveredKeys(all, entry.date.slice(0, 7), levels, SHIFT_IDS, DOCTOR_SET, ASSISTANT_SET);
    return keys.has(`${entry.date}|${entry.shiftId}|${entry.personId}`) ? { className: "is-uncovered", title: "這一診沒有可獨立的人跟這位醫師" } : null;
  }
  const level = unableLevel(entry, levels);
  return level ? { className: "is-unable", title: `能力表：${ABILITY_LEVEL_LABELS[level]}` } : null;
}
