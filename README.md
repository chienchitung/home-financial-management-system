# 家用帳本 Demo

本機 Next.js 原型，管理固定帳單、薪資、每月新投入及股息。完整需求見 [公開版規格書](docs/specification.md)。

```sh
npm install
npm run build
npm run start -- --port 3000
```

開啟 http://127.0.0.1:3000 。API 與附件路由在 Vercel 環境停用，正式登入與資料庫尚未接入。

資料位於 `.demo-data/ledger.json`，照片位於 `.demo-data/attachments/`。首次新版寫入前保留 `.before-v020` 備份；舊版未留存的照片無法補回。`DEMO_DATA_DIR` 可指定隔離測試目錄。

```sh
npm test
npm run test:e2e
```

瀏覽器測試需本機安裝 Google Chrome，並在 3101 埠啟動獨立測試伺服器；先完成 build。測試結果與畫面位於 `test-results/`、`artifacts/`。測試不操作既有帳本。


## 公開儲存庫範圍

這份儲存庫包含程式碼、測試與去識別化規格。範例金額均為示範用途，本機帳本、帳單照片、私人規格、環境設定及測試截圖不納入版本控制。

目前為本機 Demo。GitHub 保存原始碼，尚未提供可線上使用的帳本；正式上線前需完成登入與雲端儲存串接。
