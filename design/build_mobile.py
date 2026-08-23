# -*- coding: utf-8 -*-
contours = open("contours.txt").read()
INK="#15201A"; PAPER="#E8E2D4"; CARD="#F3EFE5"
BAND="#3B4E40"; BAND_LINE="#55684F"
RULE="#D6CDB8"; RULE2="#CDC4AE"; MUTED="#5A6353"; DIM="#7A8172"; SIG="#C2521C"
ARROW = '<svg width="18" height="11" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M0 6h18M13 1l5 5-5 5" /></svg>'

def specs(items):
    out = ""
    for k, v in items:
        out += ('          <div class="spec-row">\n            <span class="spec-key">%s</span>\n'
                '            <span class="spec-val">%s</span>\n          </div>\n' % (k, v))
    return out

def cta(url=None):
    if url:
        return ('          <a href="%s" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 20px; padding: 15px 18px; background: %s; color: #F6F2E8; font-size: 16px; font-weight: 700;">\n'
                '            <span>立即報名</span>\n            %s\n          </a>\n' % (url, SIG, ARROW))
    return ('          <div style="margin-top: 20px; padding: 15px 18px; border: 1px solid %s; color: %s; font-size: 14px; font-weight: 500; text-align: center;">\n'
            '            目前無場次，開課時間規劃中\n          </div>\n' % (RULE2, DIM))

def card(img, alt, open_, title, en, desc, items, url=None):
    chip = ('<span class="chip chip-open">報名中 OPEN</span>' if open_
            else '<span class="chip chip-closed">暫無場次 CLOSED</span>')
    filt = "" if open_ else " filter: grayscale(.6) contrast(1.02);"
    return '''      <article style="display: flex; flex-direction: column; background: %(CARD)s; border: 1px solid %(RULE)s;">
        <figure style="position: relative; height: 186px; overflow: hidden; margin: 0;">
          <img src="%(img)s" alt="%(alt)s" style="width: 100%%; height: 100%%; object-fit: cover; display: block;%(filt)s" />
          <div style="position: absolute; left: 0; bottom: 0;">%(chip)s</div>
        </figure>
        <div style="display: flex; flex-direction: column; padding: 22px 20px 20px;">
          <div class="key" style="margin-bottom: 6px;">%(en)s</div>
          <h3 style="margin-bottom: 12px; font-size: 20px; font-weight: 700; line-height: 1.45; letter-spacing: -.01em;">%(title)s</h3>
          <p style="margin-bottom: 16px; font-size: 14.5px; line-height: 1.95; color: %(MUTED)s;">%(desc)s</p>
%(specs)s%(cta)s        </div>
      </article>
''' % dict(CARD=CARD, RULE=RULE, MUTED=MUTED, img=img, alt=alt, filt=filt,
           chip=chip, en=en, title=title, desc=desc, specs=specs(items), cta=cta(url))

def section(anchor, num, en, title, sub, cards):
    return '''  <section id="%(anchor)s" style="padding: 52px 20px 0;">
    <div style="padding-bottom: 14px; margin-bottom: 22px; border-bottom: 2px solid %(INK)s;">
      <div style="display: flex; align-items: baseline; gap: 14px;">
        <span class="mono" style="font-size: 34px; font-weight: 600; line-height: 1; color: %(SIG)s;">%(num)s</span>
        <div>
          <div class="key" style="margin-bottom: 1px;">%(en)s</div>
          <h2 style="font-size: 25px; font-weight: 900; line-height: 1.3; letter-spacing: -.02em;">%(title)s</h2>
        </div>
      </div>
      <p style="margin-top: 10px; font-size: 13.5px; line-height: 1.8; color: %(MUTED)s;">%(sub)s</p>
    </div>
    <div style="display: flex; flex-direction: column; gap: 20px;">
%(cards)s    </div>
  </section>
''' % dict(anchor=anchor, INK=INK, SIG=SIG, MUTED=MUTED, num=num, en=en, title=title, sub=sub, cards=cards)

