# -*- coding: utf-8 -*-
"""把 assets/ 的照片壓到 64 KB 以下供設計畫布使用。

重點：先 exif_transpose() 套用 EXIF 轉向再重存，否則像素會照抄、
轉向標記卻被丟掉（og-cover.jpg orientation=3 就是這樣變成上下顛倒的）。
"""
import io, os
from PIL import Image, ImageOps

SRC, OUT, LIMIT = "assets", "design/assets-min", 64000
# 直式原圖先裁成 3:2 橫幅，卡片上本來就會裁掉上下
CROP_32 = {"card-offline-map.jpg", "card-terrain.jpg"}
WIDTHS = {"card-offline-map.jpg": 660, "card-camping.jpg": 620, "card-terrain.jpg": 660,
          "card-inreach.jpg": 700, "card-fitness.jpg": 700, "og-cover.jpg": 900}

def crop32(im):
    th = round(im.width * 2 / 3)
    if th <= im.height:
        top = round((im.height - th) * 0.42)
        return im.crop((0, top, im.width, top + th))
    tw = round(im.height * 3 / 2)
    left = (im.width - tw) // 2
    return im.crop((left, 0, left + tw, im.height))

os.makedirs(OUT, exist_ok=True)
for name, w in WIDTHS.items():
    im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, name))).convert("RGB")
    if name in CROP_32:
        im = crop32(im)
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    for q in range(90, 28, -2):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= LIMIT:
            break
    open(os.path.join(OUT, name), "wb").write(buf.getvalue())
    print("%-22s %sx%s  q%s  %s KB" % (name, im.width, im.height, q, buf.tell() // 1024))
