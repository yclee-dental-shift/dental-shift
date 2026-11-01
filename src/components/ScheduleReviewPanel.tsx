"use client";

import { useState } from "react";
import { courseProfile } from "@/config/clinic.config";
import { formatDay, nowString } from "@/domain/dates";
import {
  ACTION_LABELS,
  addSuggestions,
  allReplied,
  askRecheck,
  clerkApprove,
  MAX_NOTE_TEXT,
  MAX_SUGGESTION_TEXT,
  ownerApprove,
  ownerReturn,
  removeSuggestion,
  replySuggestion,
  REVIEW_STATUS_LABELS,
  sendToOwner,
  snapshotChanges,
  withdrawReview,
  type ReviewSuggestion,
  type ScheduleReview,
} from "@/domain/rules/schedule-review";
import { ASSISTANT_IDS, ASSISTANT_NAMES } from "./schedule-settings";
import { scrollBehavior } from "./reduce-motion";
import { HelpTip } from "./HelpTip";
import { ScheduleChecklist, type ChecklistItem } from "./ScheduleChecklist";
import { showToast } from "./Toast";

/** 誰在看：最高管理者（什麼都能按）、這個月的排班負責人、行政專員、其他人（只能看）。 */
export interface ReviewActor {
  kind: "owner" | "lead" | "clerk" | "other";
  name: string;
}

const shiftLabel = (id: string) => courseProfile.shifts.find((shift) => shift.id === id)?.label ?? id;
const timeText = (at: string) => at.replace("T", " ").slice(5, 16).replace("-", "/");

/** `日期_人員_班別或休` → 「3/12（五） 林雅琪 晚診」。 */
function cellText(key: string): string {
  const [date, personId, shift] = key.split("_");
  return `${formatDay(date)} ${ASSISTANT_NAMES.get(personId) ?? personId} ${shift === "休" ? "休" : shiftLabel(shift)}`;
}

/** 送最高管理者確認之後改過的格子（新增／拿掉）。 */
export function SnapshotChanges({ review, current, title }: { review: ScheduleReview; current: string[]; title: string }) {
  if (!review.snapshot) return null;
  const { added, removed } = snapshotChanges(review.snapshot, current);
  if (added.length === 0 && removed.length === 0) return <p className="month-status-item">{title}：沒有改過。</p>;
  return (
    <div className="review-changes">
      <p className="month-status-warn">{title}：新增 {added.length} 格、拿掉 {removed.length} 格。</p>
      <ul className="issue-list">
        {removed.map((key) => <li key={`-${key}`}>拿掉 {cellText(key)}</li>)}
        {added.map((key) => <li key={`+${key}`}>新增 {cellText(key)}</li>)}
      </ul>
    </div>
  );
}

function SuggestionItem({
  item,
  canReply,
  canRemove,
  onReply,
  onRemove,
}: {
  item: ReviewSuggestion;
  canReply: boolean;
  canRemove: boolean;
  onReply: (kind: "adjusted" | "explained", text: string) => void;
  onRemove: () => void;
}) {
  const [kind, setKind] = useState<"adjusted" | "explained">(item.reply?.kind ?? "adjusted");
  const [text, setText] = useState(item.reply?.text ?? "");
  const [editing, setEditing] = useState(false);
  const target = [item.date ? formatDay(item.date) : "", item.personId ? ASSISTANT_NAMES.get(item.personId) ?? item.personId : ""].filter(Boolean).join(" ");
  const showForm = canReply && (!item.reply || editing);
  return (
    <li className="review-suggestion">
      <p>
        {target && <strong>{target}：</strong>}
        {item.text}
        <small> — {item.by} {timeText(item.at)}</small>
        {canRemove && !item.reply && (
          <button className="button button-quiet button-small" onClick={onRemove}>刪除</button>
        )}
      </p>
      {item.reply && !editing && (
        <p className="review-reply">
          {item.reply.kind === "adjusted" ? "已調整" : "說明原因"}
          {item.reply.text ? `：${item.reply.text}` : ""}
          <small> — {item.reply.by} {timeText(item.reply.at)}</small>
          {canReply && <button className="button button-quiet button-small" onClick={() => setEditing(true)}>改回覆</button>}
        </p>
      )}
      {!item.reply && !canReply && <p className="review-reply is-waiting">負責人還沒回覆</p>}
      {showForm && (
        <div className="review-reply-form">
          <label><input type="radio" checked={kind === "adjusted"} onChange={() => setKind("adjusted")} /> 已調整</label>
          <label><input type="radio" checked={kind === "explained"} onChange={() => setKind("explained")} /> 說明原因</label>
          <input
            type="text"
            value={text}
            maxLength={MAX_SUGGESTION_TEXT}
            placeholder={kind === "adjusted" ? "怎麼調整（選填）" : "為什麼這樣排（必填）"}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            className="button button-small"
            disabled={kind === "explained" && !text.trim()}
            onClick={() => {
              onReply(kind, text);
              setEditing(false);
            }}
          >
            回覆
          </button>
        </div>
      )}
    </li>
  );
}

