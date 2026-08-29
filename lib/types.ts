import type { WordSense } from '@shared/contracts';
import type { HeadwordDefect } from '@/utils/headword-guard';

export type PlanStatus = 'none' | 'in-progress' | 'completed' | 'overdue' | 'inactive';

export interface Word {
  id: string;
  term: string;
  definition: string;
  phonetic?: string;
  pos?: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  isMemorized: boolean;
  isStarred: boolean;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
  wrongCount?: number;
  sourceListId?: string;
  assignedDay?: number | null;
  sourceLang?: string;
  targetLang?: string;
  /** 마지막으로 이 단어를 학습한 시각(epoch ms). null = 학습 이력 없음. 복습 due 판정의 기준. */
  lastReviewedAt?: number | null;
  /** "외웠어요" 누적 횟수. 복습 간격 사다리(3/10/30/90일)의 위치. */
  reviewSuccessCount?: number;
  /** 굴절형일 때의 원형. `abandoned` → `abandon`. 원형 자체면 없다. lib/inflection.ts 참조. */
  baseForm?: string;
  /** 굴절 형태 코드(`past_participle` 등). 문자열이 아니라 코드다 — 화면에서 i18n으로 옮긴다. */
  inflection?: string;
}

export interface VocaList {
  id: string;
  title: string;
  words: Word[];
  isVisible: boolean;
  createdAt: number;
  lastStudiedAt?: number;
  position?: number;
  isCurated?: boolean;
  icon?: string;
  isUserShared?: boolean;
  creatorId?: string | null;
  creatorName?: string;
  downloadCount?: number;
  planTotalDays?: number;
  planCurrentDay?: number;
  planWordsPerDay?: number;
  planStartedAt?: number;
  planUpdatedAt?: number;
  planFilter?: 'all' | 'unmemorized' | 'memorized';
  category?: string;
  level?: string;
  description?: string;
  isAiGenerated?: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  // 🔴 앱은 이 셋을 더 이상 쓰지 않는다(2026-08-29). 쓰는 곳도 읽는 곳도 없고,
  //    동기화가 서버 컬럼과 주고받기만 한다 — 구버전 앱이 아직 올리기 때문이다.
  //    화면에 붙이려다 여기까지 왔다면 features/vocab/db.ts 의 `saveLastResult`
  //    주석을 먼저 읽을 것(완주 시점 스냅샷이라 곧 거짓이 된다).
  lastResultMemorized?: number;
  lastResultTotal?: number;
  lastResultPercent?: number;
}

export interface StudyResult {
  word: Word;
  gotIt: boolean;
}

export type StudyMode = 'flashcards' | 'quiz' | 'examples';

export type ThemeMode = 'classic' | 'dark' | 'y2k' | 'lab';

export interface AutoFillResult {
  enrichmentLevel?: 'basic' | 'full';
  definition: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr?: string;
  mnemonic?: string;
  pos?: string;
  phonetic?: string;
  // 모델이 "이 단어는 사전에 존재하지 않는다"고 판단한 경우 false.
  // true/undefined는 실재로 간주. UI 분기(찾지 못함 vs 자동완성 실패)용.
  isReal?: boolean;
  // 표제어 자체가 깨져 있어 AI에 보내지 않고 막은 경우의 사유
  // (utils/headword-guard.ts). isReal===false와 함께 온다 — 안내 문구만 가른다.
  // 🔑 'script_mix'(배우는 언어와 다른 문자)에 "사전에서 찾지 못했다"고 하면 오해를
  //    부른다. `독일`은 존재하는 단어이고 진짜 문제는 학습 언어 설정이다.
  headwordDefect?: HeadwordDefect;
  // 사진 스캔 배치에서만: 서버 한도가 중간에 소진돼 이 항목을 카드/저장 대상에서
  // 다시 대기 목록으로 돌려야 한다. 일반 자동완성의 사전 폴백에는 쓰지 않는다.
  photoQuotaExceeded?: boolean;
  // 동음이의어 뜻 후보(2개 이상일 때만 존재). 상위 필드는 병기(①②) 결과 그대로이고,
  // add-word가 이 배열로 인라인 뜻 제안 칩을 띄운다. lib/senses.ts 참조.
  senses?: WordSense[];
  // 굴절형일 때의 원형과 형태 코드. lib/inflection.ts 참조.
  baseForm?: string;
  inflection?: string;
}

export interface AIWordResult {
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  mnemonic?: string;
  tags?: string[];
}
