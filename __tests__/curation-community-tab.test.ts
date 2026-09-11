// 공유 단어장 탭 — 빈 화면 사유 · 「저장됨」 판정 · 공유 이름/미리보기.
// 판단만 잡는다. 화면(카드 모양·탭 복귀 시 재조회·헤더 버튼)은 기기에서 확인한다.

import { pickCommunityEmpty } from '@/features/curation/community-empty';
import { isSavedCopyOf } from '@/features/curation/saved-match';
import { communityToCard } from '@/features/curation/types';
import { resolveShareCreatorName, toSharedThemePreview, sanitizeShareTags } from '@/features/vocab/share-preview';
import type { VocaList, Word } from '@/lib/types';

const base = { failed: false, total: 2, visible: 2, searchQuery: '', languageFilter: 'all' };

describe('pickCommunityEmpty', () => {
  test('목록이 보이면 안내 없음', () => {
    expect(pickCommunityEmpty(base)).toBeNull();
  });

  test('빈 손으로 실패하면 failed — 「검색 결과 없음」이 아니다', () => {
    expect(pickCommunityEmpty({ ...base, failed: true, total: 0, visible: 0 })).toBe('failed');
  });

  test('받아 둔 목록이 있으면 새로 받기가 실패해도 목록을 그대로 둔다', () => {
    expect(pickCommunityEmpty({ ...base, failed: true })).toBeNull();
  });

  test('아무도 안 올렸으면 none — 검색어가 있어도 none', () => {
    expect(pickCommunityEmpty({ ...base, total: 0, visible: 0 })).toBe('none');
    expect(pickCommunityEmpty({ ...base, total: 0, visible: 0, searchQuery: '토익' })).toBe('none');
  });

  test('칩 때문에 0개면 chip', () => {
    expect(pickCommunityEmpty({ ...base, visible: 0, languageFilter: 'ja' })).toBe('chip');
  });

  test('검색어가 있으면 칩이 걸려 있어도 search', () => {
    expect(pickCommunityEmpty({ ...base, visible: 0, searchQuery: '토익', languageFilter: 'ja' })).toBe('search');
    expect(pickCommunityEmpty({ ...base, visible: 0, searchQuery: '토익' })).toBe('search');
  });

  test('공백만 있는 검색어는 검색어가 아니다', () => {
    expect(pickCommunityEmpty({ ...base, visible: 0, searchQuery: '   ', languageFilter: 'ja' })).toBe('chip');
  });
});

describe('isSavedCopyOf', () => {
  test('같은 제목(대소문자·앞뒤 공백 무시)', () => {
    expect(isSavedCopyOf('토익 빈출 동사', '토익 빈출 동사')).toBe(true);
    expect(isSavedCopyOf('  TOEIC Verbs ', 'toeic verbs')).toBe(true);
  });

  test('가져올 때 붙는 「제목-N」', () => {
    expect(isSavedCopyOf('토익-1', '토익')).toBe(true);
    expect(isSavedCopyOf('토익-12', '토익')).toBe(true);
  });

  test('앞부분만 같으면 아니다 — 예전 startsWith 가 잘못 띄우던 경우', () => {
    expect(isSavedCopyOf('토익 필수 600', '토익')).toBe(false);
    expect(isSavedCopyOf('토익-심화', '토익')).toBe(false);
    expect(isSavedCopyOf('토익-', '토익')).toBe(false);
  });

  test('빈 제목은 무엇과도 맞지 않는다', () => {
    expect(isSavedCopyOf('아무거나', '')).toBe(false);
  });
});

describe('resolveShareCreatorName', () => {
  test('닉네임이 있으면 그대로(앞뒤 공백 제거)', () => {
    expect(resolveShareCreatorName('  은정 ')).toBe('은정');
  });

  test('닉네임이 비면 null — Google 계정 이름으로 대신하지 않는다', () => {
    expect(resolveShareCreatorName('')).toBeNull();
    expect(resolveShareCreatorName('   ')).toBeNull();
    expect(resolveShareCreatorName(undefined)).toBeNull();
    expect(resolveShareCreatorName(null)).toBeNull();
  });
});

const word = (over: Partial<Word>): Word => ({
  id: over.term ?? 'w',
  term: 'w',
  definition: '',
  exampleEn: '',
  meaningKr: '',
  isMemorized: false,
  isStarred: false,
  tags: [],
  ...over,
});

const list = (over: Partial<VocaList>): VocaList => ({
  id: 'l1',
  title: '토익 빈출 동사',
  words: [],
  isVisible: true,
  createdAt: 0,
  ...over,
});

describe('toSharedThemePreview — 올라갈 모습이 실제와 같아야 한다', () => {
  test('아이콘이 없으면 없는 채로 — 예전 미리보기는 ✨를 그렸다', () => {
    const card = communityToCard(toSharedThemePreview(list({ icon: undefined }), '은정'));
    expect(card.icon).toBeUndefined();
  });

  test('아이콘이 있으면 그대로', () => {
    const card = communityToCard(toSharedThemePreview(list({ icon: '📘' }), '은정'));
    expect(card.icon).toBe('📘');
  });

  test('언어쌍은 단어장 메타가 아니라 단어 최빈 언어 — 업로드와 같은 규칙', () => {
    const l = list({
      sourceLanguage: 'en', targetLanguage: 'ko',
      words: [
        word({ term: 'a', sourceLang: 'ja', targetLang: 'ko' }),
        word({ term: 'b', sourceLang: 'ja', targetLang: 'ko' }),
        word({ term: 'c', sourceLang: 'en', targetLang: 'ko' }),
      ],
    });
    const card = communityToCard(toSharedThemePreview(l, '은정'));
    expect(card.sourceLanguage).toBe('ja');
    expect(card.targetLanguage).toBe('ko');
  });

  test('작성자 이름은 입력한 닉네임, 비면 없음', () => {
    expect(communityToCard(toSharedThemePreview(list({}), ' 은정 ')).creatorName).toBe('은정');
    expect(communityToCard(toSharedThemePreview(list({}), '')).creatorName).toBeUndefined();
  });

  test('태그 칩은 업로드 때 걸러지는 태그를 빼고 센다', () => {
    const long = 'x'.repeat(61);
    const l = list({ words: [word({ term: 'a', tags: [long, ' 동사 '] }), word({ term: 'b', tags: ['동사'] })] });
    const card = communityToCard(toSharedThemePreview(l, '은정'));
    expect(card.topTags).toEqual(['동사']);
    expect(sanitizeShareTags([long, ' 동사 '])).toEqual(['동사']);
  });
});
