// 단어장 내보내기/가져오기 전용 CSV (RFC 4180) 직렬화·파싱.
//
// 기존 utils/importParser.ts는 "단어만 추출 + AI 보강" 용도라 따옴표 인용을
// 처리하지 않는다(주석에 명시). 이 모듈은 뜻·예문 등 전체 컬럼을 손실 없이
// 왕복시켜야 하므로 RFC 4180 인용(콤마·따옴표·개행 포함 필드를 "..."로 감싸고
// 내부 "는 ""로 이스케이프)을 구현한다.
//
// 가져온 행은 features/vocab의 addBatchWords(→ WordSaveSchema)로 저장되므로,
// 파싱 단계에서 제어문자 제거(NO_CONTROL)와 컬럼별 길이 제한을 미리 적용해
// 저장 시 throw를 방지한다.
import { WORD_SAVE_CAPS, sanitizeWordField } from './word-sanitize';

export interface CsvWordRow {
  term: string;
  meaningKr: string;
  phonetic?: string;
  pos?: string;
  definition?: string;
  exampleEn?: string;
  exampleKr?: string;
  tags?: string[];
}

// 내보내기 컬럼 순서 + 한국어 헤더(왕복 기준). 가져오기는 헤더명으로 매핑하므로
// 순서가 달라도 되지만, 우리 내보내기 파일은 이 순서·이 헤더로 고정한다.
export const CSV_COLUMNS = ['term', 'meaningKr', 'phonetic', 'pos', 'definition', 'exampleEn', 'exampleKr', 'tags'] as const;
export const CSV_HEADERS_KO = ['단어', '뜻', '발음', '품사', '정의', '예문', '예문뜻', '태그'] as const;

const TAG_CAP = 60;
const TAG_DELIM = ';';
const BOM = '﻿';

// 헤더 별칭 → 표준 키. 한국어/영어 모두 인식해 외부 CSV도 받아들인다.
const HEADER_ALIASES: Record<string, string[]> = {
  term: ['단어', 'word', 'term', '표제어', '영단어'],
  meaningKr: ['뜻', '의미', 'meaning', '뜻(필수)', '단어뜻'],
  phonetic: ['발음', 'phonetic', 'pronunciation', '발음기호'],
  pos: ['품사', 'pos', 'part of speech', 'partofspeech'],
  definition: ['정의', 'definition', 'def'],
  exampleEn: ['예문', 'example', 'sentence', '예시', 'examplesentence'],
  exampleKr: ['예문뜻', '예문번역', '예문 뜻', '예문해석', 'example translation', 'exampletranslation'],
  tags: ['태그', 'tags', 'tag'],
};

// 제어문자 제거 + 길이 클램프는 저장 경계와 공용 헬퍼를 쓴다(단일 소스).
// CAPS(WordSaveSchema 동기화)도 거기서 가져온다.
const CAPS = WORD_SAVE_CAPS;
const sanitize = sanitizeWordField;

// RFC 4180: 콤마·따옴표·개행이 있으면 따옴표로 감싸고 내부 따옴표는 두 개로.
function escapeField(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// CsvWordRow[] → CSV 문자열. UTF-8 BOM(엑셀 한글) + CRLF(RFC 4180) 포함.
export function serializeCsv(rows: CsvWordRow[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS_KO.map(escapeField).join(','));
  for (const row of rows) {
    const cells = CSV_COLUMNS.map((col) => {
      if (col === 'tags') return escapeField((row.tags ?? []).join(TAG_DELIM));
      return escapeField(String(row[col] ?? ''));
    });
    lines.push(cells.join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

// 저수준 토크나이저: CSV 텍스트 → 레코드(필드 배열)의 배열.
// 따옴표로 감싼 필드 내부의 콤마·개행을 보존한다.
function tokenize(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { record.push(field); field = ''; i++; continue; }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      record.push(field); records.push(record); record = []; field = ''; i++; continue;
    }
    if (ch === '\n') {
      record.push(field); records.push(record); record = []; field = ''; i++; continue;
    }
    field += ch; i++;
  }
  // 마지막 필드/레코드(후행 개행이 없을 때만 의미 있음).
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export class CsvParseError extends Error {
  constructor(public readonly code: 'empty' | 'missingColumns' | 'noValidRows') {
    super(code);
    this.name = 'CsvParseError';
  }
}

export interface CsvParseResult {
  rows: CsvWordRow[];
  /** 단어/뜻이 비어 제외된 데이터 행 수(헤더 제외). */
  skipped: number;
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

// CSV 문자열 → { rows, skipped }.
// - 선두 BOM 제거
// - 첫 레코드를 헤더로 보고 별칭 매핑
// - 단어·뜻 컬럼이 없으면 CsvParseError('missingColumns')
// - 데이터 행 중 단어 또는 뜻이 비면 제외(skipped 카운트)
// - 유효 행이 0개면 CsvParseError('noValidRows')
export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  if (!text.trim()) throw new CsvParseError('empty');

  const records = tokenize(text).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (records.length === 0) throw new CsvParseError('empty');

  // 헤더 → 컬럼 인덱스 매핑
  const header = records[0];
  const aliasToKey = new Map<string, string>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) aliasToKey.set(normalizeHeader(a), key);
  }
  const colIndex: Partial<Record<string, number>> = {};
  header.forEach((cell, idx) => {
    const key = aliasToKey.get(normalizeHeader(cell));
    if (key && colIndex[key] === undefined) colIndex[key] = idx;
  });

  if (colIndex.term === undefined || colIndex.meaningKr === undefined) {
    throw new CsvParseError('missingColumns');
  }

  const rows: CsvWordRow[] = [];
  let skipped = 0;

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const get = (key: string): string => {
      const idx = colIndex[key];
      return idx === undefined ? '' : (rec[idx] ?? '');
    };

    const term = sanitize(get('term'), CAPS.term);
    const meaningKr = sanitize(get('meaningKr'), CAPS.meaningKr);
    if (!term || !meaningKr) { skipped++; continue; }

    const tagsRaw = sanitize(get('tags'), 1000);
    const tags = tagsRaw
      ? tagsRaw.split(TAG_DELIM).map((tg) => tg.trim().slice(0, TAG_CAP)).filter(Boolean)
      : [];

    rows.push({
      term,
      meaningKr,
      phonetic: sanitize(get('phonetic'), CAPS.phonetic),
      pos: sanitize(get('pos'), CAPS.pos),
      definition: sanitize(get('definition'), CAPS.definition),
      exampleEn: sanitize(get('exampleEn'), CAPS.exampleEn),
      exampleKr: sanitize(get('exampleKr'), CAPS.exampleKr),
      tags,
    });
  }

  if (rows.length === 0) throw new CsvParseError('noValidRows');
  return { rows, skipped };
}
