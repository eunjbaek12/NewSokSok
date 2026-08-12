import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI 단어 생성 오류 표시', () => {
  const src = readFileSync(join(process.cwd(), 'features/curation/screen.tsx'), 'utf8');

  it('BYOK 할당량 오류는 사진 스캔과 같은 정식 문구를 사용한다', () => {
    expect(src).toContain("title: t('scanError.quotaTitle')");
    expect(src).toContain("message: t('scanError.byokQuotaExceeded')");
  });

  it('Gemini 3.x 생성 요청은 2.5용 thinkingBudget과 수동 temperature를 보내지 않는다', () => {
    const generate = src.slice(
      src.indexOf('const generateViaByok'),
      src.indexOf('const generateAIWords'),
    );
    expect(generate).toContain("thinkingConfig: { thinkingLevel: 'minimal' }");
    expect(generate).not.toMatch(/thinkingBudget\s*:/);
    expect(generate).not.toMatch(/temperature\s*:/);
    expect(generate).not.toContain("status === 'INVALID_ARGUMENT' || response.status === 400");
  });

  it('생성 오류는 네이티브 모달 뒤의 Snackbar가 아니라 모달 내부 상태로 표시한다', () => {
    const catchBlock = src.slice(
      src.indexOf('} catch (e: any) {', src.indexOf('const handleGenerateAI')),
      src.indexOf('} finally {', src.indexOf('const handleGenerateAI')),
    );
    expect(catchBlock).toContain('setAiModalError(');
    expect(catchBlock).not.toContain('setSnackbar(');

    const visibleProp = src.indexOf('visible={aiModalVisible}');
    const dialogStart = src.lastIndexOf('<DialogModal', visibleProp);
    const dialog = src.slice(dialogStart);
    expect(visibleProp).toBeGreaterThan(0);
    expect(dialogStart).toBeGreaterThan(0);
    expect(dialog.indexOf('{aiModalError && (')).toBeGreaterThan(0);
    expect(dialog.indexOf('{aiModalError && (')).toBeLessThan(dialog.indexOf('</DialogModal>'));
  });
});
