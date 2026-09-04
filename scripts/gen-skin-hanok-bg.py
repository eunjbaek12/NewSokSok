"""한글 스킨 배경 그림을 만든다 — 훈민정음 판식(사주쌍변 + 계선). 글자는 넣지 않는다.

    python scripts/gen-skin-hanok-bg.py

내보내는 곳: assets/images/skin-hanok-bg.webp

왜 AI 그림이 아니라 코드인가
---------------------------
자를 대고 그은 선뿐이라 생성 모델보다 코드가 정확하고, 좌표를 `docs/skin-art-brief.md`
§1 의 실측 구역에 그대로 맞출 수 있다. 다시 뽑을 때 결과가 변하지 않는 것도 이점이다.

왜 건물이 아닌가 (2026-09-04)
----------------------------
원래는 경복궁 수정전 그림이었다. 실기에서 **좌우 여백이 균일하게 어두워져**(중앙값
54/255) 화면을 액자처럼 가뒀다 — 기둥이 위아래로 이어진 «덩어리»였기 때문이다.
잘 되는 가을 스킨은 같은 자리가 0.8 이다(잎이 흩어져 있어 대부분은 원래 바탕).

판식으로 바꾸니 **중앙값 0.0 · 상위10% 35.9** 로 가을과 같은 성질이 됐고, 헤더 부제의
대비도 6.20 → 8.46 으로 올랐다.

그리고 «한글» 스킨의 근거가 분명해진다. 수정전은 집현전 자리라는 연결이 있었지만
**그 사실을 아는 사용자가 없다.** 훈민정음 판식은 설명이 필요 없다.

옛한글은 넣지 않는다
------------------
글자를 넣으려면 원문이 「나랏말ᄊᆞ미 듕귁에 달아…」처럼 아래아·ᄊᆞ 같은 옛 자모라
전용 폰트가 필요하다. 한글 스킨에서 한글을 틀리면 곤란하므로 **판식만** 쓴다.
"""

import math
import os
import random

from PIL import Image, ImageDraw

W, H = 1080, 2340
BG = (0xF4, 0xEF, 0xE3)   # 한지 — constants/colors.ts 의 hangul.background
INK = (0x33, 0x3A, 0x3F)  # 먹 — hangul.primary

# 🔑 alpha 는 `SkinBackdrop` 의 opacity 0.35 를 통과한다. 첫 시안은 34 로 그렸다가
#    화면에서 12 로 줄어 아무것도 안 보였다. 눈으로 확인하고 3배 가까이 올린 값이다.
A_OUT, A_IN, A_RULE = 165, 100, 82

# 변란 자리 — 좌우는 브리프 §1 의 «카드가 안 덮는 60px 띠» 안에 들어와야 보인다.
# 위는 인사말 아래, 아래는 탭바(y 2006)보다 위.
FL, FR = 34, W - 34
FT, FB = 300, 1946
GAP = 15                  # 쌍변 두 줄 사이
COLS = 7                  # 해례본 반엽 7행


def _hanji(im, n=2000, seed=5):
    """한지 결 — 빛에 비친 섬유. 아주 옅게."""
    rnd = random.Random(seed)
    d = ImageDraw.Draw(im, 'RGBA')
    for _ in range(n):
        x, y = rnd.randrange(W), rnd.randrange(H)
        length, alpha = rnd.randint(24, 150), rnd.randint(6, 14)
        ang = rnd.choice([-0.32, 0.32])
        d.line([(x, y), (x + length * math.cos(ang), y + length * math.sin(ang))],
               fill=INK + (alpha,), width=1)
    return im


def build():
    im = _hanji(Image.new('RGB', (W, H), BG))
    d = ImageDraw.Draw(im, 'RGBA')

    # 사주쌍변 — 바깥 굵은 줄, 안쪽 가는 줄
    d.rectangle([FL, FT, FR, FB], outline=INK + (A_OUT,), width=7)
    d.rectangle([FL + GAP, FT + GAP, FR - GAP, FB - GAP],
                outline=INK + (A_IN,), width=3)

    # 계선 — 세로 칸선
    left, right = FL + GAP, FR - GAP
    step = (right - left) / float(COLS)
    for i in range(1, COLS):
        x = left + step * i
        d.line([(x, FT + GAP + 12), (x, FB - GAP - 12)],
               fill=INK + (A_RULE,), width=3)

    return im


def selfcheck(im):
    """brief §7 의 잣대. 값이 이 범위를 벗어나면 화면에서 티가 난다."""
    def peak(y0, y1, xs):
        return max(max(abs(im.getpixel((x, y))[i] - BG[i]) for i in range(3))
                   for y in range(y0, y1, 4) for x in xs)

    edge = list(range(0, 110, 4)) + list(range(970, 1080, 4))
    mid = list(range(110, 970, 6))
    every = list(range(0, 1080, 6))
    return {
        '위': peak(0, 592, every),
        '가운데 한복판': peak(700, 1800, mid),
        '가운데 좌우끝': peak(700, 1800, edge),
        '아래 보임': peak(1800, 2006, every),
        '아래 가려짐': peak(2006, 2340, every),
    }


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'assets', 'images', 'skin-hanok-bg.webp')

    image = build()
    image.save(out, 'WEBP', quality=84, method=6)
    print('%s  %.0f KB' % (os.path.relpath(out, root), os.path.getsize(out) / 1024))
    for name, value in selfcheck(image).items():
        print('  %-14s %3d' % (name, value))
