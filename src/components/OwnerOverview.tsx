import Link from "next/link";

export type Tone = "ok" | "warn" | "alert" | "muted";

export interface OverviewCard {
  label: string;
  value: number;
  unit: string;
  /** 數字為 0 時一律顯示灰色；不是 0 時用這個顏色。 */
  tone: Exclude<Tone, "muted" | "ok">;
  hint: string;
  /** 和上個月比較，例如「上月 5・多 3」。 */
  compare?: string;
  /** 點數字卡要去的地方（選填）。 */
  href?: string;
}

export interface OverviewItem {
  key: string;
  title: string;
  detail?: string;
  badges: Array<{ text: string; tone: Tone }>;
  actionLabel: string;
  href: string;
}

export function StatusBadge({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`status-badge tone-${tone}`}>{text}</span>;
}

/** 總覽頁上方的數字卡。只負責顯示，數字由 Dashboard 計算。 */
export function StatCards({ cards }: { cards: OverviewCard[] }) {
  return (
    <div className="stat-grid">
      {cards.map((card) => {
        const body = (
          <>
            <span className="stat-label">{card.label}</span>
            <strong className="stat-value">
              {card.value}
              <small>{card.unit}</small>
            </strong>
            <span className="stat-hint">{card.hint}</span>
            {card.compare && <span className="stat-compare">{card.compare}</span>}
          </>
        );
        const className = `stat-card tone-${card.value === 0 ? "muted" : card.tone}`;
        return card.href ? (
          <Link key={card.label} className={`${className} is-link`} href={card.href}>{body}</Link>
        ) : (
          <div key={card.label} className={className}>{body}</div>
        );
      })}
    </div>
  );
}

/** 總覽頁的待確認清單（包含所有月份）。 */
export function PendingCard({ monthLabel, items }: { monthLabel: string; items: OverviewItem[] }) {
  return (
    <section className="pending-card dash-card" aria-label="待確認">
      <h2>
        待確認
        <small>包含所有月份；上方數字卡只算 {monthLabel}</small>
      </h2>
      {items.length === 0 ? (
        <p className="pending-empty">目前沒有要處理的事。</p>
      ) : (
        <ul className="pending-list">
          {items.map((item) => (
            <li key={item.key}>
              <div className="pending-main">
                <strong>{item.title}</strong>
                {item.detail && <small>{item.detail}</small>}
              </div>
              <div className="pending-badges">
                {item.badges.map((badge) => <StatusBadge key={badge.text} {...badge} />)}
              </div>
              <Link className="button button-quiet" href={item.href}>{item.actionLabel}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
