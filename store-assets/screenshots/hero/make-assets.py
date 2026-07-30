# -*- coding: utf-8 -*-
"""히어로 원본(hero.png)에서 합성용 부품을 뽑는다.

hero.png의 폰 화면 자리에는 실제 앱 캡처를 얹는데(가이드라인 2.3.10 — 그려낸 UI 금지),
캡처가 그림의 노치까지 덮어버린다. 그래서 노치를 원본에서 그대로 오려 두고
hero.html이 캡처 위에 다시 얹는다. 새로 그리면 그림과 미묘하게 어긋난다.

좌표는 눈이 아니라 픽셀 실측값이다(README.md의 "실측" 절 참고).
원본을 교체하면 이 스크립트를 다시 돌리고 README의 좌표를 갱신할 것.

    python store-assets/screenshots/hero/make-assets.py
"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "hero.png")

# --- 실측값 (hero.png 1984x2144 기준) ---
SCREEN = (1198, 669, 603, 1285)   # x, y, w, h — 화면 안쪽 사각형
NOTCH = (1334, 669, 330, 75)      # x, y, w, h — 화면 상단 중앙 노치

im = Image.open(SRC).convert("RGB")
assert im.size == (1984, 2144), f"원본 크기가 바뀌었다: {im.size} — 좌표 재실측 필요"

# 노치 주변 여유를 두고 오려낸다(좌우/아래 안티에일리어싱 포함).
pad = 8
nx, ny, nw, nh = NOTCH
box = (nx - pad, ny, nx + nw + pad, ny + nh + pad)
crop = im.crop(box).convert("RGBA")
px = crop.load()
w, h = crop.size

# 화면(밝은 무채색)은 투명으로, 노치(어두운 갈색)는 불투명으로.
# 경계는 밝기로 부분 알파를 줘 계단을 없앤다.
SCREEN_LUM = 201.0   # 화면 평균색 rgb(205,200,197)의 luma
NOTCH_LUM = 105.0    # 노치 본체 luma (아래에서 실측 출력)
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        lum = (r * 299 + g * 587 + b * 114) / 1000
        t = (SCREEN_LUM - lum) / (SCREEN_LUM - NOTCH_LUM)
        a = max(0.0, min(1.0, t))
        px[x, y] = (r, g, b, int(round(a * 255)))

out = os.path.join(BASE, "notch.png")
crop.save(out)
print(f"OK notch.png  {crop.size}  (원본 crop {box})")
print(f"   화면 기준 상대위치: left={nx - pad - SCREEN[0]}, top={ny - SCREEN[1]}")

# 참고용 실측 출력
full = im.load()
sx, sy, sw, sh = SCREEN
def avg(x0, y0, x1, y1, step=5):
    t = [0, 0, 0]; n = 0
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            p = full[x, y]
            t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; n += 1
    return tuple(v // n for v in t)
notch_rgb = avg(nx + 20, ny + 30, nx + 90, ny + 60, 3)
print(f"   노치 색 실측 = rgb{notch_rgb}  luma={(notch_rgb[0]*299+notch_rgb[1]*587+notch_rgb[2]*114)/1000:.0f}")
print(f"   화면 색 실측 = rgb{avg(sx + 60, sy + 400, sx + sw - 60, sy + 900)}")
print(f"   화면 비율 = {sw/sh:.4f}  (캡처 1125x2436 = {1125/2436:.4f})")
