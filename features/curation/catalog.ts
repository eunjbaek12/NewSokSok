import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Word } from '@/lib/types';

// 공식 큐레이션 덱을 서버에서 읽는다 (docs/curation-server-migration-spec.md).
//
// 덱은 더 이상 앱 번들에 없다. 예전 presets.ts 는 constants/curationData.ts(8.32MB)를
// 동적 import 했는데, 동적 import 는 네이티브에서 번들 크기를 줄이지 못하고 평가 시점만
// 미룬다 — 덱을 늘릴수록 설치 크기가 커지는 구조였다(3월 149KB → 8월 8,130KB).
//
// 조회는 두 단계다:
//   1. 카탈로그(단어 없는 메타) 27KB — 목록 화면용. AsyncStorage 에 캐시해 두 번째
//      진입부터는 즉시 그리고, 오프라인에서도 목록은 보인다.
//   2. 덱 하나(단어 포함) 중앙값 20KB / 최대 529KB — 덱을 열 때만. 세션 메모리에만
//      담는다(디스크 캐시는 트래픽 계산상 필요가 없다: 임포트 실적 월 51건 ≈ 1MB).
//
// 🔑 앱 시작 경로에 넣지 말 것. 큐레이션 탭에 처음 들어갈 때 부르는 구조라야
//    콜드 스타트가 지금 그대로 유지된다.

const CATALOG_KEY = '@soksok_curation_catalog';

// 캐시 구조가 바뀌면 올린다. 옛 캐시는 버리고 다시 받는다.
const CATALOG_CACHE_VERSION = 1;

export interface OfficialThemeMeta {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  category?: string;
  level?: string;
  sourceLanguage: string;
  targetLanguage: string;
  wordCount: number;
  topTags: string[];
  contentVersion: number;
}

interface CatalogCache {
  version: number;
  fetchedAt: number;
  themes: OfficialThemeMeta[];
}

const CATALOG_SELECT =
  'id, title, icon, description, category, level, source_language, target_language, word_count, top_tags, content_version';

function mapTheme(row: any): OfficialThemeMeta {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    level: row.level ?? undefined,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    wordCount: row.word_count ?? 0,
    topTags: Array.isArray(row.top_tags) ? row.top_tags.map(String) : [],
    contentVersion: row.content_version ?? 1,
  };
}

/**
 * 공식 덱 목록. is_published 필터는 RLS 가 건다(정책 자체가 `using (is_published)`)
 * — 앱에서 조건을 빼먹어도 미공개 덱은 내려오지 않는다.
 */
export async function fetchOfficialCatalog(): Promise<OfficialThemeMeta[]> {
  // 지금은 64덱이라 한 페이지에 들어오지만, 덱을 심사 없이 늘리는 것이 이 구조의
  // 목적이므로 여기도 페이지를 넘긴다 — 1,000덱째부터 조용히 잘리게 두지 않는다.
  const data = await selectAllPages((from, to) =>
    supabase
      .from('official_themes')
      .select(CATALOG_SELECT)
      .order('position', { ascending: true })
      .range(from, to),
  );
  return data.map(mapTheme);
}

async function readCatalogCache(): Promise<CatalogCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogCache;
    if (parsed?.version !== CATALOG_CACHE_VERSION || !Array.isArray(parsed.themes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCatalogCache(themes: OfficialThemeMeta[]): Promise<void> {
  try {
    const payload: CatalogCache = { version: CATALOG_CACHE_VERSION, fetchedAt: Date.now(), themes };
    await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(payload));
  } catch {
    // 캐시는 있으면 좋은 것이다. 못 써도 이번 세션 동작에는 지장이 없다.
  }
}

// 덱 본문은 세션 동안만 들고 있는다(같은 덱을 열었다 닫았다 하는 경우).
const deckCache = new Map<string, Word[]>();

const DECK_SELECT =
  'id, position, term, definition, meaning_kr, example_en, example_kr, pronunciation, pos, tags';

// 🔴 PostgREST 는 한 응답에 1,000행까지만 준다 — 넘으면 에러가 아니라 **조용히 잘린다**.
// NGSL 1,001 · BSL 1,000 · NAWL 957 이라 이 상한에 정확히 걸린다(실제로 NGSL 을 받아
// 1,000개만 와서 발견했다). 같은 함정을 sync pull 에서 한 번 겪었다.
const PAGE_SIZE = 1000;

/** 1,000행 상한을 넘겨 전부 받는다. 마지막 페이지는 PAGE_SIZE 미만이라 거기서 멈춘다. */
async function selectAllPages(build: (from: number, to: number) => any): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/**
 * 덱 하나의 단어. position 순서가 콘텐츠의 일부다(NGSL·BSL 은 빈도순) — 정렬을
 * 서버에 맡기지 말고 명시한다.
 */
export async function fetchOfficialDeck(themeId: string): Promise<Word[]> {
  const cached = deckCache.get(themeId);
  if (cached) return cached;

  const data = await selectAllPages((from, to) =>
    supabase
      .from('official_words')
      .select(DECK_SELECT)
      .eq('theme_id', themeId)
      .order('position', { ascending: true })
      .range(from, to),
  );

  const words: Word[] = (data ?? []).map((w: any) => ({
    id: w.id,
    term: w.term,
    definition: w.definition ?? '',
    meaningKr: w.meaning_kr ?? '',
    exampleEn: w.example_en ?? '',
    exampleKr: w.example_kr ?? undefined,
    phonetic: w.pronunciation ?? undefined,
    pos: w.pos ?? undefined,
    tags: Array.isArray(w.tags) ? w.tags.map(String) : [],
    isMemorized: false,
    isStarred: false,
  }));
  deckCache.set(themeId, words);
  return words;
}

export interface CatalogState {
  themes: OfficialThemeMeta[];
  /** 화면에 그릴 것이 아직 없다(캐시도 없고 응답도 안 왔다). */
  loading: boolean;
  /** 목록을 한 번도 못 받았다 — 재시도 UI 를 띄울 상태. */
  failed: boolean;
  retry: () => void;
}

const EMPTY: OfficialThemeMeta[] = [];

/**
 * 목록 구독. 캐시가 있으면 그것을 즉시 보여주고 뒤에서 갱신한다(SWR).
 * 네트워크가 죽어도 캐시가 있으면 목록은 그대로 보이고, 실패는 덱을 열 때 드러난다.
 */
export function useOfficialCatalog(): CatalogState {
  const [themes, setThemes] = useState<OfficialThemeMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    setFailed(false);
    setNonce(n => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) 캐시 먼저 — 첫 진입이 아니면 스피너가 아예 안 보인다.
      const cache = await readCatalogCache();
      if (!cancelled && cache) setThemes(cache.themes);

      // 2) 갱신
      try {
        const fresh = await fetchOfficialCatalog();
        if (cancelled) return;
        setThemes(fresh);
        setFailed(false);
        void writeCatalogCache(fresh);
      } catch (e: any) {
        if (cancelled) return;
        console.warn('[curation] 공식 덱 목록 조회 실패:', e?.message ?? e);
        // 캐시로 이미 그리고 있다면 실패를 화면에 올리지 않는다 — 목록은 멀쩡히 보인다.
        setThemes(prev => prev ?? EMPTY);
        setFailed(prev => (cache ? prev : true));
      }
    })();

    return () => { cancelled = true; };
  }, [nonce]);

  return {
    themes: themes ?? EMPTY,
    loading: themes === null,
    failed,
    retry,
  };
}