C_MAP = card("card-offline-map.jpg", "學員們在步道涼亭下練習操作手機離線地圖", False,
  "手機離線地圖【山林日誌】實用教學", "Offline Navigation",
  "為「完全不會用手機 GPS 離線地圖」的山友所設計，同時也是熟悉登山者的檢視課。學會掌握自己的指北針方向感，走一趟安全、安心的郊山路。",
  [("日期", "下一場規劃中，敬請關注粉絲專頁"), ("準備", "出發前安裝「山林日誌」App，即可參加")])
C_CAMP = card("card-camping.jpg", "森林營地中架設的多頂帳篷，學員在天幕下整理裝備", False,
  "兩天一夜野營實戰系列", "Overnight Field Practice",
  "打包時，你是否因為擔心「萬一」而塞進過多裝備？行進間，是否總是依賴領隊的背影？在兩天一夜的實戰中，把地圖知識轉化為行進直覺，並在真實環境中演練裝備管理與風險應變。",
  [("日期", "下一梯次規劃中，敬請關注粉絲專頁"), ("人數", "每梯限額 6 人，費用含接駁"),
   ("準備", "需自備帳篷、睡袋等裝備，行前安排說明會")])
C_TERRAIN = card("card-terrain.jpg", "學員在陡峭巨石地形上以繩索確保，逐一通過", True,
  "困難地形通過課程", "Technical Terrain",
  "這不是單純的垂降體驗，也不是激流救生課程。我們從登山途中可能遇到的困難地形出發，學習觀察環境、判斷風險、選擇通過方式，並運用基礎繩索、團隊協作與渡溪技巧完成任務。更重要的是學會判斷：什麼時候可以通過，什麼時候應該撤退。",
  [("日期", '<time datetime="2026-10-03">10 月 3–4 日（六・日）</time>'),
   ("地點", "高雄茂林（集合：7-ELEVEN 茂林門市）"),
   ("人數", "6 人成團，限額 12 人"), ("費用", "NT$5,000 ／人")],
  "https://forms.gle/ySAN9scVdrKiK14b9")
C_INREACH = card("card-inreach.jpg", "講師在教室向學員講解台灣山區通訊涵蓋範圍", False,
  "Garmin inReach 教學", "Satellite Communication",
  "當手機收不到訊號，你還有辦法對外聯絡嗎？本講座帶你認識衛星通訊裝置 Garmin inReach 的功能與實際操作，建立山區通訊安全觀念，學會在關鍵時刻發出正確的求援訊息。",
  [("日期", "下一場規劃中，敬請關注粉絲專頁"), ("準備", "不需自備裝備，現場提供實機操作")])
C_FIT = card("card-fitness.jpg", "健身房內學員在教練指導下進行硬舉訓練", True,
  "科學化肌力登山指南－交流體驗工作坊", "Strength &amp; Conditioning",
  "與璞實生活合辦，圍繞「能量系統與呼吸」、「核心肌力漸進負荷訓練」、「傷後恢復與強化」三大主軸。講師耀禾與肌力教練軒韋深度對談，並透過器材檢測關節活動度、模擬登山動作，協助你調整發力習慣。",
  [("日期", '<time datetime="2026-09-12T16:00">9 月 12 日（六）16:00–17:30</time>'),
   ("地點", "璞實生活（高雄市三民區九如一路 26 號）"),
   ("人數", "極限量小班制，限額 8 人"), ("費用", "NT$1,000")],
  "https://forms.gle/T7KzQtEXwVeevw259")

