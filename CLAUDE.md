# 牙醫診所排班系統：給 AI 的說明

這份是給幫診所改系統的 AI 看的。讀完再開始動手。

## 使用者

- 使用者是牙醫診所的醫師或負責人，**通常沒有程式背景**。
- 用使用者的語言回答，短句、白話，不用技術名詞；非用不可時順便用一句話解釋。
- 需要使用者決定的事，**一次只問一題**，附例子。
- GitHub、Cloudflare、指令、部署這些技術的事由你處理，不要丟給使用者自己研究；只有「申請帳號」「登入自己的帳號」「付款」要使用者本人做，告訴他到哪個網址、按哪裡。
- 每次修改前先說：要改什麼、會動到哪些地方、怎麼確認改好了；使用者同意再改。

## 第一次設定：照這個順序問

範例資料是一家虛構的「範例牙醫診所」。一題一題問，問完一段就改一段，改完讓使用者在畫面上看一次。

1. **診所名稱**（畫面上方顯示）。
2. **看診時段**：早、午、晚診各幾點到幾點（助理實際上班時間）。有沒有其他時段。
3. **醫師名單**：每位醫師的名字、是不是兒牙（兒牙在場時樓層與人數規則不同）、平常在幾樓。
4. **醫師每週固定班**：週一到週六，每一診有哪些醫師。哪些診「不開放一般約診」。
5. **專科醫師來診日**（矯正、兒牙、植牙等不固定的醫師）：哪幾天、哪幾診。可以之後在畫面上補。
6. **休診日**：國定假日、診所自己的休診日。國定假日照常看診、改到別天補休的也要問。
7. **助理名單**：名字、職稱（助理長、組長、助理、行政專員）、一個字的簡稱。誰是最高管理者（通常是院長或負責人）。
8. **每一診需要幾位助理**：照醫師人數、樓層怎麼算（先看範例的算法，問使用者哪裡不一樣）。
9. **工時**：每月應上班天數、目標工時（範例：比正常工時少 8～10 小時）、是不是四週變形工時。
10. **假別**：範例是特休、安胎、產假、產檢、病假、事假、婚假、喪假。
11. **排休日程**：多久前開放長假、一般排休、什麼時候公告（範例在 `leave.config.ts`）。
12. **排班偏好**：兩頭班、三診、連續晚診的限制（範例在 `scheduling-preferences.ts`）。

問不清楚的先照範例，跟使用者說「之後在畫面上用起來不對再改」。

## 要改的檔案

| 內容 | 檔案 |
| --- | --- |
| 診所名稱、時段、醫師與助理名單、簡稱、樓層、兒牙醫師 | `src/config/clinic.config.ts` |
| 姓名與職稱（決定誰是助理長、組長、行政專員） | `src/config/staff-directory.ts` |
| 醫師名字對代號、醫師特殊規則（某些診不排某醫師、不開放約診、顯示順序） | `src/config/doctors.ts` |
| 醫師每週固定班、專科來診日、休診日（預設值；畫面上也能改） | `src/config/doctor-schedule-2027.ts` |
| 國定假日照常看診、補休對照 | `src/config/holiday-swaps.ts` |
| 工時規則、每月應上班天數 | `src/config/labor.config.ts` |
| 假別、排休日程通則 | `src/config/leave.config.ts` |
| 事由大項目 | `src/config/leave-reason.config.ts` |
| 排班偏好（兩頭班、連續晚診等） | `src/config/scheduling-preferences.ts` |
| 能力表的工作項目與 Excel 換算 | `src/config/ability.config.ts`、`src/domain/rules/ability-import.ts` |
| 每診需要幾位助理的算法 | `src/domain/rules/assistant-demand.ts` |
| 班表從哪個月開始 | `src/components/schedule-settings.ts` 的 `FIRST_MONTH` |
| 網頁標題、圖示 | `src/app/layout.tsx`、`src/app/icon.svg`、`src/app/apple-icon.png`、`src/components/AppShell.tsx` 的品牌 |
| 使用說明頁 | `src/app/help/page.tsx`（規則改了，說明一起改） |

人員代號（`0001`、`1001`…）只是代號，可以照診所的員工編號改，但所有設定檔要一致；測試（`tests/`）裡也用到，一起改。

換年度時：`doctor-schedule-2027.ts` 的日期、`labor.config.ts` 的每月應上班天數、`holiday-swaps.ts` 都要補新年度。

