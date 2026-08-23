# 網頁改版設計稿（野外手冊方向）

Claude Design 畫布的來源檔。每個 `.dc.html` 是畫布上的一張畫板。

| 檔案 | 內容 |
| --- | --- |
| `Main.dc.html` | 桌機版 1440 完整頁面 |
| `Mobile.dc.html` | 手機版 390 完整頁面 |
| `System.dc.html` | 設計系統對照表（色彩／字級／狀態／規格列） |
| `SketchA.dc.html` `SketchB.dc.html` | 未採用方向的低擬真對照草稿 |
| `canvas.json` | 畫布版面配置與分頁 |
| `assets-min/` | 站上照片壓縮後版本（每張 < 64 KB） |
| `build_main.py` `build_mobile.py` | 產生上述兩份頁面的樣板腳本 |
| `contours.txt` | 首屏等高線 SVG path |

## 重新產生與更新

```sh
cd design && python3 build_main.py && python3 build_mobile.py && cd ..

node "<design skill base dir>/seed-canvas.mjs" \
  --template "<design skill base dir>/payload.template.html" \
  --out mtselfguide-course-site.html \
  --title "自主登山協會課程網站改版" \
  --artboard design/Main.dc.html --artboard design/Mobile.dc.html \
  --artboard design/System.dc.html \
  --artboard design/SketchA.dc.html --artboard design/SketchB.dc.html \
  --canvas design/canvas.json \
  --image design/assets-min/og-cover.jpg \
  --image design/assets-min/card-offline-map.jpg \
  --image design/assets-min/card-camping.jpg \
  --image design/assets-min/card-terrain.jpg \
  --image design/assets-min/card-inreach.jpg \
  --image design/assets-min/card-fitness.jpg
```

產出的 `mtselfguide-course-site.html`（約 2.8 MB）可由來源檔重新產生，不納入版本控制。

## 與正式頁面的關係

`index.html` 已依本設計稿實作上線。實作階段又做了幾項調整，設計稿未回頭同步：

- 直式課程卡的狀態標籤改壓在照片左下角，讓標題可用滿整欄寬（原設計擠成三行）
- 對比調整：欄位名 `#7a8172` → `#62675b`、深底標註 `#aab29e` → `#b4bbaa`、
  橘底文字改純白、看板「報名」改深橘 `#94400f`、深底上的橘色數字改 `#ee9450`，
  全站文字對比皆達 WCAG AA
- 新增平板／窄螢幕的中間斷點行為

要看目前實際樣貌，請以 `index.html` 為準；本目錄保留的是方向定案時的設計稿。
