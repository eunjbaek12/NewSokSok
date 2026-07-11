export type SkinId = 'classic' | 'dark' | 'y2k' | 'lab';

export interface FontFamily {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export type CharacterAccessory = 'none' | 'y2k-ribbon';

export interface SkinDefinition {
  id: SkinId;
  nameKo: string;
  nameEn: string;
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