def board_row(date_big, date_small, title, meta, url):
    return '''      <a href="%(url)s" target="_blank" rel="noopener" style="display: flex; align-items: center; gap: 16px; padding: 18px; background: %(CARD)s; border: 1px solid %(RULE)s; border-top: 3px solid %(SIG)s; color: %(INK)s;">
        <div style="flex-shrink: 0; width: 76px;">
          <div class="mono" style="font-size: 25px; font-weight: 600; line-height: 1; letter-spacing: -.02em;">%(date_big)s</div>
          <div class="key" style="margin-top: 4px; font-size: 10px;">%(date_small)s</div>
        </div>
        <div style="flex-grow: 1;">
          <div style="font-size: 16px; font-weight: 700; line-height: 1.45;">%(title)s</div>
          <div style="margin-top: 2px; font-size: 12.5px; line-height: 1.7; color: %(MUTED)s;">%(meta)s</div>
        </div>
        <span style="flex-shrink: 0; color: %(SIG)s;">%(ARROW)s</span>
      </a>
''' % dict(url=url, CARD=CARD, RULE=RULE, SIG=SIG, INK=INK, MUTED=MUTED,
           date_big=date_big, date_small=date_small, title=title, meta=meta, ARROW=ARROW)

board = (board_row("09.12", "SAT 16:00", "科學化肌力登山指南工作坊",
                   "高雄・璞實生活 ｜ 限額 8 人 ｜ NT$1,000", "https://forms.gle/T7KzQtEXwVeevw259")
       + board_row("10.03", "SAT–SUN", "困難地形通過課程",
                   "高雄茂林 ｜ 限額 12 人 ｜ NT$5,000", "https://forms.gle/ySAN9scVdrKiK14b9"))

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
      margin: 0; background: %(PAPER)s; color: %(INK)s;
      font-family: "Noto Sans TC", system-ui, "Helvetica Neue", sans-serif;
      line-height: 1.8; -webkit-font-smoothing: antialiased; text-wrap: pretty;
    }
    a { color: %(SIG)s; text-decoration: none; }
    a:hover { color: #94400F; }
    h1, h2, h3, p, figure { margin: 0; padding: 0; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; }
    .key {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 10.5px; font-weight: 500; letter-spacing: .16em;
      text-transform: uppercase; color: %(DIM)s;
    }
    .spec-row { display: flex; align-items: baseline; gap: 12px; padding: 10px 0; border-top: 1px solid %(RULE)s; }
    .spec-key { width: 40px; flex-shrink: 0; font-size: 12px; font-weight: 500; letter-spacing: .08em; color: %(DIM)s; }
    .spec-val { font-size: 14.5px; font-weight: 500; line-height: 1.6; }
    .chip { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 10.5px; font-weight: 600; letter-spacing: .12em; padding: 5px 10px; white-space: nowrap; }
    .chip-open { background: %(SIG)s; color: #F6F2E8; }
    .chip-closed { background: rgba(21,32,26,.82); color: #D9D3C4; }
  </style>
</helmet>

<div style="display: flex; flex-direction: column; width: 390px; background: %(PAPER)s;">

  <nav style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; background: %(BAND)s;">
    <span style="font-size: 14.5px; font-weight: 900; color: #F3EFE5;">台灣自主登山能力推廣協會</span>
    <span class="mono" style="flex-shrink: 0; padding: 4px 8px; background: %(SIG)s; color: #F6F2E8; font-size: 11px; font-weight: 600;">2 門</span>
  </nav>

  <header style="position: relative; height: 418px; background: %(BAND)s; overflow: hidden;">
    <img src="og-cover.jpg" alt="登山者背著背包在高山池畔休息，遠方是雲霧繚繞的山巒" style="position: absolute; inset: 0; width: 100%%; height: 100%%; object-fit: cover; opacity: .5;" />
    <div style="position: absolute; inset: 0; background: linear-gradient(6deg, rgba(59,78,64,.93) 12%%, rgba(59,78,64,.55) 100%%);"></div>
    <svg viewBox="360 0 740 660" preserveAspectRatio="none" aria-hidden="true" style="position: absolute; inset: 0; width: 100%%; height: 100%%; fill: none; stroke: #E8E2D4; stroke-width: 1.6; opacity: .15;">
%(contours)s
    </svg>
    <div style="position: relative; display: flex; flex-direction: column; justify-content: flex-end; height: 100%%; padding: 0 20px 26px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 18px;">
        <span style="width: 30px; height: 2px; background: %(SIG)s;"></span>
        <span class="key" style="color: #E4DFD1;">2026 課程總覽</span>
      </div>
      <h1 style="font-size: 36px; font-weight: 900; line-height: 1.32; letter-spacing: -.03em; color: #F6F2E8;">安全走入山林，<br />從自主能力開始</h1>
      <p style="margin-top: 16px; font-size: 14.5px; line-height: 1.95; color: #D8D8CB;">四個課程系列，從離線地圖、野營實戰、困難地形技術到體能訓練與山區通訊——把「依賴領隊」換成「自己判斷」。</p>
    </div>
  </header>

  <section style="padding: 32px 20px 0;">
    <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px;">
      <h2 class="key" style="font-size: 11px; color: %(INK)s;">現正開放報名</h2>
      <span style="flex-grow: 1; height: 1px; background: %(RULE2)s;"></span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
%(board)s    </div>
  </section>

%(sec1)s%(quote)s%(sec2)s%(sec3)s%(sec4)s
  <footer style="margin-top: 60px; padding: 40px 20px 28px; background: %(BAND)s; color: #D5D5C8;">
    <div style="font-size: 16px; font-weight: 900; color: #F6F2E8;">台灣自主登山能力推廣協會</div>
    <div class="key" style="margin-top: 6px; color: #AAB29E;">Taiwan Mountain Self-Guide Association</div>
    <p style="margin-top: 16px; font-size: 14px; line-height: 2;">
      services@mtselfguide.com<br />
      <a href="https://www.facebook.com/profile.php?id=61577607467247" target="_blank" rel="noopener" style="color: #F6F2E8;">Facebook 粉絲專頁 →</a>
    </p>
    <div class="key" style="margin-top: 26px; padding-top: 16px; border-top: 1px solid %(BAND_LINE)s; color: #93997F;">© 2026 台灣自主登山能力推廣協會</div>
  </footer>

</div>
</x-dc>
</body>
</html>
'''

QUOTE = '''  <section style="margin-top: 52px; padding: 40px 20px; background: %(BAND)s;">
    <div class="key" style="margin-bottom: 14px; color: #AAB29E;">課程理念</div>
    <p style="font-size: 21px; font-weight: 700; line-height: 1.75; letter-spacing: -.01em; color: #F6F2E8;">「自主登山」不是什麼都帶，也不是什麼都不帶，而是理解「需求 vs. 恐懼」的界線。</p>
  </section>
''' % dict(BAND=BAND, BAND_LINE=BAND_LINE)

out = HTML % dict(
    PAPER=PAPER, INK=INK, BAND=BAND, BAND_LINE=BAND_LINE, SIG=SIG, DIM=DIM, RULE=RULE, RULE2=RULE2,
    contours=contours, board=board, quote=QUOTE,
    sec1=section("hiking", "01", "Fundamentals", "給登山新手入門課", "從基礎技能到野外過夜，循序漸進走向山林", C_MAP + C_CAMP),
    sec2=section("terrain", "02", "Technical Terrain", "困難地形通過技術", "繩索、渡溪與團隊協作，學會判斷該通過還是該撤退", C_TERRAIN),
    sec3=section("comm-safety", "03", "Comms &amp; Safety", "登山通訊安全講座", "山區通訊不斷線，讓每一次出發都多一層保障", C_INREACH),
    sec4=section("fitness", "04", "Strength &amp; Conditioning", "登山體能訓練", "用科學方法，鍛鍊帶你上山的身體", C_FIT),
)
open("Mobile.dc.html", "w").write(out)
print("Mobile.dc.html", len(out), "bytes")
