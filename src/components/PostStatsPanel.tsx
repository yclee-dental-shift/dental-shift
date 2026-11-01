"use client";

import { useMemo, useState } from "react";
import { ABILITY_TASKS } from "@/config/ability.config";
import { postCounts } from "@/domain/rules/post-stats";
import { taskShort } from "@/domain/rules/shift-task";
import { targetProgress } from "@/domain/rules/training";
import type { CoursePerson, ScheduleEntry } from "@/domain/types";
import { HelpTip } from "./HelpTip";
import { useTrainingPlans } from "./TrainingPanel";
import { useWorkAssignments } from "./WorkAssignmentBoard";

const targetLabel = (task: string) => ABILITY_TASKS.find((item) => item.id === task)?.label ?? task;
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/**
 * 崗位比例（第 5、6 步，班表統計下面；使用者 2026-10-31）：每位助理這個月跟各位醫師、櫃台、流動、學習、沒派崗位各幾診，
 * 旁邊對照培訓清單的目標。現在是照每個人的能力規劃，不是平均分配；以後要平均時也看這張。只有排班的人看得到。
 */
export function PostStatsPanel({ month, assistants, entries }: { month: string; assistants: CoursePerson[]; entries: ScheduleEntry[] }) {
  const [open, setOpen] = useState(false);
  const assignments = useWorkAssignments()[month];
  const plan = useTrainingPlans()[month];
  const rows = useMemo(
    () =>
      assistants
        .map((person) => ({ person, counts: postCounts(entries, person.id, month, assignments) }))
        .filter((row) => row.counts.worked > 0),
    [assistants, entries, month, assignments],
  );
  const goalsOf = (personId: string) =>
    (plan?.targets ?? [])
      .filter((target) => target.personId === personId)
      .map((target) => {
        const progress = targetProgress(target, entries, month);
        const what = `${target.task.startsWith("doctor-") ? "跟" : ""}${targetLabel(target.task)}`;
        return target.main
          ? { text: `${what}為主（${percent(progress.done, progress.worked)}）`, short: false }
          : { text: `${what}最少 ${target.minSessions}，排 ${progress.done}`, short: progress.short > 0 };
      });

  return (
    <section className="stats-panel" aria-label="崗位比例">
      <div className="stats-head">
        <strong>崗位比例</strong>
        <span className="assistant-hint">
          看每個人的崗位有沒有照規劃。
          <HelpTip title="崗位比例">
            <p>每人這個月跟各位醫師、櫃台、流動、學習（帶新手 +1）、沒派崗位各幾診；崗位以工作分配為準，沒有工作分配時用班表上記的工作。</p>
            <p>目標＝培訓清單：「最少幾診」沒達到標橘色；「為主」寫那個崗位佔上班幾成。</p>
          </HelpTip>
        </span>
        <button className="button button-quiet print-only-hide" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "收起" : "展開"}
        </button>
      </div>
      {open &&
        (rows.length === 0 ? (
          <p className="stats-ok">這個月還沒有排班。</p>
        ) : (
          <div className="table-scroll" tabIndex={0} aria-label="可水平捲動的崗位比例">
            <table className="stats-table post-stats-table">
              <thead>
                <tr>
                  <th scope="col">助理</th>
                  <th scope="col">上班</th>
                  <th scope="col">跟診</th>
                  <th scope="col">櫃台</th>
                  <th scope="col">流動</th>
                  <th scope="col">學習</th>
                  <th scope="col">沒派</th>
                  <th scope="col">目標</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ person, counts }) => {
                  const doctors = Object.entries(counts.doctors).sort((a, b) => b[1] - a[1]);
                  const goals = goalsOf(person.id);
                  return (
                    <tr key={person.id}>
                      <th scope="row">{person.displayName}</th>
                      <td>{counts.worked}</td>
                      <td className="post-doctors">
                        {doctors.length === 0 ? <span className="stats-zero">0</span> : doctors.map(([id, count]) => `${taskShort(`doctor-${id}`)} ${count}`).join("・")}
                      </td>
                      <td>{counts.counter || <span className="stats-zero">0</span>}</td>
                      <td>{counts.float || <span className="stats-zero">0</span>}</td>
                      <td>{counts.learn || <span className="stats-zero">0</span>}</td>
                      <td>{counts.none || <span className="stats-zero">0</span>}</td>
                      <td className="post-goals">
                        {goals.length === 0
                          ? "—"
                          : goals.map((goal, index) => (
                              <span key={index} className={goal.short ? "is-warn" : ""}>
                                {goal.text}
                              </span>
                            ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
