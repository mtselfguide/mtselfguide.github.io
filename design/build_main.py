# -*- coding: utf-8 -*-
contours = open("contours.txt").read()

INK="#15201A"; PAPER="#E8E2D4"; CARD="#F3EFE5"
RULE="#D6CDB8"; RULE2="#CDC4AE"; MUTED="#5A6353"; DIM="#7A8172"; SIG="#C2521C"

ARROW = '<svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M0 6h18M13 1l5 5-5 5" /></svg>'

def specs(items, pad="        "):
    out = ""
    for k, v in items:
        out += ('%(p)s<div class="spec-row">\n%(p)s  <span class="spec-key">%(k)s</span>\n'
                '%(p)s  <span class="spec-val">%(v)s</span>\n%(p)s</div>\n' % dict(p=pad, k=k, v=v))
    return out

def cta(url=None, label="立即報名"):
    if url:
        return ('        <a href="%s" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; padding: 16px 20px; background: %s; color: #F6F2E8; font-size: 16px; font-weight: 700; letter-spacing: .04em;">\n'
                '          <span>%s</span>\n          %s\n        </a>\n' % (url, SIG, label, ARROW))
    return ('        <div style="margin-top: 24px; padding: 16px 20px; border: 1px solid %s; color: %s; font-size: 15px; font-weight: 500; text-align: center;">\n'
            '          目前無場次，開課時間規劃中\n        </div>\n' % (RULE2, DIM))

def chipfilt(open_):
    return ('<span class="chip chip-open">報名中 OPEN</span>' if open_
            else '<span class="chip chip-closed">暫無場次 CLOSED</span>',
            "" if open_ else " filter: grayscale(.6) contrast(1.02);")

def vcard(img, alt, open_, title, en, desc, items, url=None):
    chip, filt = chipfilt(open_)
    return '''      <article style="display: flex; flex-direction: column; background: %(CARD)s; border: 1px solid %(RULE)s;">
        <figure style="height: 236px; overflow: hidden; margin: 0;">
          <img src="%(img)s" alt="%(alt)s" style="width: 100%%; height: 100%%; object-fit: cover; display: block;%(filt)s" />
        </figure>
        <div style="display: flex; flex-direction: column; flex-grow: 1; padding: 28px 28px 26px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px;">
            <div>
              <div class="key" style="margin-bottom: 6px;">%(en)s</div>
              <h3 style="font-size: 23px; font-weight: 700; line-height: 1.4; letter-spacing: -.01em;">%(title)s</h3>
            </div>
            %(chip)s
          </div>
          <p style="flex-grow: 1; margin-bottom: 20px; font-size: 15px; line-height: 1.95; color: %(MUTED)s;">%(desc)s</p>
%(specs)s%(cta)s        </div>
      </article>
''' % dict(CARD=CARD, RULE=RULE, MUTED=MUTED, img=img, alt=alt, filt=filt, en=en,
           title=title, chip=chip, desc=desc, specs=specs(items), cta=cta(url))

def hcard(img, alt, open_, title, en, desc, items, url=None):
    chip, filt = chipfilt(open_)
    return '''      <article style="display: flex; background: %(CARD)s; border: 1px solid %(RULE)s;">
        <figure style="width: 452px; flex-shrink: 0; overflow: hidden; margin: 0;">
          <img src="%(img)s" alt="%(alt)s" style="width: 100%%; height: 100%%; object-fit: cover; display: block;%(filt)s" />
        </figure>
        <div style="display: flex; flex-direction: column; flex-grow: 1; padding: 34px 36px 32px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 14px;">
            <div>
              <div class="key" style="margin-bottom: 6px;">%(en)s</div>
              <h3 style="font-size: 27px; font-weight: 700; line-height: 1.35; letter-spacing: -.01em;">%(title)s</h3>
            </div>
            %(chip)s
          </div>
          <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.95; color: %(MUTED)s;">%(desc)s</p>
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 40px;">
%(grid)s          </div>
%(cta)s        </div>
      </article>
''' % dict(CARD=CARD, RULE=RULE, MUTED=MUTED, img=img, alt=alt, filt=filt, en=en,
           title=title, chip=chip, desc=desc, grid=specs(items, "          "), cta=cta(url))

