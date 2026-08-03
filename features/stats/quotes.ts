import { resolveLocale, type UILocaleCode } from '@/i18n/locale';

import { dateStrToEpochDay } from './date';

/** 명언 한 줄. author가 비면 UI에서 출처 줄을 렌더하지 않는다. */
export interface Quote {
  text: string;
  author?: string;
}

// 학습·언어·꾸준함을 주제로 진지한 명언과 가볍게 응원하는 문구를 반반 섞음.
// 출처는 인물·속담 다양하게. 응원 문구는 author 없음. SFW.

const KO: Quote[] = [
  { text: '언어의 한계는 곧 내 세계의 한계를 뜻한다.', author: '루트비히 비트겐슈타인' },
  { text: '새로운 언어를 갖는다는 것은 두 번째 영혼을 갖는 것이다.', author: '샤를마뉴' },
  { text: '배움에는 왕도가 없다.', author: '유클리드' },
  { text: '천 리 길도 한 걸음부터.', author: '노자' },
  { text: '아는 것이 힘이다.', author: '프랜시스 베이컨' },
  { text: '천천히 가더라도 멈추지만 않으면 된다.', author: '공자' },
  { text: '반복은 학습의 어머니다.', author: '라틴 속담' },
  { text: '우물을 파도 한 우물을 파라.', author: '한국 속담' },
  { text: '티끌 모아 태산.', author: '한국 속담' },
  { text: '작은 도끼질도 큰 참나무를 쓰러뜨린다.', author: '벤저민 프랭클린' },
  { text: '배움은 누구도 빼앗아 갈 수 없는 재산이다.', author: 'B.B. 킹' },
  { text: '오늘 할 수 있는 일에 온 힘을 다하라.', author: '아이작 뉴턴' },
  { text: '오늘의 한 단어가 내일의 문장이 됩니다.' },
  { text: '완벽하지 않아도 괜찮아요. 어제보다 한 단어 더!' },
  { text: '꾸준함이 재능을 이깁니다.' },
  { text: '작은 습관이 큰 변화를 만들어요.' },
  { text: '실수는 잘 배우고 있다는 증거예요.' },
  { text: '포기하지 않는 한, 늦은 때란 없어요.' },
  { text: '오늘도 한 걸음, 정말 잘하고 있어요.' },
  { text: '하루 5분이 1년이면 30시간이 됩니다.' },
  { text: '외운 단어는 사라지지 않아요. 계속 쌓이는 중!' },
  { text: '지금 멈추지 않으면 반드시 늘어요.' },
];

const EN: Quote[] = [
  { text: 'The limits of my language mean the limits of my world.', author: 'Ludwig Wittgenstein' },
  { text: 'To have another language is to possess a second soul.', author: 'Charlemagne' },
  { text: 'There is no royal road to learning.', author: 'Euclid' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'Knowledge is power.', author: 'Francis Bacon' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Repetition is the mother of learning.', author: 'Latin proverb' },
  { text: 'Little strokes fell great oaks.', author: 'Benjamin Franklin' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'The beautiful thing about learning is that no one can take it away from you.', author: 'B.B. King' },
  { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { text: 'Drop by drop fills the tub.', author: 'Proverb' },
  { text: 'One word today becomes a sentence tomorrow.' },
  { text: "Progress, not perfection — one more word than yesterday." },
  { text: 'Consistency beats talent.' },
  { text: 'Small habits, big change.' },
  { text: "Mistakes are proof that you're learning." },
  { text: "It's never too late as long as you don't quit." },
  { text: "One step at a time — you're doing great." },
  { text: '5 minutes a day is 30 hours a year.' },
  { text: 'Every word you learn stays with you.' },
  { text: 'Keep going. It always adds up.' },
];

const ES: Quote[] = [
  { text: 'Los límites de mi lenguaje significan los límites de mi mundo.', author: 'Ludwig Wittgenstein' },
  { text: 'Tener otra lengua es poseer una segunda alma.', author: 'Carlomagno' },
  { text: 'No hay camino real hacia el aprendizaje.', author: 'Euclides' },
  { text: 'Un viaje de mil millas comienza con un solo paso.', author: 'Lao-Tsé' },
  { text: 'El conocimiento es poder.', author: 'Francis Bacon' },
  { text: 'No importa lo despacio que vayas, mientras no te detengas.', author: 'Confucio' },
  { text: 'La repetición es la madre del aprendizaje.', author: 'Proverbio latino' },
  { text: 'Poco a poco se anda lejos.', author: 'Refrán español' },
  { text: 'Gota a gota, el mar se agota.', author: 'Refrán español' },
  { text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', author: 'Miguel de Cervantes' },
  { text: 'Lo bello de aprender es que nadie puede quitártelo.', author: 'B.B. King' },
  { text: 'Aprender nunca agota la mente.', author: 'Leonardo da Vinci' },
  { text: 'Una palabra hoy es una frase mañana.' },
  { text: 'Progreso, no perfección: una palabra más que ayer.' },
  { text: 'La constancia le gana al talento.' },
  { text: 'Pequeños hábitos, grandes cambios.' },
  { text: 'Los errores son la prueba de que estás aprendiendo.' },
  { text: 'Nunca es tarde mientras no te rindas.' },
  { text: 'Paso a paso. Lo estás haciendo muy bien.' },
  { text: 'Cinco minutos al día son 30 horas al año.' },
  { text: 'Cada palabra que aprendes se queda contigo.' },
  { text: 'Sigue adelante. Todo suma.' },
];

/**
 * UI 언어별 명언 목록.
 *
 * 번역 JSON이 아니라 코드에 두는 이유: 명언은 번역이 아니라 **대체**다. 한국어 사용자에게
 * 필요한 건 비트겐슈타인의 한국어 번역문이 아니라 "천 리 길도 한 걸음부터"라서, 언어마다
 * 목록의 길이도 출처도 다르다(실제로 KO는 한국 속담 2개, EN은 프랭클린 2개로 갈린다).
 *
 * Record<UILocaleCode, …>이라 언어를 추가하면 여기서 컴파일이 깨진다 — 예전에는
 * `startsWith('ko') ? KO : EN` 삼항이라 새 언어가 조용히 영어 명언을 받았다.
 */
const QUOTES: Record<UILocaleCode, Quote[]> = { ko: KO, en: EN, es: ES };

/** UI 언어에 맞는 명언 목록. 지원하지 않는 언어는 `FALLBACK_LOCALE`의 목록. */
export function getQuotes(lang: string): Quote[] {
  return QUOTES[resolveLocale(lang)];
}

/**
 * 날짜 기준 오늘의 명언. 같은 날짜·같은 언어면 항상 같은 문구(하루 고정), 날짜가
 * 넘어가면 다음 문구로 순환. 네트워크 불필요.
 */
export function pickDailyQuote(dateStr: string, lang: string): Quote {
  const list = getQuotes(lang);
  const n = dateStrToEpochDay(dateStr);
  const idx = ((n % list.length) + list.length) % list.length;
  return list[idx];
}
