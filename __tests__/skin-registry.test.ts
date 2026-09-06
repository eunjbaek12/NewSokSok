import { SKINS, SKIN_LIST, getSkinColors } from '@/constants/skins';
import type { SkinId } from '@/features/theme/types';

/**
 * 스킨을 더할 때 잊기 쉬운 자리들을 묶어 지킨다.
 *
 * 실제로 잊은 적이 있다 — `ocean` 을 추가하면서 skin-store 의 복원 조건(손으로 적은
 * `saved === 'classic' || 'dark' || ...`)을 같이 못 고쳐, **여름 바다를 고른 사용자는
 * 앱을 다시 켤 때마다 기본으로 돌아갔다.** 그 조건은 이제 SKIN_LIST 에서 파생하므로
 * 여기서 목록만 지키면 된다.
 */

const ALL: SkinId[] = ['classic', 'dark', 'y2k', 'lab', 'ocean', 'autumn', 'hangul'];

describe('스킨 등록', () => {
  it.each(ALL)('%s — 정의·팔레트·미리보기가 모두 있다', (id) => {
    const skin = SKINS[id];
    expect(skin).toBeDefined();
    expect(skin.id).toBe(id);
    expect(skin.nameKey).toMatch(/^skin/);

    // 팔레트가 없으면 getSkinColors 가 조용히 classic 을 돌려준다 — 그러면
    // 스킨을 골라도 색이 안 바뀌는데 오류는 안 난다. 그 침묵을 여기서 깬다.
    const colors = getSkinColors(id);
    if (id !== 'classic') {
      expect(colors).not.toBe(getSkinColors('classic'));
    }
    expect(colors.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);

    for (const key of ['background', 'primary', 'surface', 'accent', 'text'] as const) {
      expect(skin.previewColors[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('SKIN_LIST 는 SKINS 에 있는 것만 담는다', () => {
    for (const s of SKIN_LIST) {
      expect(SKINS[s.id]).toBe(s);
    }
  });

  it('SKIN_LIST 에 중복이 없다', () => {
    const ids = SKIN_LIST.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classic 이 맨 앞이다 — 기본값이 목록 첫 자리여야 한다', () => {
    expect(SKIN_LIST[0].id).toBe('classic');
  });
});

/**
 * 🚩 1.7.0(10/1) 플래그 — autumn·hangul 은 그때까지 선택기에 뜨지 않는다.
 *
 * 이 테스트는 **켤 때 같이 지우라고** 있는 것이다. 목록에 두 스킨을 더하면 여기서
 * 실패하므로, 플래그를 걷었다는 사실이 커밋에 드러난다. 가려 둔 코드가 조용히
 * 살아나거나 조용히 죽어 있는 것을 둘 다 막는다.
 *
 * 실제로 한 번 걷혔다가(c3e864a) 되돌아왔다 — 기준은 그림의 완성이 아니라 공개 시점이다.
 */
describe('가을·한글 스킨 플래그 (10/1 에 걷는다)', () => {
  it('팔레트와 정의는 들어가 있다', () => {
    expect(SKINS.autumn).toBeDefined();
    expect(SKINS.hangul).toBeDefined();
    expect(getSkinColors('autumn').primary).toBe('#A8442A');
    expect(getSkinColors('hangul').primary).toBe('#333A3F');
  });

  it('아직 선택기에는 없다', () => {
    const ids = SKIN_LIST.map(s => s.id);
    expect(ids).not.toContain('autumn');
    expect(ids).not.toContain('hangul');
  });

  it('한글 스킨은 명조를 쓴다', () => {
    expect(SKINS.hangul.fontFamily.regular).toBe('GowunBatang_400Regular');
    expect(SKINS.hangul.fontFamily.bold).toBe('GowunBatang_700Bold');
  });
});
