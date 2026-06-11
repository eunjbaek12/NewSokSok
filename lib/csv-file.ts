// CSV 파일 입출력(네이티브). 순수 직렬화·파싱은 utils/csv.ts에 있고, 여기서는
// 파일 시스템 쓰기(expo-file-system)와 공유 시트(expo-sharing)만 담당한다.
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

// 단어장을 CSV로 직렬화 → 캐시에 임시 파일로 쓰고 → 공유 시트를 띄운다.
export async function exportListToCsv(list: VocaList): Promise<void> {
  const rows = (list.words ?? []).map(wordToCsvRow);
  const csv = serializeCsv(rows);

  const uri = `${FileSystem.cacheDirectory}${sanitizeFilename(list.title)}.csv`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  if (!(await Sharing.isAvailableAsync())) {
    throw new SharingUnavailableError();
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: list.title,
    UTI: 'public.comma-separated-values-text',
  });
}

// 선택한 파일 URI의 텍스트를 읽어 반환(파싱은 호출부에서 parseCsv로).
export async function readCsvFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
