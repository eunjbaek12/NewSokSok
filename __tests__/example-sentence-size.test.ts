/**
 * B17 회귀 — 예문이 여섯 줄이 되면 스피커 버튼이 카드 밖으로 밀려나던 것.
 *
 * 2026-08-21 실기(Android preview 1.6.0 · Galaxy S22 · 수능 필수 어휘 500 45문항):
 * 문장 노드 높이가 599px(6줄)이 되는 순간 스피커가 카드 테두리 아래에 반쯤 잘린 채
 * 그려졌다. 5줄(510px)까지는 카드 안이었다. 45문항 중 7문항(15.6%).
 *
 * 여기서 검증하는 것은 **축소 단계 계산과 종료성**이다. 실제 배치(flexShrink 사슬,
 * onLayout/onTextLayout 순서)는 기기에서만 확인할 수 있다.
 */
import { SENTENCE_SIZES, nextSentenceStep, sentenceHeadroom } from '@/features/study/examples/sentence-size';

// 실측값: 6줄이 되던 카드에서 문장 영역에 허용된 높이는 약 510px 이었다(5줄이 들어가던 높이).
const AVAILABLE = 510;

describe('nextSentenceStep — 문장이 카드에 들어갈 때까지만 줄인다', () => {
    it('들어가면 그대로 둔다', () => {
        // 5줄 × 34 = 170 ≤ 510
        expect(nextSentenceStep(0, 5, AVAILABLE)).toBe(0);
    });

    it('넘치면 한 단계 내린다 — 실기에서 넘치던 6줄', () => {
        // 6줄 × 34 = 204 … 이 카드에서 문장이 쓸 수 있던 높이는 그보다 작았다.
        expect(nextSentenceStep(0, 6, 200)).toBe(1);
    });

    it('딱 맞으면 내리지 않는다 — 반올림 때문에 한 단계 손해 보지 않게', () => {
        const needed = 6 * SENTENCE_SIZES[0].lineHeight;
        expect(nextSentenceStep(0, 6, needed)).toBe(0);
    });

    it('마지막 단계에서는 더 내려가지 않는다 — 하한 없이 줄면 못 읽는다', () => {
        const last = SENTENCE_SIZES.length - 1;
        expect(nextSentenceStep(last, 99, 10)).toBe(last);
    });

    it('아직 못 잰 값(줄 수 0 · 높이 0)으로는 판단하지 않는다', () => {
        // onTextLayout 과 onLayout 은 어느 쪽이 먼저 올지 보장되지 않는다.
        // 한쪽만 도착한 프레임에서 성급히 줄이면 짧은 문장도 작아진다.
        expect(nextSentenceStep(0, 0, AVAILABLE)).toBe(0);
        expect(nextSentenceStep(0, 6, 0)).toBe(0);
    });

    it('반복해서 불러도 표 끝에서 멈춘다 — 되돌이표가 생기지 않는다', () => {
        let step = 0;
        for (let i = 0; i < 50; i++) step = nextSentenceStep(step, 99, 10);
        expect(step).toBe(SENTENCE_SIZES.length - 1);
    });

    it('단계는 글자·줄높이·빈칸이 함께 작아진다 — 글자만 줄면 `?` 박스만 커 보인다', () => {
        for (let i = 1; i < SENTENCE_SIZES.length; i++) {
            const prev = SENTENCE_SIZES[i - 1];
            const cur = SENTENCE_SIZES[i];
            expect(cur.fontSize).toBeLessThan(prev.fontSize);
            expect(cur.lineHeight).toBeLessThan(prev.lineHeight);
            expect(cur.blankW).toBeLessThan(prev.blankW);
            expect(cur.blankH).toBeLessThan(prev.blankH);
            expect(cur.blankFont).toBeLessThan(prev.blankFont);
        }
    });

    it('빈칸 높이는 줄 높이를 넘지 않는다 — 넘으면 그 줄만 벌어진다', () => {
        for (const size of SENTENCE_SIZES) {
            expect(size.blankH).toBeLessThanOrEqual(size.lineHeight);
        }
    });

    it('실측 최장 예문(171자)이 마지막 단계에서는 들어간다', () => {
        // 번들 65덱의 예문을 병기(①②③) 단위로 쪼갠 최대 길이가 171자다.
        // 카드 안쪽 폭은 약 247dp — 라틴 문자는 대략 fontSize의 절반을 차지한다.
        const last = SENTENCE_SIZES[SENTENCE_SIZES.length - 1];
        const charsPerLine = Math.floor(247 / (last.fontSize * 0.5));
        const lines = Math.ceil(171 / charsPerLine);
        // 실기에서 문장이 쓸 수 있던 높이(px). 그 안에 들어가야 잘리지 않는다.
        expect(lines * last.lineHeight).toBeLessThanOrEqual(AVAILABLE);
    });
});

