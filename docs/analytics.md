# 網站流量與點擊追蹤說明

本站使用 **Google Analytics 4（GA4）** 追蹤每日流量、訪客來源，以及報名按鈕的點擊狀況。
追蹤碼直接寫在 `index.html` 內，沒有額外相依套件，也不影響網頁載入速度。

- **評估 ID**：`G-L4Y8KVS8ZP`（寫在 `index.html` 的 `<head>`，約第 25 行）
- **GA4 後台**：<https://analytics.google.com/>

---

## 一、上線後必做的兩件事

### 1. 確認有收到資料

1. 用手機或無痕視窗打開 <https://mtselfguide.com/>，捲動到底、點一下報名按鈕。
2. GA4 → 左側 **報表 → 即時**，30 秒內應看到 1 位使用者，
   下方「事件計數」會出現 `page_view`、`scroll_depth`、`signup_click`。

看得到 = 設定成功。

### 2. 註冊自訂維度（**漏掉就看不到細節**）

GA4 預設只統計事件「總次數」，不會自動拆分事件參數。
要看出「哪一門課的報名按鈕被點比較多」，必須先把參數註冊成自訂維度：

**管理 → 資料顯示 → 自訂定義 → 建立自訂維度**，依下表各建一個（範圍一律選「事件」）：

| 維度名稱（自訂） | 事件參數 | 用途 |
| --- | --- | --- |
| 課程代號 | `course_id` | 分辨是哪一門課的報名按鈕 |
| 課程名稱 | `course_name` | 報表上直接顯示中文課名 |
| 點擊位置 | `click_location` | `board`＝頂部開放報名看板，`card`＝課程卡按鈕 |
| 連結網址 | `link_url` | 點出去的目標網址 |
| 連結名稱 | `link_name` | `facebook_page`、`topbar_email`、`footer_email` |
| 捲動百分比 | `percent_scrolled` | 25 / 50 / 75 / 100 |
| 停留秒數 | `engaged_seconds` | 15 / 30 / 60 / 180 / 300 |

> ⚠️ 自訂維度**只對建立之後**收到的資料生效，不會回溯，所以請在上線當天就建好。

順帶建議把資料保留期限從預設 2 個月改成 14 個月：
**管理 → 資料收集和修改 → 資料保留 → 使用者和事件資料保留 → 14 個月**，
否則明年想回頭比較今年同期的報名狀況會沒有資料。

---

## 二、目前追蹤哪些事件

| 事件名稱 | 什麼時候送出 | 附帶參數 |
| --- | --- | --- |
| `page_view` | 每次有人打開網頁（GA4 自動） | — |
| `signup_click` | 點擊任一個「報名／立即報名」按鈕 | `course_id`、`course_name`、`click_location`、`link_url` |
| `contact_click` | 點擊頁首或頁尾的 Email 聯絡信箱 | `link_name`、`link_url` |
| `outbound_click` | 點擊頁尾 Facebook 粉專連結 | `link_name`、`link_url` |
| `scroll_depth` | 捲動到 25% / 50% / 75% / 100%（每個里程碑一次） | `percent_scrolled` |
| `time_on_page` | 停留滿 15 / 30 / 60 / 180 / 300 秒 | `engaged_seconds` |

目前已掛上追蹤的報名按鈕：

| `course_id` | 課程 | 出現位置 |
| --- | --- | --- |
| `terrain-2026-10` | 困難地形通過課程（10/3–4 高雄茂林） | `board`＋`card` |
| `strength-2026-09` | 科學化肌力登山指南工作坊（9/12 高雄） | `board`＋`card` |

**同一門課有兩個入口**：頁面頂部的「現正開放報名」看板（`board`），
以及各系列裡的課程卡按鈕（`card`）。兩者分開計數，可以看出訪客多半是
「一進站就從看板直接報名」還是「讀完課程說明才報名」，作為版面調整的依據。

**停留時間只累計分頁在前景的秒數**：使用者切到別的分頁或把瀏覽器縮到背景時會暫停計時，
數字反映真的有在看的時間，不會被掛著不關的分頁灌水。

---

## 三、每天要看什麼

### 每日流量與點擊

