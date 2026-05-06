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
  };
  characterAccessory: CharacterAccessory;
}
