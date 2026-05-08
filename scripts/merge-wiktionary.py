"""
Wiktionary 데이터와 AI 번역 데이터를 병합합니다.

우선순위:
  meaningKr: Wiktionary > AI
  phonetic:  Wiktionary > AI
  pos:       Wiktionary > AI
  definition: AI (일관성)
  exampleEn:  AI (더 자연스러움)
  exampleKr:  AI (Wiktionary에 없음)

실행: python scripts/merge-wiktionary.py <list-name>
  예) python scripts/merge-wiktionary.py tsl
      python scripts/merge-wiktionary.py nawl

입력:
  scripts/<list-name>-wiktionary.json   (Wiktionary 데이터)
  scripts/<list-name>-translated.json   (AI 번역 데이터 — tsl은 tsl-top600-translated.json)
출력:
  scripts/<list-name>-merged.json
"""
import sys, json, os

LIST_NAME = sys.argv[1].lower() if len(sys.argv) > 1 else ''
if not LIST_NAME:
    print('사용법: python scripts/merge-wiktionary.py <list-name>')
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

WIKT_PATH = os.path.join(SCRIPT_DIR, f'{LIST_NAME}-wiktionary.json')

# tsl은 파일명이 tsl-top600-translated.json
AI_FILENAME = 'tsl-top600-translated.json' if LIST_NAME == 'tsl' else f'{LIST_NAME}-translated.json'
AI_PATH = os.path.join(SCRIPT_DIR, AI_FILENAME)
OUTPUT_PATH = os.path.join(SCRIPT_DIR, f'{LIST_NAME}-merged.json')

if not os.path.exists(WIKT_PATH):
    print(f'오류: {WIKT_PATH} 없음')
    sys.exit(1)
if not os.path.exists(AI_PATH):
    print(f'오류: {AI_PATH} 없음')
    sys.exit(1)

with open(WIKT_PATH, encoding='utf-8') as f:
    wikt_list = json.load(f)
with open(AI_PATH, encoding='utf-8') as f:
    ai_list = json.load(f)

# term → entry 맵
wikt_map = {e['term']: e for e in wikt_list}
ai_map = {e['term']: e for e in ai_list}

results = []
wikt_used = 0
ai_used = 0

for ai in ai_list:
    term = ai['term']
    w = wikt_map.get(term, {})

    meaning_kr = (w.get('meaningKr') or '').strip()
    if not meaning_kr:
        meaning_kr = ai.get('meaningKr', '')
        ai_used += 1
    else:
        wikt_used += 1

    phonetic = (w.get('phonetic') or '').strip() or ai.get('phonetic', '')
    pos = (w.get('pos') or '').strip() or ai.get('pos', '')

    results.append({
        'rank': ai['rank'],
        'term': term,
        'phonetic': phonetic,
        'pos': pos,
        'definition': ai.get('definition', ''),
        'meaningKr': meaning_kr,
        'exampleEn': ai.get('exampleEn', ''),
        'exampleKr': ai.get('exampleKr', ''),
        'meaningKrSource': 'wiktionary' if w.get('hasMeaningKr') else 'ai',
    })

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

total = len(results)
summary_path = os.path.join(SCRIPT_DIR, f'_merge_summary_{LIST_NAME}.txt')
lines = [
    f'[{LIST_NAME.upper()}] 병합 완료: {total}개',
    f'  Wiktionary 한국어: {wikt_used}개 ({round(wikt_used/total*100)}%)',
    f'  AI 대체:          {ai_used}개 ({round(ai_used/total*100)}%)',
    f'  출력: {OUTPUT_PATH}',
]
with open(summary_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
for l in lines:
    print(l)
