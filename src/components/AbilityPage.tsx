"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { courseProfile } from "@/config/clinic.config";
import { ABILITY_TASKS } from "@/config/ability.config";
import { readAbilities, saveAbility, subscribeAbilities } from "@/data/ability-store";
import { nowString, todayString } from "@/domain/dates";
import { LoadingSpinner } from "./LoadingSpinner";
import {
  ABILITY_LEVEL_LABELS,
  ABILITY_LEVEL_SHORT,
  abilityFor,
  abilityVersionLabel,
  adjustedCount,
  canEditAbilities,
  effectiveMonthFromFileName,
  tasksOf,
  type AbilityGrid,
  type AbilityLevel,
  type AbilityVersion,
  type AbilityVersions,
} from "@/domain/rules/ability";
import { gridOf, importAbilities, soloCount, type AbilityImport } from "@/domain/rules/ability-import";
import { readFirstSheet } from "@/domain/rules/xlsx-sheet";
import { HelpTip } from "./HelpTip";
import { isManagerViewer } from "./ManagerOnly";
import { ASSISTANTS, shiftMonth } from "./schedule-settings";
import { useViewer } from "./ViewerProvider";
import { MyTrainingList, TrainingWishHistory } from "./TrainingPanel";
import { useSchedule } from "./ScheduleProvider";

const EMPTY: AbilityVersions = {};
const NEXT: Record<AbilityLevel, AbilityLevel> = { solo: "guided", guided: "none", none: "solo" };
const TONE: Record<AbilityLevel, string> = { solo: "is-solo", guided: "is-guided", none: "is-none" };
/** 生效月份可選的範圍：2026 年 1 月起到 12 個月後。 */
const FIRST_VERSION_MONTH = "2026-01";
const timeText = (at: string) => at.replace("T", " ").slice(0, 16).replace(/-/g, "/");

interface Draft {
  month: string;
  source?: string;
  levels: AbilityGrid;
  imported?: AbilityGrid;
  basis?: Record<string, Record<string, string>>;
  /** 生效月份是照檔名猜的（畫面提醒可以改）。 */
  fromFileName?: boolean;
  /** 上傳的換算結果（修改舊的一份時沒有）。 */
  report?: AbilityImport;
  /** 表上的欄 → 人員代號。 */
  mapping?: Record<number, string | null>;
}

const assistantPeople = ASSISTANTS.map((person) => ({ id: person.id, displayName: person.displayName }));

/**
 * 能力表（使用者 2026-10-27，見 `docs/ability-plan.md`）：上傳每月的能力矩陣 Excel → 自動換算 → 逐格確認、調整 → 存成那個月起生效的一份。
 * 最高管理者、助理長能改；行政專員、排班負責人只能看；助理只看到自己那一列（伺服器另外擋）。
 * 排某個月時用那個月或之前最近的一份；一鍵排班照這份排（`ability-schedule.ts`）。
 */
const noopSubscribe = () => () => {};

export function AbilityPage() {
  // 身分與資料都在瀏覽器裡，建置時先顯示載入中。
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <main className="page-shell"><LoadingSpinner label="載入中…" /></main>;
  return <AbilityContent />;
}

