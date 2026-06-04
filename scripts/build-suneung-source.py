#!/usr/bin/env python3
"""
수능 필수 어휘 500 소스 빌더.

선정 기준:
  - 교육부 2015 개정 영어과 교육과정(교육부 고시 제2015-74호 [별책 14], 공공누리 제1유형)
    기본 어휘 목록(3,000개)에서 추출.
  - 초등 권장(* 표시) 어휘는 제외(너무 기초). 무표시(중·고 공통) + ** (고교 권장 심화)만 후보.
  - 후보를 NGSL 1.2 빈도(SFI Rank)순으로 정렬해 상위 500개 선정 = "수능 필수 어휘".

입력 (모두 scripts/data/, gitignore):
  - eng-curr-layout.txt   : pdftotext -layout 산출 (영어과 교육과정 어휘표, 3단 컬럼)
  - ngsl12-stats.csv      : newgeneralservicelist.com NGSL 1.2 (Lemma, SFI Rank, SFI, U), CC BY-SA 4.0
출력:
  - scripts/suneung-source.json : [{rank, term, sfi, ngslRank, marker, definition}]

실행: python scripts/build-suneung-source.py
"""
import re, csv, json, os, sys
from collections import Counter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURR = os.path.join(ROOT, 'scripts/data/eng-curr-layout.txt')
NGSL = os.path.join(ROOT, 'scripts/data/ngsl12-stats.csv')
OUT = os.path.join(ROOT, 'scripts/suneung-source.json')

# 어휘표 영역: "A" 헤더(~5907)부터 "zoo"(~7063)까지 (1-based)
REGION_LO, REGION_HI = 5907, 7063
TARGET = 500


def parse_curriculum():
    lines = open(CURR, encoding='latin-1').read().splitlines()
    region = lines[REGION_LO - 1:REGION_HI]
    seen = {}
    for ln in region:
        ln = ln.replace('\x0c', ' ')
        if not ln.strip():
            continue
        for cell in re.split(r'\s{2,}', ln.strip()):
            cell = cell.strip()
            if not cell:
                continue
            if '/' in cell:                       # 'advertize / advertise' → 첫 철자
                cell = cell.split('/')[0].strip()
            m = re.match(r"^([a-z][a-z'.-]*)\s*(\*{1,2})?$", cell)
            if not m:
                continue
            term, mark = m.group(1), m.group(2) or ''
            if term not in seen:
                seen[term] = mark
            elif mark and not seen[term]:
                seen[term] = mark
    return seen


def load_ngsl():
    rank = {}
    with open(NGSL, encoding='cp1252') as f:
        for r in csv.DictReader(f):
            lemma = (r.get('Lemma') or '').strip().lower()
            try:
                rk = int(r['SFI Rank'])
                sfi = float(r['SFI'])
            except (KeyError, ValueError, TypeError):
                continue
            if lemma and lemma not in rank:
                rank[lemma] = (rk, sfi)
    return rank


def main():
    curr = parse_curriculum()
    c = Counter(curr.values())
    print(f'교육과정 어휘 파싱: {len(curr)}개 (마커별 {dict(c)})')

    ngsl = load_ngsl()
    print(f'NGSL 빈도 {len(ngsl)}개 로드')

    # 전략: 고교 심화(**) 우선 + 중급 빈출 무표시어로 보충
    # 1) 코어 = ** (고교 권장 심화) 전체. NGSL 수록어는 빈도순, 미수록 obscure어는 알파벳순 뒤로.
    bb = [t for t, mk in curr.items() if mk == '**']
    bb_in = sorted([t for t in bb if t.lower() in ngsl], key=lambda t: ngsl[t.lower()][0])
    bb_out = sorted([t for t in bb if t.lower() not in ngsl])
    core = [(t, '**') for t in bb_in + bb_out]

    # 2) 보충 = 무표시(중·고 공통) 중 NGSL rank>=600 (사소한 최빈어 제외) 빈도순
    FILL_MIN_RANK = 600
    fill_pool = sorted(
        [t for t, mk in curr.items() if mk == '' and t.lower() in ngsl and ngsl[t.lower()][0] >= FILL_MIN_RANK],
        key=lambda t: ngsl[t.lower()][0],
    )
    fill = [(t, 'common') for t in fill_pool[:max(0, TARGET - len(core))]]

    selected = (core + fill)[:TARGET]
    sel_marks = Counter(mk for _, mk in selected)
    print(f'** 코어 {len(core)}개 (NGSL수록 {len(bb_in)} + 미수록 {len(bb_out)}), 보충 {len(fill)}개 → 총 {len(selected)}개')
    print(f'마커 분포: 고교심화** {sel_marks.get("**", 0)}, 빈출보충 {sel_marks.get("common", 0)}')
    print('코어 상위 20:', [t for t, _ in core[:20]])
    print('코어 obscure(미수록) 샘플:', bb_out[:15])
    print('보충 상위 15:', [t for t, _ in fill[:15]])

    out = []
    for i, (term, mk) in enumerate(selected):
        info = ngsl.get(term.lower())
        out.append({
            'rank': i + 1,
            'term': term,
            'sfi': info[1] if info else None,
            'ngslRank': info[0] if info else None,
            'marker': mk,            # '**' (고교 심화) | 'common' (중·고 빈출)
            'definition': '',
        })

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'✅ {OUT} 작성 ({len(out)}개)')


if __name__ == '__main__':
    main()
