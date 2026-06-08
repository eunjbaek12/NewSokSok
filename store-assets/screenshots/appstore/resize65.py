"""6.9inch(1290x2796) 합성본 → 6.5inch(1284x2778) 다운스케일.
compose.mjs 실행 후 돌리면 final/6.5inch/{ko,en}/ 에 생성된다.
"""
import os, glob
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
TARGET = (1284, 2778)

made = 0
for lang in ("ko", "en"):
    src_dir = os.path.join(BASE, "final", "6.9inch", lang)
    dst_dir = os.path.join(BASE, "final", "6.5inch", lang)
    if not os.path.isdir(src_dir):
        continue
    os.makedirs(dst_dir, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src_dir, "*.png"))):
        im = Image.open(f).convert("RGB")
        im = im.resize(TARGET, Image.LANCZOS)
        out = os.path.join(dst_dir, os.path.basename(f))
        im.save(out)
        print("OK", os.path.relpath(out, BASE))
        made += 1

print(f"\n{made}장 6.5inch 생성 완료.")