def section(anchor, num, en, title, sub, body):
    return '''  <section id="%(anchor)s" style="max-width: 1200px; margin: 0 auto; padding: 78px 60px 0;">
    <div style="display: flex; align-items: flex-end; gap: 22px; padding-bottom: 16px; margin-bottom: 30px; border-bottom: 2px solid %(INK)s;">
      <span class="mono" style="font-size: 46px; font-weight: 600; line-height: .82; color: %(SIG)s;">%(num)s</span>
      <div style="flex-grow: 1;">
        <div class="key" style="margin-bottom: 2px;">%(en)s</div>
        <h2 style="font-size: 32px; font-weight: 900; line-height: 1.25; letter-spacing: -.02em;">%(title)s</h2>
      </div>
      <p style="max-width: 340px; text-align: right; font-size: 14px; line-height: 1.8; color: %(MUTED)s;">%(sub)s</p>
    </div>
%(body)s  </section>
''' % dict(anchor=anchor, INK=INK, SIG=SIG, MUTED=MUTED, num=num, en=en, title=title, sub=sub, body=body)

# ── content (all copy taken from the live site) ────────────────────────────
C_MAP = vcard(
  "card-offline-map.jpg", "學員們在步道涼亭下練習操作手機離線地圖", False,
  "手機離線地圖【山林日誌】實用教學", "Offline Navigation",
  "為「完全不會用手機 GPS 離線地圖」的山友所設計，同時也是熟悉登山者的檢視課。學會掌握自己的指北針方向感，走一趟安全、安心的郊山路。",
  [("日期", "下一場規劃中，敬請關注粉絲專頁"),
   ("準備", "出發前手機安裝「山林日誌」App，即可參加")])

C_CAMP = vcard(
  "card-camping.jpg", "森林營地中架設的多頂帳篷，學員在天幕下整理裝備", False,
  "兩天一夜野營實戰系列", "Overnight Field Practice",
  "打包時，你是否因為擔心「萬一」而塞進過多裝備？行進間，是否總是依賴領隊的背影，忘了抬頭確認自己的位置？在兩天一夜的實戰中，把地圖知識轉化為行進直覺，並在真實環境中演練裝備管理與風險應變。",
  [("日期", "下一梯次規劃中，敬請關注粉絲專頁"),
   ("人數", "每梯限額 6 人，費用含接駁"),
   ("準備", "需自備帳篷、睡袋等裝備，行前安排說明會")])

C_TERRAIN = hcard(
  "card-terrain.jpg", "學員在陡峭巨石地形上以繩索確保，逐一通過", True,
  "困難地形通過課程", "Technical Terrain",
  "這不是單純的垂降體驗，也不是激流救生課程。我們從登山途中可能遇到的困難地形出發，學習觀察環境、判斷風險、選擇通過方式，並運用基礎繩索、團隊協作與渡溪技巧完成任務。更重要的是學會判斷：什麼時候可以通過，什麼時候應該等待、改道或撤退。",
  [("日期", '<time datetime="2026-10-03">10 月 3–4 日（六・日）</time>'),
   ("地點", "高雄茂林<br />集合：7-ELEVEN 茂林門市"),
   ("人數", "6 人成團，限額 12 人"),
   ("費用", "NT$5,000 ／人")],
  "https://forms.gle/ySAN9scVdrKiK14b9")

C_INREACH = hcard(
  "card-inreach.jpg", "講師在教室向學員講解台灣山區通訊涵蓋範圍", False,
  "Garmin inReach 教學", "Satellite Communication",
  "當手機收不到訊號，你還有辦法對外聯絡嗎？本講座帶你認識衛星通訊裝置 Garmin inReach 的功能與實際操作，建立山區通訊安全觀念，學會在關鍵時刻發出正確的求援訊息。",
  [("日期", "下一場規劃中，敬請關注粉絲專頁"),
   ("準備", "不需自備裝備，現場提供實機操作")])

