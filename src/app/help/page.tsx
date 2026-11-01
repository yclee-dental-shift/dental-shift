"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { courseProfile } from "@/config/clinic.config";
import { isManagerViewer } from "@/components/ManagerOnly";
import { Segmented } from "@/components/Segmented";
import { useViewer } from "@/components/ViewerProvider";

/**
 * 使用說明：畫面上的長說明收進來；畫面上只留「?」小按鈕，按了再看。
 * 管理者看「管理／助理」兩份，助理只看助理的。每一段的 id 給 HelpTip 的 guide 連過來（/help#step-demand）。
 * 這裡只是說明，不存任何資料。
 */
type Guide = "manager" | "assistant";

const GUIDES = [
  ["manager", "管理"],
  ["assistant", "助理"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="info-card help-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ManagerGuide() {
  return (
    <>
      <Section id="pages" title="三個頁面">
        <ul className="rule-bullets">
          <li><strong>總覽</strong>：只看狀況。待確認、近期期限、本月工時、各月進度；點卡片到要處理的地方。</li>
          <li><strong>排班工作台</strong>：所有修改都在這裡，照 5 段流程走。</li>
          <li><strong>班表</strong>：只看，可切月／週、存成圖片、看排班統計。要改按「到排班工作台修改」。</li>
          <li>手機看班表：上方寫月份（選「週」再寫幾號到幾號），‹ › 換月或換週。「單日」的日期帶整個月都能左右滑；選「週」時這一週有淡淡的底，點別週的日子，上方的週會跟著換。</li>
        </ul>
      </Section>

      <Section id="flow" title="每月排班 5 段">
        <p className="help-text">工作台上方是流程列，分 5 段：<strong>人數</strong>（醫師與人數 → 管理者核准）→ <strong>排休</strong>（發布與排休 → 排休截止）→ <strong>排班</strong>（排班 → 行政檢查 → 管理者核准）→ <strong>助理確認</strong> → <strong>公告</strong>。</p>
        <p className="help-text">點一段，下面會列出那一段的小步驟和誰要做。只有「目前」那一步能操作；做完的步驟可以點開看，只能看；還沒輪到的是灰色。</p>
        <p className="help-text">做錯了可以往回：每一步上方有「退回到這一步」。手機上，流程在螢幕最左邊的灰色拉把，往右拉打開。</p>
      </Section>

      <Section id="step-demand" title="人數・醫師與人數">
        <ul className="rule-bullets">
          <li>先確認每天每一診的醫師。系統依醫師人數、樓層與兒牙醫師，算出每一診最少需要的助理人數。</li>
          <li>月曆每天最下排＝每診需求人數（早／午／晚）。灰框「調」＝手動調整過；淡黃底＝國定假日照常看診。</li>
          <li>點日期改那天的醫師、按 ＋／－ 調整人數；調過的標「調」，可恢復。</li>
          <li>改過的日子標「未存」。整頁改完按一次「儲存」才生效，再按最上面的「送給管理者確認」（最高管理者是「核定並發布」，直接同意並發布）。</li>
          <li>按鈕下面的「還差什麼」清單：✕＝要先處理（這個月有醫師看診、修改都已儲存），！＝提醒（和送出時不同、管理者退回的意見），點一項會跳過去。</li>
          <li>上方可切「月曆／班表」，看的是同一份資料。</li>
          <li>手機：點日期先在下方看那天的醫師與算法，按「編輯這一天」才修改。</li>
        </ul>
      </Section>

      <Section id="doctor-settings" title="醫師班表長期設定">
        <ul className="rule-bullets">
          <li>在「醫師與人數」最下面，平常收成一行，點開才看到；從月曆點「到每週固定班設定」會自動打開。每月醫師看診＝每週固定班＋專科醫師來診日，扣掉休診日。</li>
          <li>每週固定班可分版本，從某月起生效。括號＝有看診但不開放一般約診。</li>
          <li>休診日優先於固定班與來診日；週日與沒有醫師的日子也算休診。</li>
          <li>這裡的修改也要按上方「儲存」才會帶到班表。</li>
          <li>自動規則（例如某些醫師同時在時不排）列在「設定」頁；單日調整以你勾的為準。</li>
        </ul>
      </Section>

      <Section id="step-review" title="人數・管理者核准">
        <p className="help-text">最高管理者確認人數是否合理，兩種做法擇一：</p>
        <ul className="rule-bullets">
          <li>直接在月曆改醫師或人數，按「儲存」後「同意人數」。</li>
          <li>點日期寫那天的意見，按最上面的「退回給排班者」打開意見欄，寫好按「確定退回」；排班者在「醫師與人數」看到意見。</li>
        </ul>
      </Section>

      <Section id="step-release" title="排休・發布與排休">
        <ul className="rule-bullets">
          <li>發布人數：立即發布，或預約在日程的「人數發布」日自動發布。發布後助理才能排休。</li>
          <li>排休依日程開放：長假（同月 2 天以上）先開，一般排休後開。</li>
          <li>需要時可「暫停排休」或「收回發布」（在下面收起來的「需要修改時」）；已登記的排休會保留。</li>
        </ul>
      </Section>

      <Section id="step-leaveClosed" title="排休・排休截止">
        <p className="help-text">到了一般排休最後一天的隔天自動截止。大家都登記好了，可以「提早截止排休」；要延後就用「調整日程」。</p>
      </Section>

      <Section id="step-schedule" title="排班">
        <ul className="rule-bullets">
          <li>最上面兩個按鈕：「送行政專員檢查」與「一鍵排班」。下面「還差什麼」清單：✕＝要先處理才能送（排休截止、值班主管），！＝提醒（缺人、工時、希望不排卻排入、培訓清單），點一項會跳到要處理的地方。</li>
          <li>培訓清單、值班主管、目標工時平常收成一行，點開才看到內容。</li>
          <li>按「一鍵排班」補齊每診需求，再補工時到目標區間；不覆蓋已排的班與休假。</li>
          <li>盡量不排三診、兩頭班與連續晚診，不超過每月正常工時與休息規定。結果請人工確認。</li>
          <li>點格子可以手動改。電腦版的「補人」區塊列出缺人的診，點一診看誰可以排。</li>
          <li>月班表每格三個小方塊：左＝早診、中＝午診、右＝晚診，有排就填色（早＝金黃、午＝青綠、晚＝天藍）；空心＝有看診但不開放一般約診；斜紋＝機動（補工時多排的，有上班）。灰格打勾＝希望不排、照希望沒排；彩色方塊裡「!」＝希望不排、還是排了（點格子看申請與理由）。完整說明按班表右上角「圖例」。</li>
          <li>手機月曆每天三條，固定上＝早、中＝午、下＝晚，沒看診的診留空。數字＝已排／需求（大字已排、小字需求）；綠＝人夠，紅＝缺人。</li>
          <li>點助理的格子，每一診可以選「工作」（選填，沒選＝未分配）：跟那一診的某位醫師、跟醫師學習（新手，多出來的 1 人）、流動 1F／2F、櫃台、預留。</li>
          <li>格子下面的小字＝工作，例如「志明」「學志明」「流1」「櫃」「預」。橘字＝記的醫師這一診不看了，請改。改班別（例如早改午）工作會清掉，要重選。</li>
        </ul>
      </Section>

      <Section id="hours" title="工時目標">
        <ul className="rule-bullets">
          <li>每月正常工時＝應上班天數 × 8 小時。目標預設比正常工時少 8～10 小時，可逐月調整。</li>
          <li>一鍵排班補齊需求後，幫還沒到下限的人加排「機動」（行政、庫存、聯絡、教學等），補到目標內就停。</li>
          <li>有假別的排休每天算 8 小時；指定診次請假算那一診的時數；都含在工時裡。</li>
        </ul>
      </Section>

      <Section id="stats" title="排班統計">
        <ul className="rule-bullets">
          <li>每位助理一列：早／午／晚跟診、機動、特休、其他假、總時數、三診、兩頭班、晚診、連續晚診、週六。</li>
          <li>橘色＝比平均多 2 次以上（週六今年累計多 1 次以上）。</li>
          <li>紅色＝連續晚診太多天，或總時數不在目標內。</li>
          <li>平均只算這個月有排班的人。點名字跳到班表那一列。</li>
        </ul>
      </Section>

      <Section id="abilities" title="能力表">
        <ul className="rule-bullets">
          <li>每位助理對每位醫師、流動、櫃台一格：<strong>可獨立</strong>、<strong>需要有人帶</strong>、<strong>不排</strong>。</li>
          <li>每月在「能力表」上傳能力矩陣 Excel：照表上「可支援人數評估」換算（含自費、手術；Ø 不超過 3 個、沒有 △、※、空白＝可獨立）。Excel 只在這台裝置讀，不上傳。</li>
          <li>換算後會列出和表上「可支援人數」不一樣的區塊；點格子可以改，改過的標「調」。確認後選「評估與排班月份」再存（上傳時依檔名先選好）。</li>
          <li>每份寫「○月評估 → ○月起排班用」：例如 8 月評估、9/1 完成的表，9 月起排班用。</li>
          <li>排某個月時，用那個月或之前最近的一份；之後更新不影響已經排好的月份。</li>
          <li>最高管理者、助理長可以改；行政專員、排班負責人只能看；助理只看到自己那一列。</li>
          <li>一鍵排班照能力排：每一診的每位醫師先找一位可獨立的人跟；要人帶的新手多排 1 位（記「學習」，不算進人數）；新排的班自動記上跟哪位醫師、櫃台或流動；櫃台、流動 1F／2F 照那一診需求的人數排（人數手動調高的部分先算流動 1F，預留自己排），會的崗位少的人先排，排不滿的列在排完的訊息。</li>
          <li>人手不夠時先顧每診人數；排完的訊息會列出沒有可獨立的人跟的醫師，請手動調整。沒有能力表的月份照原本的排法。</li>
          <li>班表上的提醒：紅框＝記的工作他在能力表上不是可獨立（手動排的也標）；醫師格子橘框＝這一診沒有可獨立的人跟；字加底線＝帶新手 +1（不算人數）。格子視窗選工作時也會提醒，但不擋。</li>
          <li>總覽「待確認」會列出還沒正式公告的月份：幾診醫師沒有可獨立的人跟、幾人次排了不會的工作、培訓清單幾項沒照排。</li>
        </ul>
      </Section>

      <Section id="training" title="培訓清單">
        <ul className="rule-bullets">
          <li>在排班工作台「排班」那一步最上面（目標工時上面），點「培訓清單」打開。</li>
          <li><strong>培訓目標</strong>：某人這個月跟某位醫師（或流動、櫃台）最少幾診，或「這個月為主」（不設診數，例如這個月以櫃台為主）。排不下時先顧每診人數，可以寫一句沒排到的原因。</li>
          <li><strong>指定安排</strong>：某人、某天某一診、做什麼（例如跟某醫師學習）；目的（學習、考核、分配、其他）只是備註。</li>
          <li>旁邊照班表上記的「工作」算有沒有排到：跟診與學習都算；流動 1F、2F 都算流動。少 2 診以上而且超過目標的四分之一標紅色。</li>
          <li>最高管理者、助理長、這個月的排班負責人可以改；行政專員只能看；助理在「我的能力」只看到自己的。</li>
          <li>一鍵排班先排指定安排（休假、請假、超過工時規定才排不上），再把培訓目標的人優先排在他要跟的醫師那幾診；要人帶的照帶新手 +1 排。「為主」的人記工作時先拿那個崗位，以櫃台或流動為主的人先不拿去跟醫師（醫師真的沒人跟才用他）。沒排到的會列在排完的訊息。</li>
          <li><strong>希望不排和培訓目標</strong>：一鍵排班不會為了培訓蓋過希望不排。培訓清單「希望不排」欄＝那位醫師的診他希望不排了幾診、因此少幾診。能力表頁「培訓執行紀錄」列出每個月的情形（只有管理者），總覽「待確認」也會列。</li>
          <li><strong>崗位比例</strong>：排班統計下面，每人這個月跟各位醫師、櫃台、流動、學習、沒派各幾診，對照目標。現在照每個人的能力規劃，還不是平均分配。</li>
        </ul>
      </Section>

      <Section id="duty-supervisor" title="值班主管">
        <ul className="rule-bullets">
          <li>每一診都要有一位值班主管。</li>
          <li>自動帶出那一診上班的助理長，沒有再找組長；沒有的診，請在「排班」那一步的「值班主管」從那一診上班的人裡指定一位。機動、帶新手 +1 不能當主管。</li>
          <li>送行政專員檢查前，每一診都要有主管。公告後還可以改（「公告」段），例如主管臨時請假。</li>
          <li>沒有主管、或指定的人那天沒上班（例如臨時請假）時，總覽「待確認」會通知助理長處理；指定的人沒上班時先改由自動帶出的人。</li>
        </ul>
      </Section>

      <Section id="work-assignment" title="工作分配">
        <ul className="rule-bullets">
          <li>班表上方切「班表／工作分配」：一週一張，每一診每位醫師、流動、流動 2F、櫃檯排了誰，最下面「機動」＝有上班但沒排崗位的人；下面另有「雜務」。</li>
          <li><strong>班表為準</strong>：排在工作分配、但那一診沒上班的人標紅，上方「目前狀況」列出來。看到紅字請找這個月的排班負責人處理。</li>
          <li>改：最高管理者、助理長、這個月的排班負責人（排班那一步以後都能改）。點格子，從那一診上班的人裡勾選（照能力表排序）；跟診的人可改成「學習 +1」（不算人數）。</li>
          <li>手機一次看一天：上方日期帶可以左右滑，點一天看那天的分配。日期下的小點＝那天有哪幾診；紅點＝那天有沒上班卻排了崗位的人。</li>
          <li>只排一個崗位的人，班表上記的「工作」會跟著改。</li>
          <li>總表：每一診方塊正下方一個字＝那一診的崗位（醫師通常用姓，例如林＝林志明；流＝流動，2＝流動 2F，櫃＝櫃台）；表格上方「顯示崗位」可以關掉。</li>
        </ul>
      </Section>

      <Section id="step-clerkCheck" title="排班・行政檢查">
        <p className="help-text">行政專員看班表與排班統計，有問題按最上面「提出建議」，沒問題按「檢查沒問題」。建議不是退回，班表不會鎖住；負責人每則都要回覆，可以來回。</p>
      </Section>

      <Section id="step-ownerCheck" title="排班・管理者核准">
        <p className="help-text">負責人寫說明，按最上面「送最高管理者核准」；最高管理者按「同意，可以預公告」或「退回給負責人」（打開下面的原因欄）。</p>
      </Section>

      <Section id="step-confirm" title="助理確認（預公告）">
        <p className="help-text">預公告後，助理在確認期限前按「確認」或提出問題；逾期視同接受。大家都確認了，可以「提早結束確認，正式公告」。</p>
      </Section>

      <Section id="step-publish" title="公告">
        <p className="help-text">正式公告後班表鎖定。小改按最上面「臨時解鎖」；要大改在「需要修改時」撤回正式公告（原因必填）。</p>
      </Section>

      <Section id="timeline" title="班表日程">
        <ul className="rule-bullets">
          <li>都是日曆天，不扣假日。通則：人數發布＝前 4 個月 1 日；正式公告＝前 2 個月 1 日；預公告＝正式公告前 2 天。</li>
          <li>每個月可在工作台「調整日程」個別改；只存和通則不同的日期，改過的標「調」。</li>
          <li>預定日期過了還沒完成，標紅字「延遲」。</li>
        </ul>
      </Section>

      <Section id="manager-tips" title="其他">
        <ul className="rule-bullets">
          <li>每一頁的「?」：電腦滑鼠移上去、手機點一下，就看得到那裡的說明；「圖例」說明顏色與記號。</li>
          <li>手機從下方滑上來的視窗：往下拉、快速往下撥，或點變暗的地方都能關。</li>
          <li>「存成圖片」：班表、排班結果都可以存圖留紀錄。</li>
          <li>畫面：側欄下方（手機點右上角頭像）切換自動／白天／夜間。</li>
          <li>排班規則的數字在「設定」頁，只能看；要改請找系統負責人。</li>
        </ul>
      </Section>

    </>
  );
}

function AssistantGuide() {
  return (
    <>
      <Section id="assistant-pages" title="我的頁面">
        <ul className="rule-bullets">
          <li><strong>我的班表</strong>：下一班與每天的班；可切「單日／月曆」。月曆每天三條，固定上＝早（金黃）、中＝午（青綠）、下＝晚（天藍），沒排留空；休假三條都畫滿。看不懂按「圖例」。</li>
          <li><strong>排休申請</strong>：開放期間申請排休、指定診次不排。</li>
          <li><strong>待確認</strong>：預公告的班表，請在期限前確認。選單旁的數字＝還要確認幾份。</li>
          <li><strong>排班結果</strong>：每月工時、排休有沒有排入。</li>
          <li><strong>我的能力</strong>：你對每位醫師、流動、櫃台的能力狀態（可獨立、需要有人帶、不排）。</li>
          <li><strong>工作分配</strong>：我的班表「單日」每一診寫你的崗位與雜務；「月曆」文字顯示有排崗位就寫崗位（志明、櫃台、流1…；字加底線＝跟著學習），沒排崗位就寫早診／午診／晚診。</li>
        </ul>
      </Section>

      <Section id="assistant-leave" title="怎麼排休">
        <ul className="rule-bullets">
          <li>排休是申請，會盡量安排，但不保證排入；以正式公告的班表為準。</li>
          <li>點日期，選「整天」或「指定診次」，再選「用假」（選假別）或「不用假」（只希望休）。按「確認」就存好。</li>
          <li>很多天一樣：在視窗裡按「也套用到其他天」一起選。</li>
          <li>長假（同月 2 天以上）先開放，只能「整天・用假」；指定診次與不用假在一般排休開放後才能登記。</li>
          <li>排休先登記先得。日曆標「熱門」或「人數不足」的日子，請先和同事協調；不會擋你送出。</li>
          <li>排休截止後就不能新增、修改或取消。</li>
        </ul>
      </Section>

      <Section id="assistant-reason" title="事由">
        <p className="help-text">可以選大項目並寫事由，管理者會參考決定能否配合。只有你和管理者看得到。</p>
      </Section>

      <Section id="assistant-hours" title="工時怎麼算">
        <ul className="rule-bullets">
          <li>用假的整天排休算 8 小時；指定診次用假算那一診的時數。都算進每月工時。</li>
          <li>不用假（休息日、希望不排）不算時數，少的工時會排在別天。</li>
          <li>管理者可能把你的排休「改成休息日（不扣假）」，排班結果會寫出來。</li>
        </ul>
      </Section>

      <Section id="assistant-confirm" title="確認班表">
        <ul className="rule-bullets">
          <li>班表預公告後，在期限前按「確認」，或提出問題（只選類型，細節當面和管理者討論）。</li>
          <li>逾期沒回覆，視同接受。正式公告後班表才確定。</li>
        </ul>
      </Section>

      <Section id="assistant-tips" title="其他">
        <ul className="rule-bullets">
          <li>每一頁的「?」與「圖例」：點一下就看得到那裡的說明。</li>
          <li>畫面：點右上角頭像，可以切換自動／白天／夜間。</li>
          <li>手機從下方滑上來的視窗：往下拉，或點變暗的地方就能關。</li>
        </ul>
      </Section>
    </>
  );
}

const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

export default function HelpPage() {
  const { viewer } = useViewer();
  const manager = isManagerViewer(viewer);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<Guide | null>(null);
  const guide: Guide = manager ? (picked ?? (hash.startsWith("assistant") ? "assistant" : "manager")) : "assistant";

  // 從「?」的「看完整使用說明」連過來：捲到那一段。
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [hash, guide]);

  return (
    <main className="page-shell narrow-page help-page">
      <p className="eyebrow">{courseProfile.clinicName}</p>
      <h1>使用說明</h1>
      <p className="page-intro">
        畫面上的說明都收在「?」小按鈕裡，這裡是完整版。排班規則的數字{manager ? <>見 <Link href="/rules">設定</Link></> : "由管理者設定"}。
      </p>
      {manager && (
        <Segmented options={GUIDES} value={guide} onChange={setPicked} label="使用說明的對象" className="help-guide-toggle" />
      )}
      {guide === "manager" ? <ManagerGuide /> : <AssistantGuide />}
    </main>
  );
}
