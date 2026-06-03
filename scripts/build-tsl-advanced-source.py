#!/usr/bin/env python3
"""
TSL(TOEIC Service List) 1.2 심화 구간(rank 601~1200) 소스 빌더.

입력 (newgeneralservicelist.com, CC BY-SA 4.0):
  - scripts/data/tsl12-stats.csv     : Word, TSL Rank, SFI, U  (1~1200 전체 빈도 순위)
  - scripts/data/tsl12-defs.xlsx     : TSL Word, TSL Definition (쉬운 영영정의, 알파벳순)
출력:
  - scripts/tsl-advanced-source.json : [{rank, sfi, term, definition}]  (rank 601~1200)

실행: python scripts/build-tsl-advanced-source.py
"""
import csv, json, zipfile, re, sys, xml.etree.ElementTree as ET, os

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATS = os.path.join(ROOT, 'scripts/data/tsl12-stats.csv')
XLSX = os.path.join(ROOT, 'scripts/data/tsl12-defs.xlsx')
OUT = os.path.join(ROOT, 'scripts/tsl-advanced-source.json')

RANK_LO, RANK_HI = 601, 1200


def load_definitions(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    ss = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in root]
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    defs = {}
    for row in sheet.iter(NS + 'row'):
        cells = {}
        for c in row.findall(NS + 'c'):
            col = re.match(r'[A-Z]+', c.get('r')).group()
            t = c.get('t')
            v = c.find(NS + 'v')
            val = ''
            if v is not None:
                val = ss[int(v.text)] if t == 's' else (v.text or '')
            cells[col] = val
        word = (cells.get('A') or '').strip()
        definition = (cells.get('B') or '').strip()
        if word and word.lower() != 'tsl word':
            defs[word.lower()] = definition
    return defs


def main():
    defs = load_definitions(XLSX)
    print(f'영영정의 {len(defs)}개 로드')

    rows = []
    with open(STATS, encoding='cp1252') as f:
        for r in csv.DictReader(f):
            term = (r.get('Word') or '').strip()
            try:
                rank = int(r['TSL Rank'])
            except (KeyError, ValueError):
                continue
            try:
                sfi = float(r['SFI'])
            except (KeyError, ValueError, TypeError):
                sfi = None
            if RANK_LO <= rank <= RANK_HI and term:
                rows.append({
                    'rank': rank,
                    'sfi': sfi,
                    'term': term,
                    'definition': defs.get(term.lower(), ''),
                })

    rows.sort(key=lambda x: x['rank'])
    missing = [r['term'] for r in rows if not r['definition']]
    print(f'rank {RANK_LO}~{RANK_HI}: {len(rows)}개, 정의 누락 {len(missing)}개')
    if missing:
        print('  누락 샘플:', missing[:15])

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f'✅ {OUT} 작성 ({len(rows)}개)')


if __name__ == '__main__':
    main()