C_FIT = hcard(
  "card-fitness.jpg", "健身房內學員在教練指導下進行硬舉訓練", True,
  "科學化肌力登山指南－交流體驗工作坊", "Strength &amp; Conditioning",
  "與璞實生活合辦，圍繞「能量系統與呼吸」、「核心肌力漸進負荷訓練」、「傷後恢復與強化」三大主軸。講師耀禾與肌力教練軒韋深度對談，並透過徒手操作與重訓器材檢測關節活動度、模擬登山動作，協助你調整發力習慣，把訓練成果帶上山。",
  [("日期", '<time datetime="2026-09-12T16:00">9 月 12 日（六）16:00–17:30</time>'),
   ("地點", "璞實生活<br />高雄市三民區九如一路 26 號"),
   ("人數", "極限量小班制，限額 8 人"),
   ("費用", "NT$1,000")],
  "https://forms.gle/T7KzQtEXwVeevw259")

NAV_ITEMS = [("#hiking", "01 新手入門"), ("#terrain", "02 困難地形"),
             ("#comm-safety", "03 通訊安全"), ("#fitness", "04 體能訓練")]
nav = "".join('        <a href="%s" style="padding: 8px 2px; font-size: 14px; font-weight: 500; color: #C9C7BC; border-bottom: 2px solid transparent;">%s</a>\n' % i for i in NAV_ITEMS)

def board_row(date_big, date_small, title, meta, url):
    return '''        <a href="%(url)s" target="_blank" rel="noopener" style="display: flex; align-items: center; gap: 26px; padding: 22px 26px; background: %(CARD)s; border: 1px solid %(RULE)s; border-top: 3px solid %(SIG)s; color: %(INK)s;">
          <div style="flex-shrink: 0; width: 104px;">
            <div class="mono" style="font-size: 30px; font-weight: 600; line-height: 1; letter-spacing: -.02em;">%(date_big)s</div>
            <div class="key" style="margin-top: 5px;">%(date_small)s</div>
          </div>
          <div style="flex-grow: 1;">
            <div style="font-size: 19px; font-weight: 700; line-height: 1.4;">%(title)s</div>
            <div style="margin-top: 3px; font-size: 13.5px; color: %(MUTED)s;">%(meta)s</div>
          </div>
          <span style="flex-shrink: 0; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: %(SIG)s;">報名 %(ARROW)s</span>
        </a>
''' % dict(url=url, CARD=CARD, RULE=RULE, SIG=SIG, INK=INK, MUTED=MUTED,
           date_big=date_big, date_small=date_small, title=title, meta=meta, ARROW=ARROW)

board = (board_row("09.12", "SAT 16:00", "科學化肌力登山指南－交流體驗工作坊",
                   "高雄・璞實生活 ｜ 限額 8 人 ｜ NT$1,000", "https://forms.gle/T7KzQtEXwVeevw259")
       + board_row("10.03", "SAT–SUN", "困難地形通過課程",
                   "高雄茂林 ｜ 6 人成團・限額 12 人 ｜ NT$5,000", "https://forms.gle/ySAN9scVdrKiK14b9"))

