import Link from "next/link";

/** 想用在自己診所：給一般人看的三個步驟（展示版提醒條連過來）。 */
export default function StartPage() {
  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">用在自己診所</p>
      <h1>三個步驟，交給 AI 改成你的診所</h1>
      <p className="page-intro">
        這個排班系統可以照你診所的醫師、助理、看診時間與人數規則修改。你不需要會寫程式，技術的部分由 AI 幫你處理。
      </p>
      <div className="tool-grid">
        <section className="tool-card">
          <p className="eyebrow">第 1 步</p>
          <h2>索取程式</h2>
          <p>程式只授權給作者同意的診所。請向提供這個網址給你的人索取：通常要給他一個 GitHub 帳號名稱（免費申請，約 5 分鐘）。</p>
          <a className="button button-quiet" href="https://github.com/signup" target="_blank" rel="noreferrer">申請 GitHub 帳號</a>
        </section>
        <section className="tool-card">
          <p className="eyebrow">第 2 步</p>
          <h2>準備兩個帳號</h2>
          <ul className="rule-bullets">
            <li><strong>Cloudflare</strong>：放你診所的網站，免費方案就夠。</li>
            <li><strong>AI 工具</strong>：能幫你改程式的 AI，例如 Claude Code。</li>
          </ul>
          <a className="button button-quiet" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">申請 Cloudflare 帳號</a>
        </section>
        <section className="tool-card">
          <p className="eyebrow">第 3 步</p>
          <h2>把這段話貼給 AI</h2>
          <blockquote className="start-quote">
            這是一個牙醫診所排班系統：（貼上拿到的程式網址）。請照裡面 CLAUDE.md 的說明，一題一題問我診所的設定（醫師、助理、看診時間、人數規則、假別），幫我改成我診所的樣子。改好後放到我的
            Cloudflare，並且上鎖，只讓我們診所的人進得去。
          </blockquote>
          <p>接下來照 AI 問的回答就好。</p>
        </section>
      </div>
      <section className="info-callout">
        <strong>先知道的事</strong>
        <ul className="rule-bullets">
          <li>第一版的資料存在各自的瀏覽器：先在一台電腦上排班，確認規則都對。</li>
          <li>要讓全診所在自己手機上看班表、申請排休，需要再加上雲端資料庫與登入，同樣交給 AI 照說明做。</li>
          <li>系統裡不要放病人資料。</li>
        </ul>
      </section>
      <p>
        <Link href="/">回到展示畫面</Link>
      </p>
    </main>
  );
}