function AbilityContent() {
  const { viewer, member, readOnly } = useViewer();
  const versions = useSyncExternalStore(subscribeAbilities, readAbilities, () => EMPTY);
  const { entries } = useSchedule();
  const months = useMemo(() => Object.keys(versions).sort().reverse(), [versions]);
  const thisMonth = todayString().slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picked && versions[picked] ? versions[picked] : abilityFor(versions, thisMonth) ?? (months[0] ? versions[months[0]] : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = !readOnly && (member ? canEditAbilities({ role: member.role }) : viewer === "owner" || viewer === "scheduler");
  const people = isManagerViewer(viewer) ? ASSISTANTS : ASSISTANTS.filter((person) => person.id === viewer);
  const tasks = draft ? ABILITY_TASKS : tasksOf(shown);

  // 有沒存的修改時，離開頁面前提醒。
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const report = importAbilities(await readFirstSheet(await file.arrayBuffer()), assistantPeople);
      const mapping = Object.fromEntries(report.columns.map((column) => [column.column, column.personId]));
      const { levels, basis } = gridOf(report, mapping);
      const guessed = effectiveMonthFromFileName(file.name, thisMonth);
      setDraft({
        month: guessed ?? thisMonth,
        fromFileName: !!guessed,
        source: file.name.slice(0, 200),
        levels,
        imported: levels,
        basis,
        report,
        mapping,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀不出這個檔案");
    }
  }

  function remap(column: number, personId: string | null) {
    if (!draft?.report || !draft.mapping) return;
    const mapping = { ...draft.mapping, [column]: personId };
    const { levels, basis } = gridOf(draft.report, mapping);
    setDraft({ ...draft, mapping, levels, imported: levels, basis });
  }

  function cycle(personId: string, taskId: string) {
    if (!draft) return;
    const current = draft.levels[personId]?.[taskId] ?? "none";
    setDraft({ ...draft, levels: { ...draft.levels, [personId]: { ...draft.levels[personId], [taskId]: NEXT[current] } } });
  }

  function editShown() {
    if (!shown) return;
    setMessage(null);
    setDraft({ month: shown.month, source: shown.source, levels: shown.levels, imported: shown.imported, basis: shown.basis });
  }

  function save() {
    if (!draft) return;
    const existing = versions[draft.month];
    if (existing && !window.confirm(`「${abilityVersionLabel(draft.month)}」已經有一份（${existing.by} ${timeText(existing.at)}），要用這份取代嗎？`)) return;
    const version: AbilityVersion = {
      month: draft.month,
      at: nowString(),
      by: member?.name ?? "模擬身分",
      ...(draft.source ? { source: draft.source } : {}),
      tasks: ABILITY_TASKS,
      levels: draft.levels,
      ...(draft.imported ? { imported: draft.imported } : {}),
      ...(draft.basis ? { basis: draft.basis } : {}),
    };
    if (!saveAbility(draft.month, version)) {
      window.alert("無法儲存（瀏覽器不允許寫入）。");
      return;
    }
    setPicked(draft.month);
    setDraft(null);
    setMessage(`已存好：${abilityVersionLabel(draft.month)}。`);
  }

  function remove() {
    if (!shown || !window.confirm(`刪除「${abilityVersionLabel(shown.month)}」這份能力表？刪了就不能復原。`)) return;
    if (!saveAbility(shown.month, undefined)) window.alert("無法儲存（瀏覽器不允許寫入）。");
    setPicked(null);
  }

  const grid = draft?.levels ?? shown?.levels ?? {};
  const imported = draft ? draft.imported : shown?.imported;
  const basis = draft ? draft.basis : shown?.basis;
  const monthChoices = Array.from({ length: 24 }, (_, index) => shiftMonth(shiftMonth(thisMonth, 12), -index)).filter(
    (month) => month >= FIRST_VERSION_MONTH,
  );
  const unmatched = draft?.report?.columns.filter((column) => !draft.mapping?.[column.column]) ?? [];
  const mappedTwice = new Set(
    Object.values(draft?.mapping ?? {}).filter((id, index, list) => id && list.indexOf(id) !== index),
  );

  return (
    <main className="page-shell">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>
        能力表{" "}
        <HelpTip title="能力表" guide="abilities">
          每位助理對每位醫師、流動、櫃台一格：可獨立、需要有人帶、不排。每月上傳能力矩陣 Excel 自動換算，確認後才生效。
          每份寫「○月評估 → ○月起排班用」：例如 8 月評估、9/1 完成的表，9 月起排班用。排某個月時，用那個月或之前最近的一份。
        </HelpTip>
      </h1>
      <p className="page-intro">
        {isManagerViewer(viewer)
          ? canEdit
            ? "上傳每月的能力矩陣，確認每一格後存起來。之後一鍵排班會照這裡排。"
            : "只有助理長與最高管理者可以改，這裡只能看。"
          : "你自己的能力狀態。有問題請找助理長。"}
      </p>

      {error && <p className="month-status-warn">{error}</p>}
      {message && <p className="info-callout">{message}</p>}

      {!draft && (
        <section className="info-card ability-toolbar">
          {months.length > 0 ? (
            <label className="ability-pick">
              <span>看哪一份</span>
              <select value={shown?.month ?? ""} onChange={(event) => setPicked(event.target.value)}>
                {months.map((month) => (
                  <option key={month} value={month}>
                    {abilityVersionLabel(month)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="assistant-hint">還沒有能力表。{canEdit ? "請上傳能力矩陣 Excel。" : ""}</p>
          )}
          {shown && (
            <p className="assistant-hint ability-meta">
              {shown.by} {timeText(shown.at)} 確認
              {shown.source ? `・檔案 ${shown.source}` : ""}
              {adjustedCount(shown) > 0 ? `・人工調整 ${adjustedCount(shown)} 格` : ""}
            </p>
          )}
          {canEdit && (
            <div className="toolbar-actions">
              <label className="button">
                上傳能力矩陣
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={upload} />
              </label>
              {shown && <button className="button button-quiet" onClick={editShown}>修改這一份</button>}
              {shown && <button className="button button-quiet" onClick={remove}>刪除這一份</button>}
            </div>
          )}
        </section>
      )}

      {draft && (
        <section className="info-card ability-draft">
          <h2>{draft.report ? "確認換算結果" : "修改能力表"}</h2>
          {draft.source && <p className="assistant-hint">檔案：{draft.source}（只在這台裝置讀，檔案本身不存）</p>}
          {draft.report && (
            <>
              <ul className="rule-bullets ability-sections">
                {draft.report.sections
                  .filter((section) => section.taskId)
                  .map((section) => {
                    const count = soloCount(draft.report!, section.taskId!);
                    const differs = section.listed !== null && section.listed !== count;
                    return (
                      <li key={section.label} className={differs ? "is-differ" : undefined}>
                        {section.label}：算出可獨立 {count} 位
                        {section.listed !== null ? `，表上寫 ${section.listed} 位` : ""}
                        {differs ? "（不一樣，請確認）" : ""}
                        {section.subSections.length > 0 ? `；${section.subSections.join("、")}另外一區，不算` : ""}
                      </li>
                    );
                  })}
              </ul>
              {draft.report.warnings.map((warning) => (
                <p key={warning} className="month-status-warn">{warning}</p>
              ))}
              {(unmatched.length > 0 || mappedTwice.size > 0) && (
                <p className="month-status-warn">
                  {unmatched.length > 0 ? `有 ${unmatched.length} 欄對不到人，請在下面選是誰。` : ""}
                  {mappedTwice.size > 0 ? "有人被選了兩次，只用前面那一欄。" : ""}
                </p>
              )}
              <details className="ability-mapping" open={unmatched.length > 0}>
                <summary>表上的名字對到誰</summary>
                <div className="ability-mapping-list">
                  {draft.report.columns.map((column) => (
                    <label key={column.column}>
                      <span>{column.header}</span>
                      <select
                        value={draft.mapping?.[column.column] ?? ""}
                        onChange={(event) => remap(column.column, event.target.value || null)}
                      >
                        <option value="">（不用這一欄）</option>
                        {ASSISTANTS.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            </>
          )}
          <label className="ability-pick">
            <span>評估與排班月份</span>
            <select value={draft.month} onChange={(event) => setDraft({ ...draft, month: event.target.value, fromFileName: false })}>
              {monthChoices.map((month) => (
                <option key={month} value={month}>
                  {abilityVersionLabel(month)}
                  {versions[month] ? "（已有一份）" : ""}
                </option>
              ))}
            </select>
          </label>
          {draft.fromFileName && <p className="assistant-hint">依檔名選的，不對請改。</p>}
          <p className="assistant-hint">點格子切換：可獨立 → 需要有人帶 → 不排。和 Excel 換算不同的格子標「調」。</p>
          <div className="toolbar-actions">
            <button className="button" onClick={save}>確認並儲存</button>
            <button
              className="button button-quiet"
              onClick={() => {
                if (window.confirm("放棄這次的修改？")) setDraft(null);
              }}
            >
              放棄
            </button>
          </div>
        </section>
      )}

      {(draft || shown) && (
        <section className="info-card">
          <div className="ability-legend">
            {(Object.keys(ABILITY_LEVEL_LABELS) as AbilityLevel[]).map((level) => (
              <span key={level} className={`ability-cell ${TONE[level]}`}>
                {ABILITY_LEVEL_SHORT[level]} {ABILITY_LEVEL_LABELS[level]}
              </span>
            ))}
            <HelpTip title="怎麼換算" label="圖例">
              照表上「可支援人數評估」：那位醫師的所有項目（含自費、手術）Ø 不超過 3 個、沒有 △、※、空白＝可獨立；
              有評分但不符合＝需要有人帶；完全沒評分＝不排。表上註明「先排外」的項目、舒眠手術小區不算。滑鼠停在格子上看依據。
            </HelpTip>
          </div>
          <div className="table-scroll">
            <table className="info-table ability-table">
              <thead>
                <tr>
                  <th scope="col">助理</th>
                  {tasks.map((task) => (
                    <th key={task.id} scope="col">
                      {task.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id}>
                    <th scope="row">{person.displayName}</th>
                    {tasks.map((task) => {
                      const level = grid[person.id]?.[task.id] ?? "none";
                      const adjusted = !!imported && (imported[person.id]?.[task.id] ?? "none") !== level;
                      const why = basis?.[person.id]?.[task.id];
                      const title = `${person.displayName}・${task.label}：${ABILITY_LEVEL_LABELS[level]}${why ? `（${why}）` : ""}${adjusted ? "，人工調整" : ""}`;
                      return (
                        <td key={task.id}>
                          {draft ? (
                            <button
                              type="button"
                              className={`ability-cell ${TONE[level]}${adjusted ? " is-adjusted" : ""}`}
                              title={title}
                              aria-label={title}
                              onClick={() => cycle(person.id, task.id)}
                            >
                              {ABILITY_LEVEL_SHORT[level]}
                              {adjusted && <small>調</small>}
                            </button>
                          ) : (
                            <span className={`ability-cell ${TONE[level]}${adjusted ? " is-adjusted" : ""}`} title={title}>
                              {ABILITY_LEVEL_SHORT[level]}
                              {adjusted && <small>調</small>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!isManagerViewer(viewer) && <MyTrainingList personId={viewer} fromMonth={thisMonth} entries={entries} />}
      {isManagerViewer(viewer) && <TrainingWishHistory entries={entries} />}
    </main>
  );
}
