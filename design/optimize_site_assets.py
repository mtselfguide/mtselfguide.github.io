# -*- coding: utf-8 -*-
"""就地重新編碼 assets/ 的五張課程卡照片，降低檔案大小。

・不縮小尺寸：原檔長邊 750–1000px，對照卡片在高解析螢幕上的顯示尺寸
  （2 倍圖約需 700–1050px）已無多餘餘裕，縮了會糊。省下的空間全部
  來自重新編碼。這幾張是森林與岩壁等高頻細節照片，JPEG 本來就壓不動，
  能省的有限。
・先套用 EXIF 轉向再存，避免重存時丟掉轉向標記（og-cover 曾因此上下顛倒；
  這五張的 orientation 都是 1 或無，屬防呆）。
・只有在新檔確實較小時才覆蓋。
・首圖 og-cover.jpg 不在此列：它同時是 Facebook 分享預覽圖，
  尺寸與 og:image:width/height 綁定，維持原檔。
"""
import io, os
from PIL import Image, ImageOps

QUALITY = 78
MIN_SAVING = 0.10   # 少於一成的差距不值得動二進位檔
FILES = ["card-offline-map.jpg", "card-camping.jpg", "card-terrain.jpg",
         "card-inreach.jpg", "card-fitness.jpg"]

total_before = total_after = 0
for name in FILES:
    path = os.path.join("assets", name)
    before = os.path.getsize(path)
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    after = buf.tell()
    if after < before * (1 - MIN_SAVING):
        open(path, "wb").write(buf.getvalue())
        note = "已替換，省 %.0f%%" % (100 * (before - after) / before)
    else:
        after = before
        note = "原檔已接近最佳，略過"
    total_before += before
    total_after += after
    print("%-22s %sx%s  %4d KB → %4d KB  (%s)" % (name, im.width, im.height,
                                                  before // 1024, after // 1024, note))
print("\n合計 %d KB → %d KB，省下 %d KB（%.0f%%）" % (
    total_before // 1024, total_after // 1024,
    (total_before - total_after) // 1024,
    100 * (total_before - total_after) / total_before))
