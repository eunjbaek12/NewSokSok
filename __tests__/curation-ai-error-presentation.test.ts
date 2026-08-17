import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AI 단어 생성 오류 표시', () => {
  const src = readFileSync(join(process.cwd(), 'features/curation/screen.tsx'), 'utf8');

  // 검사 범위를 catch 블록으로 좁힌다 — 파일 전체를 보면 다른 곳의 같은 문자열이
  // 걸려 통과해 버린다(generate-prompt-legacy-field-sync 에서 실제로 겪은 함정).
  const generateCatch = src.slice(
    src.indexOf('} catch (e: any) {', src.indexOf('const handleGenerateAI')),
    src.indexOf('} finally {', src.indexOf('const handleGenerateAI')),
  );

  it('BYOK 할당량 오류는 사진 스캔과 같은 정식 문구를 사용한다', () => {
    expect(generateCatch).toContain("title: t('scanError.quotaTitle')");
    expect(generateCatch).toContain("t('scanError.byokQuotaExceeded')");
  });

  it('분당 한도만은 갈라내 "1분 후" 안내를 쓴다', () => {
    // 🔴 분당 한도는 1분이면 풀린다. 공통 문구("갱신 시점은 요금제와 설정에 따라 달라질
    // 수 있어요")로 뭉개면 오늘 못 쓴다고 읽힌다. generateViaByok 은 quotaMetric 으로
    // 일일/분당을 이미 갈라 던지므로(:218~225) 화면이 그 구분을 버리면 안 된다.
    expect(generateCatch).toContain("e.code === 'perMinuteQuota'");
    expect(generateCatch).toContain("t('aiError.perMinuteQuota')");
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
