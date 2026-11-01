"use client";

import Link from "next/link";
import { IS_DEMO, resetDemoData } from "./demo-mode";

/** 展示版每一頁最上面的提醒：資料只在這個瀏覽器、可以重設、想用在自己診所怎麼做。 */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner print-only-hide" role="note">
      <strong>展示版</strong>
      <span>名字都是範例；你改的資料只存在這個瀏覽器，別人看不到。</span>
      <Link className="button button-quiet" href="/start">用在自己診所</Link>
      <button
        type="button"
        className="button button-quiet"
        onClick={() => {
          if (window.confirm("清掉你在這個瀏覽器改過的資料，回到範例的樣子？")) resetDemoData();
        }}
      >
        重設範例資料
      </button>
    </div>
  );
}