## 資料與隱私

- **不得放入病人資料、病歷、約診內容。**
- 假別裡的安胎、產假、產檢、病假屬健康相關資訊；排休事由只給管理者和本人看。
- 這個版本的「模擬身分」只是在畫面上切換，**不是登入，也不是安全保護**。不要跟使用者說它能保護資料。
- 資料存在瀏覽器 localStorage。`src/data/` 裡的儲存名稱（`clinic-schedule-workshop:…`）**不要改名**，改了舊資料會讀不到。

## 上線（放到網路上）

網站是靜態網頁，`npm run build` 後的 `out/` 資料夾放到 Cloudflare Pages。

1. 請使用者申請 Cloudflare 帳號並在你的工具裡登入（`npx wrangler login`，使用者在瀏覽器按同意）。
2. `npm run build`，再 `npx wrangler pages deploy out --project-name 診所自己的英文名稱`。
3. **讓別人打開之前，一定要先上鎖**：用 Cloudflare Zero Trust 的 Access 建一個應用程式，保護這個網站的網址（含 `*.專案名稱.pages.dev`），規則只放診所員工的 email。先上鎖、再把網址給別人，不要先公開再補鎖。
4. 上鎖後自己用手機、電腦打開一次確認。

因為是本機模式：每個人在自己的瀏覽器裡各有一份資料，**還不能多人共用一份班表**。先讓使用者自己（或排班的人）在一台電腦上用，確認規則都對了，再考慮下一步。

## 之後：多人共用

要讓助理在自己手機上看班表、申請排休，需要：

1. **雲端資料庫**（例如 Cloudflare D1）：所有裝置讀寫同一份資料。所有資料讀寫都經過 `src/data/data-storage.ts`（各種設定與申請）和 `src/data/create-schedule-repository.ts`（班表），從這兩個地方接上去，其他畫面不用改。
2. **正式登入**（例如 Cloudflare Access＋Google 登入），伺服器知道是誰。
3. **伺服器端的權限檢查**：誰能改哪個月份、助理只能改自己的排休、事由與健康相關假別只給本人與管理者讀。畫面上的判斷規則在 `src/domain/rules/month-lead.ts`、`src/domain/rules/workflow.ts`，伺服器要用同一套。

**開啟雲端資料庫之前，一定要先完成第 2、3 項**，並先停下來跟使用者說明。畫面上 `useViewer()` 的 `member` 目前一律是 null，接上登入後填入登入者，畫面上「已登入」的部分就會出現。

## 修改後檢查

```bash
npm run verify   # lint、typecheck、test、build
```

另外用瀏覽器實際操作一次（電腦與手機寬度約 390px 都要看）：

1. 空白格可以排班。
2. 同一格早診改午診，不會重複。
3. 休假和班別不會同時存在。
4. 前後週、前後月可以切換。
5. 重新整理後資料還在。
6. 改了排班規則後，跑一次整月一鍵排班，確認每診補齊、沒有工時違規。

## 技術備註

- Next.js 靜態輸出（`next.config.ts` 的 `output: "export"`）：不能用需要伺服器的功能（Server Actions、讀 Request 的 Route Handlers、cookies、rewrites、redirects、headers）。
- 本專案的 Next.js 版本可能比你熟悉的新，改 Next.js 相關程式前先看 `node_modules/next/dist/docs/` 裡相關的文件。
- 核心資料規則：
  - 每一診一筆，ID 是 `日期_人員代號_班別`；同一診不重複。
  - 休假一筆 `日期_人員代號`，排休假會清掉當天所有診；當天再排診會移除休假。
  - `state: "shift"` 一定有 `shiftId`；`state: "leave"` 不能有 `shiftId`。
- 排班規則在 `src/domain/rules/`，每個規則都有測試在 `tests/`；改規則時一起改測試。
- 程式註解裡的「使用者 YYYY-MM-DD」是原本設計時的決定紀錄，可以忽略。
- 展示版：`src/demo/`、`src/app/start/`、`public/demo/seed.json` 是原作者公開展示網站用的（建置時設 `NEXT_PUBLIC_DEMO=1` 才會出現）。診所自己用不需要，可以整個刪掉（同時拿掉 `layout.tsx`、`AppShell.tsx` 裡引用的兩行）。