HTML = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700;900&display=swap" />
  <style>
    body {
      margin: 0;
      background: %(PAPER)s;
      color: %(INK)s;
      font-family: "Noto Sans TC", system-ui, "Helvetica Neue", sans-serif;
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
      text-wrap: pretty;
    }
    a { color: %(SIG)s; text-decoration: none; }
    a:hover { color: #94400F; }
    h1, h2, h3, p, figure { margin: 0; padding: 0; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace; }
    .key {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 11px; font-weight: 500; letter-spacing: .16em;
      text-transform: uppercase; color: %(DIM)s;
    }
    .spec-row {
      display: flex; align-items: baseline; gap: 16px;
      padding: 11px 0; border-top: 1px solid %(RULE)s;
    }
    .spec-key {
      width: 42px; flex-shrink: 0;
      font-size: 12.5px; font-weight: 500; letter-spacing: .1em; color: %(DIM)s;
    }
    .spec-val { font-size: 15px; font-weight: 500; line-height: 1.6; }
    .chip {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 11px; font-weight: 600; letter-spacing: .12em;
      padding: 5px 10px; white-space: nowrap; align-self: flex-start;
    }
    .chip-open { background: %(SIG)s; color: #F6F2E8; }
    .chip-closed { border: 1px solid #B6AC94; color: %(DIM)s; }
  </style>
</helmet>

<div style="display: flex; flex-direction: column; background: %(PAPER)s;">

  <div style="background: %(INK)s; border-bottom: 1px solid #2C3A31;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; max-width: 1200px; margin: 0 auto; padding: 11px 60px;">
      <span class="key" style="color: #8E9686;">Taiwan Mountain Self-Guide Association</span>
      <span class="key" style="color: #8E9686;">services@mtselfguide.com</span>
    </div>
  </div>

  <nav aria-label="課程系列導覽" style="background: %(INK)s;">
    <div style="display: flex; align-items: center; gap: 34px; max-width: 1200px; margin: 0 auto; padding: 16px 60px 14px;">
      <a href="#top" style="display: flex; align-items: baseline; gap: 10px; margin-right: auto; color: #F3EFE5;">
        <span style="font-size: 17px; font-weight: 900; letter-spacing: .02em;">台灣自主登山能力推廣協會</span>
      </a>
%(nav)s      <span class="mono" style="padding: 6px 12px; background: %(SIG)s; color: #F6F2E8; font-size: 12px; font-weight: 600; letter-spacing: .1em;">2 門開放報名</span>
    </div>
  </nav>

  <header id="top" style="position: relative; height: 588px; background: %(INK)s; overflow: hidden;">
    <img src="og-cover.jpg" alt="登山者背著背包在高山池畔休息，遠方是雲霧繚繞的山巒" style="position: absolute; inset: 0; width: 100%%; height: 100%%; object-fit: cover; opacity: .5;" />
    <div style="position: absolute; inset: 0; background: linear-gradient(94deg, rgba(21,32,26,.94) 0%%, rgba(21,32,26,.76) 46%%, rgba(21,32,26,.34) 100%%);"></div>
    <svg viewBox="0 0 1460 660" preserveAspectRatio="none" aria-hidden="true" style="position: absolute; inset: 0; width: 100%%; height: 100%%; fill: none; stroke: #E8E2D4; stroke-width: 1.1; opacity: .17;">
%(contours)s
    </svg>
    <div style="position: relative; display: flex; flex-direction: column; justify-content: center; height: 100%%; max-width: 1200px; margin: 0 auto; padding: 0 60px;">
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 26px;">
        <span style="width: 46px; height: 2px; background: %(SIG)s;"></span>
        <span class="key" style="color: #D9D3C4;">2026 課程總覽 ／ Course Catalogue</span>
      </div>
      <h1 style="max-width: 720px; font-size: 62px; font-weight: 900; line-height: 1.24; letter-spacing: -.03em; color: #F6F2E8;">安全走入山林，<br />從自主能力開始</h1>
      <p style="max-width: 560px; margin-top: 24px; font-size: 17px; line-height: 2; color: #C6C6B8;">四個課程系列，從離線地圖、野營實戰、困難地形技術到體能訓練與山區通訊——把「依賴領隊」換成「自己判斷」。</p>
      <div style="display: flex; gap: 40px; margin-top: 46px; padding-top: 26px; border-top: 1px solid rgba(232,226,212,.22); max-width: 640px;">
        <div>
          <div class="mono" style="font-size: 32px; font-weight: 600; line-height: 1; color: %(SIG)s;">04</div>
          <div class="key" style="margin-top: 6px; color: #9DA595;">課程系列</div>
        </div>
        <div>
          <div class="mono" style="font-size: 32px; font-weight: 600; line-height: 1; color: #F6F2E8;">05</div>
          <div class="key" style="margin-top: 6px; color: #9DA595;">課程與講座</div>
        </div>
        <div>
          <div class="mono" style="font-size: 32px; font-weight: 600; line-height: 1; color: #F6F2E8;">02</div>
          <div class="key" style="margin-top: 6px; color: #9DA595;">現正開放報名</div>
        </div>
      </div>
    </div>
  </header>

  <section aria-label="現正開放報名" style="max-width: 1200px; margin: 0 auto; padding: 46px 60px 0; width: 100%%;">
    <div style="display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px;">
      <h2 class="key" style="font-size: 12px; color: %(INK)s;">Open for Registration ／ 現正開放報名</h2>
      <span style="flex-grow: 1; height: 1px; background: %(RULE2)s;"></span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px;">
%(board)s    </div>
  </section>

%(sec1)s%(quote)s%(sec2)s%(sec3)s%(sec4)s
  <footer style="margin-top: 96px; background: %(INK)s; color: #C6C6B8;">
    <div style="display: flex; gap: 60px; max-width: 1200px; margin: 0 auto; padding: 56px 60px 44px;">
      <div style="flex-grow: 1;">
        <div style="font-size: 19px; font-weight: 900; color: #F6F2E8;">台灣自主登山能力推廣協會</div>
        <div class="key" style="margin-top: 8px; color: #8E9686;">Taiwan Mountain Self-Guide Association</div>
        <p style="max-width: 420px; margin-top: 18px; font-size: 14px; line-height: 1.95;">探索戶外、走入山林，每一步都是收穫。</p>
      </div>
      <div style="flex-shrink: 0;">
        <div class="key" style="color: #8E9686;">聯絡 Contact</div>
        <p style="margin-top: 12px; font-size: 15px; line-height: 2;">
          services@mtselfguide.com<br />
          <a href="https://www.facebook.com/profile.php?id=61577607467247" target="_blank" rel="noopener" style="color: #F6F2E8;">Facebook 粉絲專頁 →</a>
        </p>
      </div>
    </div>
    <div style="border-top: 1px solid #2C3A31;">
      <div style="max-width: 1200px; margin: 0 auto; padding: 16px 60px;">
        <span class="key" style="color: #6F786A;">© 2026 台灣自主登山能力推廣協會</span>
      </div>
    </div>
  </footer>

</div>
</x-dc>
</body>
</html>
'''

QUOTE = '''  <section style="margin-top: 78px; background: %(INK)s;">
    <div style="max-width: 1200px; margin: 0 auto; padding: 62px 60px;">
      <div class="key" style="margin-bottom: 20px; color: #8E9686;">課程理念 ／ Principle</div>
      <p style="max-width: 900px; font-size: 30px; font-weight: 700; line-height: 1.65; letter-spacing: -.01em; color: #F6F2E8;">「自主登山」不是什麼都帶，也不是什麼都不帶，<br />而是理解「需求 vs. 恐懼」的界線。</p>
    </div>
  </section>
''' % dict(INK=INK)

out = HTML % dict(
    PAPER=PAPER, INK=INK, SIG=SIG, DIM=DIM, RULE=RULE, RULE2=RULE2,
    contours=contours, nav=nav, board=board, quote=QUOTE,
    sec1=section("hiking", "01", "Fundamentals", "給登山新手入門課",
                 "從基礎技能到野外過夜，循序漸進走向山林",
                 '    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px;">\n%s%s    </div>\n' % (C_MAP, C_CAMP)),
    sec2=section("terrain", "02", "Technical Terrain", "困難地形通過技術",
                 "繩索、渡溪與團隊協作，學會判斷該通過還是該撤退",
                 '    <div style="display: flex; flex-direction: column; gap: 24px;">\n%s    </div>\n' % C_TERRAIN),
    sec3=section("comm-safety", "03", "Comms &amp; Safety", "登山通訊安全講座",
                 "山區通訊不斷線，讓每一次出發都多一層保障",
                 '    <div style="display: flex; flex-direction: column; gap: 24px;">\n%s    </div>\n' % C_INREACH),
    sec4=section("fitness", "04", "Strength &amp; Conditioning", "登山體能訓練",
                 "用科學方法，鍛鍊帶你上山的身體",
                 '    <div style="display: flex; flex-direction: column; gap: 24px;">\n%s    </div>\n' % C_FIT),
)
open("Main.dc.html", "w").write(out)
print("Main.dc.html", len(out), "bytes")
