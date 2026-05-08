"""
curationData.ts 의 기존 TSL 항목을 tsl-merged.json 으로 교체합니다.

실행: python scripts/reintegrate-tsl.py
"""
import json, os, re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)

MERGED_PATH = os.path.join(SCRIPT_DIR, 'tsl-top600-translated.json')
CURATION_PATH = os.path.join(ROOT, 'constants', 'curationData.ts')

LIST_ID = 'curated-toeic-tsl-1'
NOW = 1777562146396  # 원래 createdAt 유지

with open(MERGED_PATH, encoding='utf-8') as f:
    items = json.load(f)

# word id도 원본 형식 유지
words = []
for idx, w in enumerate(items):
    words.append({
        'id': f'word-toeic-tsl-{idx}-{NOW}',
        'term': w['term'],
        'definition': w['definition'],
        'meaningKr': w['meaningKr'],
        'exampleEn': w['exampleEn'],
        'exampleKr': w['exampleKr'],
        'isMemorized': False,
        'isStarred': False,
        'tags': ['TOEIC', 'Business'],
        'phonetic': w.get('phonetic', ''),
        'pos': w.get('pos', ''),
    })

new_entry = {
    'id': LIST_ID,
    'title': '토익 핵심 600',
    'icon': '💼',
    'isCurated': True,
    'category': '시험',
    'level': 'intermediate',
    'description': '토익 핵심 어휘 600. TSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',
    'sourceLanguage': 'en',
    'targetLanguage': 'ko',
    'isVisible': True,
    'createdAt': NOW,
    'words': words,
}

new_block = json.dumps(new_entry, ensure_ascii=False, indent=2)
new_block_indented = '\n'.join('  ' + line for line in new_block.split('\n'))

with open(CURATION_PATH, encoding='utf-8') as f:
    original = f.read()

# TSL 항목의 시작 위치 찾기: '"id": "curated-toeic-tsl-1"' 를 포함하는 { 블록
id_pos = original.find(f'"id": "{LIST_ID}"')
if id_pos == -1:
    print(f'오류: {LIST_ID} 를 찾지 못함')
    exit(1)

# id_pos 에서 앞쪽으로 { 찾기
entry_start = original.rfind('\n  {', 0, id_pos)
if entry_start == -1:
    print('오류: 항목 시작 { 를 찾지 못함')
    exit(1)
entry_start += 1  # 개행문자 제외, { 위치

# { 에서 괄호 균형을 세어 항목 끝 찾기
depth = 0
entry_end = entry_start
for i, ch in enumerate(original[entry_start:], entry_start):
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            entry_end = i + 1
            break

old_block = original[entry_start:entry_end]
print(f'교체 대상: {entry_start}~{entry_end} ({len(old_block)} chars)')

updated = original[:entry_start] + new_block_indented + original[entry_end:]

with open(CURATION_PATH, 'w', encoding='utf-8') as f:
    f.write(updated)

wikt_count = sum(1 for w in items if w.get('meaningKrSource') == 'wiktionary')
ai_count = sum(1 for w in items if w.get('meaningKrSource') == 'ai')
print(f'완료: {len(items)}개 단어')
print(f'  Wiktionary 한국어: {wikt_count}개 ({round(wikt_count/len(items)*100)}%)')
print(f'  AI 대체: {ai_count}개 ({round(ai_count/len(items)*100)}%)')
print(f'  {CURATION_PATH} 업데이트됨')