/** 點了打開收起來的區塊並捲過去（和工作台的 jumpTo 一樣）。 */
function openSection(selector: string) {
  const target = document.querySelector(selector);
  if (target instanceof HTMLDetailsElement) target.open = true;
  target?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

/**
 * 「排班」段的「行政檢查」與「管理者核准」（`schedule-review.ts`）。
 * 版面（使用者 2026-10-30，第 4 輪）：最上面只放這個身分這時候該按的按鈕 →「目前狀況」清單 → 內容；
 * 提出建議、退回、撤回這類表單收成一行（<details>），點開才看到。
 * 放在步驟的唯讀範圍外面：行政專員不能改班表，但要能在這裡提出建議；按鈕依身分與狀態決定。
 */
export function ScheduleReviewPanel({
  step,
  monthDates,
  review,
  actor,
  current,
  snapshot,
  onSave,
}: {
  step: "clerkCheck" | "ownerCheck";
  monthDates: string[];
  review: ScheduleReview | null;
  actor: ReviewActor;
  /** 這一步是不是目前那一步（不是＝只能看）。 */
  current: boolean;
  /** 現在這個月的助理班表（`snapshotOf`）。 */
  snapshot: () => string[];
  onSave: (review: ScheduleReview) => void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [personId, setPersonId] = useState("");
  const [note, setNote] = useState(review?.ownerNote ?? "");
  const [reason, setReason] = useState("");
  if (actor.kind === "other") return <p className="month-status-item">班表審核只有這個月的排班負責人、行政專員與最高管理者看得到。</p>;
  if (!review) return <p className="month-status-item">負責人還沒送審。排好後在「排班」那一步按「送行政專員檢查」。</p>;
  const now = () => nowString();
  const isOwner = actor.kind === "owner";
  const canLead = current && (isOwner || actor.kind === "lead");
  const canClerk = current && (isOwner || actor.kind === "clerk");
  const status = review.status;
  const save = (next: ScheduleReview) => onSave(next);
  const unreplied = review.suggestions.filter((item) => !item.reply).length;

  const suggestionList = (
    <ul className="review-suggestions">
      {review.suggestions.length === 0 && <li className="month-status-item">沒有建議。</li>}
      {review.suggestions.map((item) => (
        <SuggestionItem
          key={item.id}
          item={item}
          canReply={canLead && (status === "clerk" || status === "revise" || status === "clerkOk")}
          canRemove={canClerk && (status === "clerk" || status === "revise")}
          onReply={(kind, replyText) => save(replySuggestion(review, item.id, { kind, text: replyText, at: now(), by: actor.name }))}
          onRemove={() => save(removeSuggestion(review, item.id))}
        />
      ))}
    </ul>
  );
  const history = (
    <details className="review-history">
      <summary>處理紀錄（{review.log.length}）</summary>
      <ol>
        {review.log.map((item, index) => (
          <li key={index}>
            {timeText(item.at)} {item.by}：{ACTION_LABELS[item.action]}
            {item.text ? `（${item.text}）` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
  // 撤回送審（往回走）：收進「需要修改時」，不一直攤在畫面上。
  const withdraw = canLead && status !== "editing" && status !== "returned" && (
    <details className="tool-details undo-tools">
      <summary className="help-line">
        <strong>需要修改時</strong>
        <small className="assistant-hint">撤回送審，回到排班</small>
      </summary>
      <button
        className="button button-quiet"
        onClick={() => {
          if (window.confirm("撤回送審，回到「排班」繼續修改？之後要重新送行政專員檢查。")) save(withdrawReview(review, now(), actor.name));
        }}
      >
        撤回送審，回到排班
      </button>
    </details>
  );
  const replyItem: ChecklistItem = {
    id: "replies",
    ok: unreplied === 0,
    level: "block",
    title: "建議回覆",
    detail: review.suggestions.length === 0 ? "沒有建議" : unreplied === 0 ? `${review.suggestions.length} 則都已回覆` : `還有 ${unreplied} 則沒回覆`,
    actionLabel: "看建議",
    onAction: review.suggestions.length > 0 ? () => openSection(".review-suggestions-anchor") : undefined,
  };

  if (step === "clerkCheck") {
    const clerkCanAct = canClerk && (status === "clerk" || status === "revise");
    return (
      <div className="review-panel">
        <div className="step-head-actions">
          {clerkCanAct && (
            <>
              <button
                className="button"
                onClick={() => {
                  // 還有建議沒回覆才問；一般「檢查沒問題」直接送出（使用者 2026-11-01）
                  if (unreplied > 0 && !window.confirm(`還有 ${unreplied} 則建議負責人沒回覆。確定這個月班表檢查沒問題？`)) return;
                  save(clerkApprove(review, now(), actor.name));
                  showToast("已通過檢查，負責人接著送最高管理者核准");
                }}
              >
                檢查沒問題
              </button>
              <button className="button button-quiet" onClick={() => openSection(".suggest-form")}>提出建議</button>
            </>
          )}
          {canLead && status === "revise" && (
            <button className="button" disabled={!allReplied(review)} title={!allReplied(review) ? "每則建議都回覆後才能請行政再看" : ""} onClick={() => save(askRecheck(review, now(), actor.name))}>
              請行政再看一次
            </button>
          )}
          <HelpTip title="行政檢查" guide="step-clerkCheck">
            <p>行政專員看班表與下面「排班統計」（晚診、三診、兩頭班、工時），有問題就提出建議。</p>
            <p>建議不是退回，班表不會鎖住；負責人每則都要回覆。</p>
          </HelpTip>
        </div>
        <ScheduleChecklist
          label="目前狀況"
          items={[
            {
              id: "status",
              ok: status === "clerkOk" || status === "owner" || status === "approved",
              level: "warn",
              title: "行政檢查",
              detail: status === "clerk" && canLead ? "等行政專員檢查中；這段時間仍可以改班表" : REVIEW_STATUS_LABELS[status],
            },
            replyItem,
          ]}
        />
        <div className="review-suggestions-anchor">{suggestionList}</div>
        {clerkCanAct && (
          <details className="tool-details review-form suggest-form">
            <summary className="help-line">
              <strong>提出建議</strong>
              <small className="assistant-hint">寫問題，可選哪一天、哪一位</small>
            </summary>
            <label>
              建議內容
              <textarea
                value={text}
                maxLength={MAX_SUGGESTION_TEXT}
                placeholder="例如：林雅琪這個月晚診 12 次，比平均多很多"
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <div className="review-target">
              <select aria-label="哪一天（選填）" value={date} onChange={(event) => setDate(event.target.value)}>
                <option value="">哪一天（選填）</option>
                {monthDates.map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}
              </select>
              <select aria-label="哪一位（選填）" value={personId} onChange={(event) => setPersonId(event.target.value)}>
                <option value="">哪一位（選填）</option>
                {ASSISTANT_IDS.map((id) => <option key={id} value={id}>{ASSISTANT_NAMES.get(id)}</option>)}
              </select>
            </div>
            <button
              className="button"
              disabled={!text.trim()}
              onClick={() => {
                save(addSuggestions(review, [{ text, date: date || undefined, personId: personId || undefined }], now(), actor.name));
                setText("");
                setDate("");
                setPersonId("");
              }}
            >
              送出這則建議
            </button>
          </details>
        )}
        {withdraw}
        {history}
      </div>
    );
  }

  const leadCanSend = canLead && status === "clerkOk";
  const ownerCanAct = current && isOwner && status === "owner";
  return (
    <div className="review-panel">
      <div className="step-head-actions">
        {leadCanSend && (
          <button
            className="button"
            disabled={!note.trim() || !allReplied(review)}
            title={!note.trim() ? "請先寫給最高管理者的說明" : !allReplied(review) ? "還有建議沒回覆" : ""}
            onClick={() => {
              save(sendToOwner(review, note, snapshot(), now(), actor.name));
              showToast("已送最高管理者核准");
            }}
          >
            送最高管理者核准
          </button>
        )}
        {/* 不能按的原因直接寫出來（使用者 2026-11-01：title 只有滑鼠移上去才看得到，手機看不到） */}
        {leadCanSend && (!note.trim() || !allReplied(review)) && (
          <span className="disabled-reason">{!allReplied(review) ? "還有建議沒回覆" : "請先在下面寫給最高管理者的說明"}</span>
        )}
        {ownerCanAct && (
          <>
            <button
              className="button"
              onClick={() => {
                save(ownerApprove(review, now(), actor.name));
                showToast("已同意，負責人接著可以預公告給助理確認");
              }}
            >
              同意，可以預公告
            </button>
            <button className="button button-quiet" onClick={() => openSection(".owner-return-form")}>退回給負責人</button>
          </>
        )}
      </div>
      <ScheduleChecklist
        label="目前狀況"
        items={[
          {
            id: "status",
            ok: status === "approved",
            level: "warn",
            title: "管理者核准",
            detail: !isOwner && status === "owner" ? "等最高管理者核准中" : REVIEW_STATUS_LABELS[status],
          },
          replyItem,
          ...(leadCanSend
            ? [{ id: "note", ok: !!note.trim(), level: "block" as const, title: "給最高管理者的說明", detail: note.trim() ? "已寫好" : "必填，寫在下面" }]
            : []),
        ]}
      />
      {status === "returned" && review.returnReason && <p className="month-status-warn">退回原因：{review.returnReason}</p>}
      {review.ownerNote && !leadCanSend && (
        <div className="review-note">
          <strong>負責人的說明</strong>
          <p>{review.ownerNote}</p>
        </div>
      )}
      {leadCanSend && (
        <div className="review-form">
          <label>
            給最高管理者的說明（必填）
            <textarea
              value={note}
              maxLength={MAX_NOTE_TEXT}
              placeholder="改了什麼、注意到哪些不平均、哪些是刻意的（例如為了訓練某人跟某位醫師，排比較多那位醫師的診）"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
      )}
      {(status === "owner" || status === "approved") && <SnapshotChanges review={review} current={snapshot()} title="送核准之後" />}
      <details className="review-history review-suggestions-anchor" open={status === "owner" && review.suggestions.length > 0}>
        <summary>行政建議與回覆（{review.suggestions.length}）</summary>
        {suggestionList}
      </details>
      {ownerCanAct && (
        <details className="tool-details review-form owner-return-form">
          <summary className="help-line">
            <strong>退回給負責人</strong>
            <small className="assistant-hint">寫原因，退回後要重新經過行政檢查</small>
          </summary>
          <label>
            退回原因
            <textarea value={reason} maxLength={MAX_NOTE_TEXT} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button
            className="button button-quiet"
            disabled={!reason.trim()}
            onClick={() => {
              save(ownerReturn(review, reason, now(), actor.name));
              setReason("");
            }}
          >
            確定退回
          </button>
        </details>
      )}
      {withdraw}
      {history}
    </div>
  );
}
