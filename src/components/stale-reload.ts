/**
 * 網站更新後，舊分頁自動重新整理一次（使用者 2026-10-28：上線後點按鈕，畫面變成沒有樣式的文字）。
 * 網站換新版時，舊版的樣式、程式檔（`/_next/static/…`）就不在了；舊分頁換頁時去讀舊檔會失敗，畫面就壞掉。
 * 這段在開頁時先執行（`layout.tsx` 的 head）：讀 `/_next/` 的檔案失敗，或換頁時程式片段載不到，就重新整理整頁拿新版。
 * 同一個分頁 30 秒內只重新整理一次（sessionStorage），避免網路真的斷掉時一直重來。
 */
export const STALE_RELOAD_KEY = "clinic-schedule-workshop:stale-reload-at";

export const STALE_RELOAD_SCRIPT = `(function(){
  var KEY=${JSON.stringify(STALE_RELOAD_KEY)};
  function reload(){
    try{
      var last=Number(sessionStorage.getItem(KEY)||0);
      if(Date.now()-last<30000)return;
      sessionStorage.setItem(KEY,String(Date.now()));
    }catch(e){}
    location.reload();
  }
  window.addEventListener("error",function(event){
    var el=event.target;
    if(!el||el===window)return;
    var url=el.href||el.src||"";
    if((el.tagName==="LINK"||el.tagName==="SCRIPT")&&url.indexOf("/_next/")!==-1)reload();
  },true);
  window.addEventListener("unhandledrejection",function(event){
    var reason=event.reason;
    var text=String((reason&&(reason.name+" "+reason.message))||reason||"");
    if(/ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|Failed to fetch dynamically imported module/i.test(text))reload();
  });
})();`;
