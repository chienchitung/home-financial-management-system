# 家用帳本 Demo

本機 Next.js 原型，管理固定帳單、薪資、每月新投入及股息。完整需求見 [公開版規格書](docs/specification.md)。

```sh
npm install
npm run build
npm run start -- --port 3000
```

開啟 http://127.0.0.1:3000 。API 與附件路由在 Vercel 環境停用，正式登入與資料庫尚未接入。

本機模式資料位於 `.demo-data/ledger.json`，照片位於 `.demo-data/attachments/`。首次新版寫入前保留 `.before-v020` 備份；舊版未留存的照片無法補回。`DEMO_DATA_DIR` 可指定隔離測試目錄。

```sh
npm test
npm run test:e2e
```

設定 `TEST_DATABASE_URL`（可拋棄的 Postgres 或 Neon 分支）時，`npm test` 另跑資料庫測試，`npm run test:e2e` 另以資料庫模式跑一輪帳本流程；測試使用獨立 schema 或帳本代號，不碰正式帳本。

瀏覽器測試需本機安裝 Google Chrome，並在 3101 埠（免登入）與 3102 埠（Google 登入模式，使用測試專用假憑證，不連線 Google）啟動獨立測試伺服器；先完成 build。測試結果與畫面位於 `test-results/`、`artifacts/`。測試不操作既有帳本。


## Google 登入

未設定時本機維持免登入 Demo。要啟用登入：

1. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 建立「OAuth 用戶端 ID」，類型選「網頁應用程式」。
2. 「已授權的重新導向 URI」填 `http://localhost:3000/api/auth/callback`（正式網址則填 `https://<網域>/api/auth/callback`）。
3. 複製 `.env.example` 為 `.env.local`，填入用戶端 ID、密鑰、`AUTH_SECRET` 與允許的 Email，重新 `npm run build` 後啟動，並用 `AUTH_URL` 的網址開啟。

只有 `ALLOWED_EMAILS` 內、且 Google 已驗證的 Email 能登入；從名單移除後，既有登入立即失效。登入狀態保留 7 天。變數只填一部分，或部署在 Vercel 卻未設定時，所有頁面與 API 會鎖定並顯示缺少的變數名稱。

## Neon 資料庫

未設定 `DATABASE_URL` 時，資料存在本機 `.demo-data/`。設定後改存 Postgres（Neon），所有登入的家人共用同一本帳本。

1. 在 [Neon](https://console.neon.tech) 建立專案，Connect 選「Pooled connection」，複製連線字串到 `.env.local` 的 `DATABASE_URL`。
2. 視需要設定 `LEDGER_DEFAULT_SALARY`（預設月薪，私人資訊只放環境變數）。
3. 第一次讀寫時會自動建立資料表；新的雲端帳本是空的，不含示範資料。
4. 要把本機既有帳本與照片搬上去：

```sh
npm run db:import
```

雲端帳本已有修改時腳本會拒絕覆寫；確定要以本機資料取代才加 `-- --force`。

雲端模式下「重設示範資料」隱藏且 API 拒絕執行（測試環境可設 `LEDGER_ALLOW_RESET=1`）。每次修改都在交易中鎖定帳本列，同時操作不會互相覆蓋，並記錄操作者與時間於 `ledger_events`。部署到 Vercel 時，在專案的 Environment Variables 設定 Google 登入與 `DATABASE_URL` 等變數；Vercel 函式的請求上限約 4.5 MB，較大的照片請先縮小。

## 新手操作

首頁的「本月進度」列出設定固定帳單、帳單收齊、投入與股息、薪資入帳四步，未完成的步驟可直接前往處理。帳單頁把本月固定帳單、草稿與已存帳單整合在同一張清單，點帳單名稱可查看或修改；收入與投資頁用一張表單填寫薪資、入帳日、投入與股息。尚未填完可保留草稿；誤建的草稿可確認後刪除。切換頁籤或月份時，系統會提醒未儲存修改；儲存失敗會保留輸入。

「本月帳單都已加入」只確認帳單沒有缺漏，不代表已繳款。「本月預計剩餘」會在帳單確認完整、投入及股息已填後顯示，並非銀行餘額。手機近半年圖表一次顯示六個月份，全年可左右滑動。

## 公開儲存庫範圍

這份儲存庫包含程式碼、測試與去識別化規格。範例金額均為示範用途，本機帳本、帳單照片、私人規格、環境設定及測試截圖不納入版本控制。

目前為本機 Demo。GitHub 保存原始碼，尚未提供可線上使用的帳本；Google 登入與 Neon 儲存已完成，正式上線前需在 Vercel 設定環境變數並實際部署驗證。
