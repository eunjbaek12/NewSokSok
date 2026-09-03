export type SkinId = 'classic' | 'dark' | 'y2k' | 'lab' | 'ocean' | 'autumn' | 'hangul';

export interface FontFamily {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export type CharacterAccessory = 'none' | 'y2k-ribbon' | 'ocean-hat' | 'autumn-leaf' | 'hangul-gat';

export interface SkinDefinition {
  id: SkinId;
  /**
   * 표시 이름의 번역 키. 예전에는 `nameKo`/`nameEn` 두 필드였는데, 그러면 언어를
   * 추가할 때마다 타입과 정의 네 개를 모두 고쳐야 하고 호출부의
   * `locale === 'ko' ? nameKo : nameEn` 삼항은 컴파일이 잡아주지도 않았다.
   *
   * 가리키는 키(`skinLab` 등)는 ko/en 번역 JSON에 **이미 있었지만 아무도 쓰지 않던**
   * 것이다 — 번역은 준비돼 있었고 컴포넌트만 하드코딩 필드를 읽고 있었다.
   */
  nameKey: string;
  colorScheme: 'light' | 'dark';
  fontFamily: FontFamily;
  previewColors: {
    background: string;
    primary: string;
    surface: string;
    accent: string;
    // 카드(surface) 위 글자색. 선택기 카드는 현재 테마가 아니라 각 스킨의
    // 고유 배경색을 쓰므로, 글자색도 스킨에 고정해야 어떤 테마에서든 보인다.
    text: string;
  };
  characterAccessory: CharacterAccessory;
}