/*
 * 2026-08-22 dev 클라이언트 실측에서 드러난 두 번째 결함.
 *
 * 처음 판정은 문장 영역의 높이를 그대로 "허용 높이"로 썼다. 그런데 카드는 콘텐츠에 맞춰
 * 자라므로 그 값은 "지금 문장이 차지한 높이"였다 — 글자를 줄이면 영역도 같이 줄어 계속
 * 넘친다고 읽혔고, 4줄짜리 문장이 카드에 빈 공간을 남긴 채 바닥 단계(14dp)까지 작아졌다.
 * 아래 숫자는 그때 기기에서 읽은 값이다(Galaxy S22 · 수능 필수 어휘 500 문항 40).
 */
describe('sentenceHeadroom — 허용 높이는 글자를 줄여도 변하지 않는다', () => {
    const AREA = 232; // 카드가 자랄 수 있는 최대 높이(dp)

    it('카드가 상한까지 자란 상태에서 문장 몫을 돌려준다', () => {
        // card=232(상한) · box=123 → 문장 외 몫 109 → 232 - 109
        expect(sentenceHeadroom(AREA, 232, 123)).toBe(123);
    });

    it('🔑 글자를 줄여 카드와 문장이 함께 작아져도 같은 값이 나온다', () => {
        // 같은 문항의 단계별 실측: (card, box) = (232,123) → (201,92) → (189,80).
        // 문장 외 몫(카드 − 문장)은 109 로 일정하므로 허용 높이도 123 으로 일정해야 한다.
        expect(sentenceHeadroom(AREA, 201, 92)).toBe(123);
        expect(sentenceHeadroom(AREA, 189, 80)).toBe(123);
    });

    it('짧은 문장이라 카드가 상한에 못 미쳐도 같은 값이다 — 그래야 괜히 줄이지 않는다', () => {
        // 두 줄짜리 문장(box=60)에서도 허용 높이는 그대로 123 이어야 한다.
        // 옛 방식(문장 영역 높이를 그대로 씀)이라면 60 이 나와 2줄×34=68 이 "넘친다"가 된다.
        expect(sentenceHeadroom(AREA, 169, 60)).toBe(123);
        expect(nextSentenceStep(0, 2, sentenceHeadroom(AREA, 169, 60))).toBe(0);
    });

    it('아직 재지 못한 값이 하나라도 있으면 0을 돌려준다 — 판정을 미루게 한다', () => {
        // 문항이 바뀌면 세 값을 함께 버린다. 하나만 새 값이면 문장 외 몫이 엉뚱해진다.
        expect(sentenceHeadroom(0, 232, 123)).toBe(0);
        expect(sentenceHeadroom(AREA, 0, 123)).toBe(0);
        expect(sentenceHeadroom(AREA, 232, 0)).toBe(0);
        // 0 이 나오면 nextSentenceStep 은 단계를 그대로 둔다.
        expect(nextSentenceStep(0, 6, 0)).toBe(0);
    });

    it('문장 외 몫이 상한보다 크면 0이다 — 음수 높이를 만들지 않는다', () => {
        expect(sentenceHeadroom(100, 232, 20)).toBe(0);
    });
});
