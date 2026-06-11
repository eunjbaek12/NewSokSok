// CSV 파일 입출력(네이티브). 순수 직렬화·파싱은 utils/csv.ts에 있고, 여기서는
// 파일 시스템 쓰기(expo-file-system)와 저장(Android SAF)·공유 시트(iOS)만 담당한다.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { serializeCsv, CsvWordRow } from '@/utils/csv';
import { VocaList, Word } from '@/lib/types';

export class SharingUnavailableError extends Error {
  constructor() {
    super('SHARING_UNAVAILABLE');
    this.name = 'SharingUnavailableError';
  }
}

// 파일명에 쓸 수 없는 문자 제거 + 길이 제한. 비면 기본값.
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
  return cleaned.slice(0, 60) || 'wordlist';
}

function wordToCsvRow(w: Word): CsvWordRow {
  return {
    term: w.term,
    meaningKr: w.meaningKr,
    phonetic: w.phonetic,
    pos: w.pos,
    definition: w.definition,
    exampleEn: w.exampleEn,
    exampleKr: w.exampleKr,
    tags: w.tags,
  };
}

export type ExportResult =
  | { kind: 'saved'; fileName: string }  // Android: 사용자가 고른 폴더에 저장됨(다운로드)
  | { kind: 'shared' }                   // iOS: 공유 시트("파일에 저장")를 띄움
  | { kind: 'cancelled' };               // Android: 폴더 선택 취소

// 단어장을 CSV로 직렬화 → 저장한다.
// - Android: Storage Access Framework로 폴더를 고르고 그 폴더에 직접 파일 생성(=다운로드).
//   공유 시트는 카톡 등 일부 앱이 .csv를 조용히 버려 신뢰할 수 없어 SAF 저장으로 간다.
// - iOS: 서드파티 앱이 접근하는 공용 다운로드 폴더가 없으므로 공유 시트(→ "파일에 저장")가
//   사실상 유일한 저장 경로다.
export async function exportListToCsv(list: VocaList): Promise<ExportResult> {
  const rows = (list.words ?? []).map(wordToCsvRow);
  const csv = serializeCsv(rows);
  const base = sanitizeFilename(list.title);
  const fileName = `${base}.csv`;

  if (Platform.OS === 'android') {
    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return { kind: 'cancelled' };
    // createFileAsync는 mimeType 기준으로 .csv를 붙이므로 확장자 없는 base를 넘긴다.
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      base,
      'text/csv',
    );
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    return { kind: 'saved', fileName };
  }

  // iOS(및 기타): 공유 시트 = "파일에 저장"
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) {
    throw new SharingUnavailableError();
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: list.title,
    UTI: 'public.comma-separated-values-text',
  });
  return { kind: 'shared' };
}

// 선택한 파일 URI의 텍스트를 읽어 반환(파싱은 호출부에서 parseCsv로).
export async function readCsvFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
