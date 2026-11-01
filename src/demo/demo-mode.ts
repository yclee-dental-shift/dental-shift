/**
 * 展示版：建置時設 `NEXT_PUBLIC_DEMO=1`（只有公開的展示網站這樣建置）。
 * 打開時如果這個瀏覽器還沒有資料，先放入範例資料（`public/demo/seed.json`）；上方有提醒條與「重設範例資料」。
 * 一般版本（給診所自己用的）不設，這些都不會出現。
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** 這個瀏覽器已經放過範例資料。 */
export const DEMO_SEEDED_KEY = "clinic-schedule-workshop:demo-seeded:v1";
export const DEMO_SEED_URL = "/demo/seed.json";

/**
 * 開頁時最先執行（在畫面讀資料之前）：還沒放過範例資料就同步讀範例檔、寫進 localStorage。
 * 只有第一次打開或按「重設範例資料」之後才會讀檔。
 */
export const DEMO_SEED_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(DEMO_SEEDED_KEY)}))return;var x=new XMLHttpRequest();x.open("GET",${JSON.stringify(DEMO_SEED_URL)},false);x.send();if(x.status!==200)return;var d=JSON.parse(x.responseText);for(var k in d)localStorage.setItem(k,d[k]);localStorage.setItem(${JSON.stringify(DEMO_SEEDED_KEY)},"1")}catch(e){}})()`;

/** 清掉這個瀏覽器裡所有班表資料，重新整理後會再放入範例資料。畫面偏好（白天／夜間）保留。 */
export function resetDemoData() {
  try {
    const keep = new Set(["clinic-schedule-workshop:theme:v1"]);
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("clinic-schedule-workshop:") && !keep.has(key))
      .forEach((key) => window.localStorage.removeItem(key));
    window.sessionStorage.clear();
  } catch {
    // 瀏覽器不讓寫入時，重新整理也一樣
  }
  window.location.reload();
}
