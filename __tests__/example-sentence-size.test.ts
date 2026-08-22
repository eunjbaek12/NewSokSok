/**
 * 예문 카드의 글자 크기 단계.
 *
 * 시작은 B17 이었다 — 2026-08-21 실기(Android preview 1.6.0 · Galaxy S22 · 수능 필수 어휘 500)
 * 에서 문장이 여섯 줄이 되면 스피커가 카드 밖으로 밀려나 반쯤 잘렸다(45문항 중 7문항).
 *
 * 8/22 dev 실기에서 그 처방이 두 번 더 뒤집혔다. 줄 수로 판정하니 ⑴글자만 바뀌고 줄 수가
 * 그대로면 `onTextLayout` 이 다시 오지 않아 한 단계에서 멈춰 잘렸고, ⑵억지로 다시 판정하게
 * 하니 옛 줄 수로 바닥까지 내려갔다. 지금은 스크롤 영역이 알려 주는 **내용 높이와 보이는
 * 높이**만으로 판정한다 — 크기가 바뀌면 그 값은 반드시 다시 온다.
 *
 * 여기서 검증하는 것은 **단계 계산과 종료성**이다. 실제 배치(flex 사슬·스크롤 동작)는
 * 기기에서만 확인할 수 있다.
 */
import { SENTENCE_SIZES, nextSentenceStep } from '@/features/study/examples/sentence-size';

// 실측(Galaxy S22 · 카드 232dp): 스피커와 별표 몫을 뺀 문장 영역은 130dp 안팎이다.
const VIEWPORT = 130;

describe('nextSentenceStep — 보이는 영역을 넘칠 때만 줄인다', () => {
    it('들어가면 그대로 둔다', () => {
        expect(nextSentenceStep(0, 104, VIEWPORT)).toBe(0);
    });

    it('넘치면 한 단계 내린다', () => {
        expect(nextSentenceStep(0, 204, VIEWPORT)).toBe(1);
    });

    it('딱 맞으면 내리지 않는다 — 반올림 때문에 한 단계 손해 보지 않게', () => {
        expect(nextSentenceStep(0, VIEWPORT, VIEWPORT)).toBe(0);
        expect(nextSentenceStep(0, VIEWPORT + 1, VIEWPORT)).toBe(0);
        expect(nextSentenceStep(0, VIEWPORT + 2, VIEWPORT)).toBe(1);
    });

    it('한 번에 한 단계씩만 내려간다 — 여러 콜백이 같은 값으로 불러도 같은 답이 나온다', () => {
        // onLayout 과 onContentSizeChange 가 같은 사이클에 둘 다 온다. 두 번 불러도
        // 결과가 같아야 한 프레임에 두 단계가 내려가지 않는다.
        expect(nextSentenceStep(0, 400, VIEWPORT)).toBe(1);
        expect(nextSentenceStep(0, 400, VIEWPORT)).toBe(1);
    });

    it('🔑 마지막 단계에서는 더 내려가지 않는다 — 그 아래는 스크롤이 받는다', () => {
        // 실측 15% 는 어느 크기로도 안 들어간다. 거기서 더 줄이면 번역(14dp)보다 작아져
        // 정답이 곁들이보다 작아 보이는 역전이 생긴다(B3 에서 지적된 증상).
        const last = SENTENCE_SIZES.length - 1;
        expect(nextSentenceStep(last, 999, 10)).toBe(last);
    });

    it('아직 못 잰 값(0)으로는 판단하지 않는다', () => {
        // 문항이 바뀌면 내용 높이를 비운다. 앞 문장 값으로 판정하면 짧은 문장도 작아진다.
        expect(nextSentenceStep(0, 0, VIEWPORT)).toBe(0);
        expect(nextSentenceStep(0, 204, 0)).toBe(0);
    });

    it('반복해서 불러도 표 끝에서 멈춘다 — 되돌이표가 생기지 않는다', () => {
        let step = 0;
        for (let i = 0; i < 50; i++) step = nextSentenceStep(step, 999, 10);
        expect(step).toBe(SENTENCE_SIZES.length - 1);
    });

    it('실기 시나리오: 단계마다 줄어들다 들어가면 멈추고, 끝까지 가도 안 들어가면 스크롤이 받는다', () => {
        // 글자가 작아지면 내용 높이도 같은 비율로 준다. 그 수렴을 흉내낸다.
        const converge = (initial: number) => {
            const contentAt = (step: number) =>
                Math.round(initial * (SENTENCE_SIZES[step].lineHeight / SENTENCE_SIZES[0].lineHeight));
            let step = 0;
            for (let i = 0; i < 10; i++) {
                const next = nextSentenceStep(step, contentAt(step), VIEWPORT);
                if (next === step) break;
                step = next;
            }
            return { step, content: contentAt(step) };
        };

        // 조금 넘치는 문장 — 중간 단계에서 멈추고 온전히 들어간다.
        const mid = converge(150);
        expect(mid.step).toBe(2);
        expect(mid.content).toBeLessThanOrEqual(VIEWPORT);

        // 아주 긴 문장 — 표 끝까지 내려가고, 그래도 넘치는 만큼은 스크롤이 맡는다.
        // 예전 표(14dp)라면 여기서 한 단계 더 내려가 번역보다 작아졌다.
        const long = converge(204);
        expect(long.step).toBe(SENTENCE_SIZES.length - 1);
        expect(long.content).toBeGreaterThan(VIEWPORT);
    });
});

describe('SENTENCE_SIZES — 표 자체가 지켜야 할 것', () => {
    it('🔑 표는 16dp 에서 끝난다 — 그 아래로 줄이지 않는다', () => {
        // 14dp 단계를 되살리면 번역(14dp)과 같은 크기가 되어 정답이 곁들이보다 작아 보인다.
        // 컨테이너에 맞추려 글자를 한없이 줄이는 것은 WCAG 1.4.4/1.4.10 이 실패로 보는 방식이고,
        // Anki·Quizlet 도 그 자리에서 스크롤을 쓴다.
        const last = SENTENCE_SIZES[SENTENCE_SIZES.length - 1];
        expect(last.fontSize).toBe(16);
        expect(SENTENCE_SIZES.every(s => s.fontSize >= 16)).toBe(true);
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

    it('첫 단계는 원래 크기 그대로다 — 대다수 문장은 줄지 않는다', () => {
        // 기기 DB 944장 실측: 문제를 푸는 동안 80% 가 이 크기 그대로다.
        expect(SENTENCE_SIZES[0].fontSize).toBe(24);
        expect(SENTENCE_SIZES[0].lineHeight).toBe(34);
    });
});
