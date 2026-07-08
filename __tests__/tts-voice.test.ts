import { normalizeLang, pickVoice, primarySubtag, SelectableVoice } from '@/lib/tts-voice';

// 헬퍼: 음성 목록을 간결하게 구성.
const v = (identifier: string, language: string, quality = 'Default'): SelectableVoice => ({
  identifier,
  language,
  quality,
});

describe('normalizeLang', () => {
  it('소문자·하이픈으로 정규화한다', () => {
    expect(normalizeLang('zh_CN')).toBe('zh-cn');
    expect(normalizeLang('en-US')).toBe('en-us');
  });
});

describe('primarySubtag', () => {
  it('기본 언어 서브태그를 반환한다', () => {
    expect(primarySubtag('en-US')).toBe('en');
    expect(primarySubtag('zh-CN')).toBe('zh');
  });

  it("안드로이드의 'cmn'(표준중국어)를 'zh'로 취급한다", () => {
    expect(primarySubtag('cmn-Hans-CN')).toBe('zh');
    expect(primarySubtag('cmn-cn-x-ccc-network')).toBe('zh');
  });
});

describe('pickVoice — 중국어 음색 널뛰기 방지(핵심)', () => {
  // 안드로이드 Google TTS의 전형적 zh-CN 음성 구성(네트워크/로컬 혼재).
  const zhVoices: SelectableVoice[] = [
    v('zh-CN-language', 'zh-CN'),
    v('cmn-cn-x-ccc-network', 'zh-CN'),
    v('cmn-cn-x-ccd-local', 'zh-CN'),
  ];

  it('여러 zh-CN 음성 중 항상 같은 identifier를 고른다', () => {
    // Default 품질 동률 → identifier 사전순 tie-break → 'cmn-cn-x-ccc-network'
    expect(pickVoice(zhVoices, 'zh-CN')).toBe('cmn-cn-x-ccc-network');
  });

  it('입력 순서가 바뀌어도 결과가 동일하다(결정적 선택)', () => {
    const forward = pickVoice(zhVoices, 'zh-CN');
    const reversed = pickVoice([...zhVoices].reverse(), 'zh-CN');
    const shuffled = pickVoice([zhVoices[2], zhVoices[0], zhVoices[1]], 'zh-CN');
    expect(reversed).toBe(forward);
    expect(shuffled).toBe(forward);
  });

  it("언어가 'cmn-...'으로 보고돼도 zh-CN에 매칭된다", () => {
    const voices = [v('cmn-hans', 'cmn-Hans-CN'), v('ko', 'ko-KR')];
    expect(pickVoice(voices, 'zh-CN')).toBe('cmn-hans');
  });

  it('Enhanced 품질을 Default보다 우선한다', () => {
    const voices = [
      v('aaa-default', 'zh-CN', 'Default'),
      v('zzz-enhanced', 'zh-CN', 'Enhanced'),
    ];
    // 사전순으로는 aaa가 앞서지만 품질 우선이므로 enhanced 선택
    expect(pickVoice(voices, 'zh-CN')).toBe('zzz-enhanced');
  });

  it('zh-CN 요청 시 zh-TW보다 간체(cn/hans)를 우선한다', () => {
    const voices = [v('tw', 'zh-TW'), v('cn', 'zh-CN')];
    expect(pickVoice(voices, 'zh-CN')).toBe('cn');
  });

  it('간체 음성이 없으면 같은 언어(zh-TW)로 폴백한다', () => {
    const voices = [v('tw-a', 'zh-TW'), v('tw-b', 'zh-TW')];
    expect(pickVoice(voices, 'zh-CN')).toBe('tw-a'); // 사전순 tie-break
  });
});

describe('pickVoice — iOS Eloquence/novelty 음성 회피', () => {
  // iOS 16.4+ 실기 음성 구성: Eloquence(구식 로봇 음색)와 novelty(효과음)가
  // 표준 음성(compact Samantha)과 함께 전부 quality 'Default'로 보고된다.
  // 알파벳순 tie-break만으로는 'com.apple.eloquence.…'(e)가 'com.apple.voice.…'(v)를
  // 항상 이겨 로봇 음성이 고정 선택되는 회귀가 있었다.
  const iosEnVoices: SelectableVoice[] = [
    v('com.apple.eloquence.en-US.Eddy', 'en-US'),
    v('com.apple.eloquence.en-US.Flo', 'en-US'),
    v('com.apple.speech.synthesis.voice.Albert', 'en-US'),
    v('com.apple.speech.synthesis.voice.BadNews', 'en-US'),
    v('com.apple.voice.compact.en-US.Samantha', 'en-US'),
  ];

  it('Eloquence·novelty보다 표준(compact) 음성을 우선한다', () => {
    expect(pickVoice(iosEnVoices, 'en-US')).toBe('com.apple.voice.compact.en-US.Samantha');
  });

  it('한국어도 Eloquence 대신 표준 음성(Yuna)을 고른다', () => {
    const voices = [
      v('com.apple.eloquence.ko-KR.Eddy', 'ko-KR'),
      v('com.apple.voice.compact.ko-KR.Yuna', 'ko-KR'),
    ];
    expect(pickVoice(voices, 'ko-KR')).toBe('com.apple.voice.compact.ko-KR.Yuna');
  });

  it('Enhanced 음성이 있으면 여전히 최우선이다', () => {
    const voices = [
      ...iosEnVoices,
      v('com.apple.voice.enhanced.en-US.Samantha', 'en-US', 'Enhanced'),
    ];
    expect(pickVoice(voices, 'en-US')).toBe('com.apple.voice.enhanced.en-US.Samantha');
  });

  it('표준 음성이 하나도 없으면 Eloquence라도 결정적으로 고른다(무음보다 낫다)', () => {
    const voices = [
      v('com.apple.eloquence.en-US.Flo', 'en-US'),
      v('com.apple.eloquence.en-US.Eddy', 'en-US'),
    ];
    expect(pickVoice(voices, 'en-US')).toBe('com.apple.eloquence.en-US.Eddy');
  });

  it('안드로이드 identifier(비 com.apple.*)는 페널티 없이 기존 순서를 유지한다', () => {
    const voices = [
      v('zh-CN-language', 'zh-CN'),
      v('cmn-cn-x-ccc-network', 'zh-CN'),
    ];
    expect(pickVoice(voices, 'zh-CN')).toBe('cmn-cn-x-ccc-network');
  });
});

describe('pickVoice — 기타 언어 & 폴백', () => {
  it('en-US 요청 시 지역이 일치하는 음성을 고른다', () => {
    const voices = [v('gb', 'en-GB'), v('us', 'en-US'), v('au', 'en-AU')];
    expect(pickVoice(voices, 'en-US')).toBe('us');
  });

  it('매칭 언어가 없으면 undefined(호출부가 language 폴백)', () => {
    const voices = [v('ko', 'ko-KR'), v('ja', 'ja-JP')];
    expect(pickVoice(voices, 'zh-CN')).toBeUndefined();
  });

  it('음성 목록이 비어 있으면 undefined', () => {
    expect(pickVoice([], 'zh-CN')).toBeUndefined();
  });

  it("underscore 태그('zh_CN')도 정상 매칭한다", () => {
    const voices = [v('cn', 'zh_CN')];
    expect(pickVoice(voices, 'zh-CN')).toBe('cn');
  });
});
