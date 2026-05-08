"""
Wiktionary에서 단어 데이터를 가져옵니다.
실행: python scripts/fetch-wiktionary.py <list-name>
  예) python scripts/fetch-wiktionary.py tsl
      python scripts/fetch-wiktionary.py nawl
출력: scripts/<list-name>-wiktionary.json
"""
import sys, json, time, re, os
import urllib.request, urllib.parse

LIST_NAME = sys.argv[1].lower() if len(sys.argv) > 1 else ''
if not LIST_NAME:
    print('❌ 사용법: python scripts/fetch-wiktionary.py <list-name>')
    sys.exit(1)

SOURCE_MAP = {
    'tsl': 'tsl-top600-source.json',
    'nawl': 'nawl-source.json',
    'bsl': 'bsl-source.json',
    'ngsl': 'ngsl-source.json',
}
if LIST_NAME not in SOURCE_MAP:
    print(f'❌ 알 수 없는 목록: {LIST_NAME}')
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_PATH = os.path.join(SCRIPT_DIR, SOURCE_MAP[LIST_NAME])
OUTPUT_PATH = os.path.join(SCRIPT_DIR, f'{LIST_NAME}-wiktionary.json')
PROGRESS_PATH = os.path.join(SCRIPT_DIR, f'.{LIST_NAME}-wikt-progress.json')

DELAY = 0.2  # 5 req/sec
UA = 'SokSokVoca/1.0 (vocabulary learning app; educational use)'

def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception:
        return {}

def clean_korean(raw):
    s = re.sub(r'\([^)]*\)', '', raw)          # 한자 괄호 제거
    s = re.sub(r'\[\[[^\]]*\|([^\]]*)\]\]', r'\1', s)  # [[word|display]] → display
    s = re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)  # [[word]] → word
    s = re.sub(r"'{2,}", '', s)                # ''bold'' 제거
    s = re.sub(r'\{\{[^}]*\}\}', '', s)        # {{template}} 제거
    return s.strip()

def fetch_word(term):
    encoded = urllib.parse.quote(term)

    # REST API: POS, definition, examples
    d1 = fetch_url(f'https://en.wiktionary.org/api/rest_v1/page/definition/{encoded}')
    eng = (d1.get('en') or [None])[0] or {}
    pos = eng.get('partOfSpeech', '')
    defs = eng.get('definitions') or []
    def_raw = defs[0].get('definition', '') if defs else ''
    definition = re.sub(r'<[^>]+>', '', def_raw).strip()
    example_raw = (defs[0].get('examples') or [''])[0] if defs else ''
    example_en = re.sub(r'<[^>]+>', '', example_raw).strip()

    # MediaWiki API: wikitext for IPA + Korean translations
    time.sleep(DELAY)
    d2 = fetch_url(f'https://en.wiktionary.org/w/api.php?action=parse&page={encoded}&prop=wikitext&format=json')
    wt = (d2.get('parse') or {}).get('wikitext', {}).get('*', '')

    # IPA
    ipa_m = re.search(r'/[^/\n]{2,40}/', wt)
    phonetic = ipa_m.group().strip() if ipa_m else ''

    # Korean translations: {{t+|ko|고객}} or {{t|ko|...}} or {{t!|ko|...}}
    ko_matches = re.findall(r'\{\{t[+!]?\|ko\|([^|}\n]+)', wt)
    ko_clean = [clean_korean(k) for k in ko_matches]
    ko_final = [k for k in ko_clean if k and re.search(r'[가-힣]', k)][:3]
    meaning_kr = ', '.join(ko_final)

    return {
        'term': term,
        'phonetic': phonetic,
        'pos': pos,
        'definition': definition,
        'meaningKr': meaning_kr,
        'exampleEn': example_en,
        'hasMeaningKr': len(meaning_kr) > 0,
    }

def load_progress():
    if os.path.exists(PROGRESS_PATH):
        with open(PROGRESS_PATH, encoding='utf-8') as f:
            return json.load(f)
    return []

def save_progress(items):
    with open(PROGRESS_PATH, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

def main():
    with open(SOURCE_PATH, encoding='utf-8') as f:
        source = json.load(f)
    print(f'📚 [{LIST_NAME.upper()}] {len(source)}개 단어 Wiktionary 조회 시작')

    done = load_progress()
    done_terms = {d['term'] for d in done}
    if done:
        print(f'📂 진행 파일: {len(done)}개 처리됨, 이어서 시작')

    results = list(done)

    for i, src in enumerate(source):
        if src['term'] in done_terms:
            continue

        entry = fetch_word(src['term'])
        entry['rank'] = src['rank']
        results.append(entry)
        time.sleep(DELAY)

        if (i + 1) % 50 == 0 or i == len(source) - 1:
            save_progress(results)
            with_kr = sum(1 for r in results if r['hasMeaningKr'])
            pct = round(with_kr / len(results) * 100)
            print(f'  [{i+1}/{len(source)}] 완료 — 한국어 있음: {with_kr}/{len(results)} ({pct}%)', flush=True)

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    with_kr = sum(1 for r in results if r['hasMeaningKr'])
    missing = [r['term'] for r in results if not r['hasMeaningKr']]
    print(f'\n✅ Wiktionary 조회 완료: {len(results)}개')
    print(f'   한국어 있음: {with_kr}개 ({round(with_kr/len(results)*100)}%)')
    print(f'   한국어 없음: {len(missing)}개 → AI 보완 필요')
    if len(missing) <= 40:
        print(f'   누락: {", ".join(missing)}')
    else:
        print(f'   누락 샘플: {", ".join(missing[:20])} ...')

    if os.path.exists(PROGRESS_PATH):
        os.remove(PROGRESS_PATH)

if __name__ == '__main__':
    main()