**報表 → 生命週期 → 參與 → 事件**
右上角把日期範圍改成「過去 30 天」。想看逐日曲線：點進某個事件
（例如 `signup_click`）→ 上方折線圖即為每日次數。

### 哪一門課、哪個位置比較多人按報名

**探索 → 空白（建立新探索）**

- 維度：加入「課程名稱」（`course_name`）與「點擊位置」（`click_location`）
- 指標：加入「事件計數」
- 篩選器：`事件名稱` 完全比對 `signup_click`

拉成表格即可看到每門課、每個入口各被點了幾次。把「日期」加進列就是逐日數字。

### 訪客從哪裡來

**報表 → 生命週期 → 流量開發 → 使用者獲取／流量開發**

主要看「工作階段 主要管道群組」與「工作階段 來源／媒介」，常見的會是：

| 顯示值 | 意思 |
| --- | --- |
| `m.facebook.com / referral`、`Social` | 從 Facebook 粉專或貼文點進來 |
| `google / organic` | Google 搜尋找到的 |
| `(direct) / (none)` | 直接輸入網址、書籤，或從 LINE／IG 等 App 點進來（無來源資訊） |

> LINE、Instagram、部分 App 內建瀏覽器不會帶來源資訊，會落在 `(direct)`。
> 想準確區分，請用下一節的 UTM 標記。

### 內容有沒有被看完

比較 `scroll_depth` 的 25% 與 100% 次數差距；
`time_on_page` 則可看出有多少人停留超過 1 分鐘。

---

## 四、想知道「哪一篇貼文帶人進來」→ 用 UTM 標記

在 Facebook / LINE 貼文貼網址時，在網址後面加上 UTM 參數，GA4 就會分開統計：

```
https://mtselfguide.com/?utm_source=facebook&utm_medium=social&utm_campaign=terrain_202610
https://mtselfguide.com/?utm_source=line&utm_medium=social&utm_campaign=strength_202609
```

- `utm_source`：來自哪個平台（`facebook` / `line` / `instagram` / `edm`）
- `utm_medium`：管道類型（社群貼文一律用 `social`）
- `utm_campaign`：這次宣傳的名稱，建議用「課程_年月」

之後在 **流量開發 → 工作階段 來源／媒介 ／ 廣告活動** 就能看到各篇貼文各帶進多少人。

---

## 五、之後新增課程卡要做什麼

追蹤是用事件委派寫的，新按鈕只要加上屬性就會自動被追蹤，**不用改 JavaScript**。
`index.html` 底部的「新增系列的樣板」註解區已經預先填好範例：

```html
<a class="btn" href="https://forms.gle/你的表單代碼" target="_blank" rel="noopener"
   data-ga-event="signup_click"
   data-ga-course-id="river-2026-01"
   data-ga-course-name="溯溪基礎班"
   data-ga-location="card">
  <span>立即報名</span>
  ...
</a>
```

- `data-ga-course-id`：英文代號，格式為「課程_年月」。
  **同一門課的不同梯次要用不同代號**，否則兩梯次的數字會混在一起。
- `data-ga-course-name`：中文課名，報表上直接顯示。
- `data-ga-location`：`card`（課程卡）或 `board`（頂部開放報名看板）。
  若課程也放進頂部看板，記得看板那一份要填 `board`。

其他外部連結（例如新增的社群連結）則加：

```html
data-ga-event="outbound_click" data-ga-link-name="instagram"
```

---

## 六、隱私與注意事項

- GA4 會寫入 `_ga` cookie 以辨識回訪者，屬第一方 cookie，不蒐集姓名、Email 等個資。
- 使用者若開啟廣告阻擋器或瀏覽器追蹤保護，資料會收不到，
  因此 GA4 的數字通常**略低於**實際流量，這是正常現象。
- 報名表單在 Google 表單上，GA4 只能追蹤到「點擊了報名按鈕」，
  無法得知是否真的完成填寫。想比對轉換率，請用表單的回應數對照 `signup_click` 次數。
- 若要暫時關閉追蹤，把 `index.html` 裡的 `GA_MEASUREMENT_ID` 改回
  `'G-XXXXXXXXXX'` 即可，追蹤碼會自動停用，網站功能不受影響。
