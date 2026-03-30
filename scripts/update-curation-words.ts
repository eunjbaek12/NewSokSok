/**
 * 기존 큐레이션 테마의 단어를 100개로 늘리고,
 * phonetic(발음기호)과 pos(품사)를 추가합니다.
 *
 * 실행: npx ts-node -e "require('dotenv').config(); require('./scripts/update-curation-words.ts')"
 * 또는: npx tsx scripts/update-curation-words.ts
 */

import fs from 'fs';
import path from 'path';

// .env에서 API 키 로드
const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/);
  if (match) GEMINI_API_KEY = match[1].trim();
}

if (!GEMINI_API_KEY) {
  console.error('❌ EXPO_PUBLIC_GEMINI_API_KEY가 .env에 없습니다.');
  process.exit(1);
}

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ThemeMeta {
  id: string;
  title: string;
  icon: string;
  isCurated: boolean;
  category?: string;
  level?: string;
  description?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  isVisible: boolean;
  createdAt: number;
}

interface WordData {
  id: string;
  term: string;
  definition: string;
  phonetic: string;
  pos: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr: string;
  isMemorized: boolean;
  isStarred: boolean;
  tags: string[];
}

async function generateWords(theme: ThemeMeta, retryCount = 0): Promise<WordData[]> {
  const prompt = `Generate exactly 100 unique English vocabulary words for the theme: "${theme.title}".
Theme description: ${theme.description ?? theme.title}
Level: ${theme.level ?? 'intermediate'}

Return ONLY a JSON array (no markdown, no explanation) with this exact structure:
[
  {
    "term": "word or phrase",
    "definition": "clear English definition",
    "phonetic": "IPA phonetic notation e.g. /ˈwɜːrd/",
    "pos": "part of speech: noun | verb | adjective | adverb | phrase | idiom",
    "meaningKr": "Korean translation",
    "exampleEn": "example sentence in English",
    "exampleKr": "example sentence in Korean"
  }
]

Rules:
- Exactly 100 words, no duplicates
- All words must be relevant to the theme
- phonetic must use IPA notation
- pos must be one of: noun, verb, adjective, adverb, phrase, idiom
- Return ONLY the JSON array`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429 && retryCount < 4) {
        const waitTime = (retryCount + 1) * 30000;
        console.log(`  ⏳ Rate limit, ${waitTime / 1000}초 대기...`);
        await sleep(waitTime);
        return generateWords(theme, retryCount + 1);
      }
      throw new Error(`API 오류 (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('API 응답 비어있음');

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const words: any[] = JSON.parse(cleaned);

    if (!Array.isArray(words)) throw new Error('배열이 아님');

    return words.slice(0, 100).map((w: any, j: number): WordData => ({
      id: `${theme.id}-word-${j}`,
      term: w.term ?? '',
      definition: w.definition ?? '',
      phonetic: w.phonetic ?? '',
      pos: w.pos ?? '',
      meaningKr: w.meaningKr ?? '',
      exampleEn: w.exampleEn ?? '',
      exampleKr: w.exampleKr ?? '',
      isMemorized: false,
      isStarred: false,
      tags: [],
    }));
  } catch (e: any) {
    if (retryCount < 2) {
      console.log(`  ⚠️ 오류: ${e.message}, 재시도...`);
      await sleep(5000);
      return generateWords(theme, retryCount + 1);
    }
    throw e;
  }
}

// 진행 상황 저장용 파일
const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/.update-progress.json');

function loadProgress(): Record<string, WordData[]> {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {};
}

function saveProgress(progress: Record<string, WordData[]>) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveResult(themes: (ThemeMeta & { words: WordData[] })[]) {
  const fileContent = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(themes, null, 2)};\n`;
  const destPath = path.resolve(process.cwd(), 'constants/curationData.ts');
  fs.writeFileSync(destPath, fileContent, 'utf8');
  console.log(`\n✅ constants/curationData.ts 저장 완료`);
}

async function main() {
  // 기존 curationData.ts에서 테마 메타 읽기
  const content = fs.readFileSync(
    path.resolve(process.cwd(), 'constants/curationData.ts'),
    'utf8'
  );
  const arrayMatch = content.match(/export const curationPresets[^=]*=\s*(\[[\s\S]*\]);/);
  if (!arrayMatch) {
    console.error('❌ curationData.ts 파싱 실패');
    process.exit(1);
  }

  const existing: any[] = eval(arrayMatch[1]);
  const themes: ThemeMeta[] = existing.map(t => ({
    id: t.id,
    title: t.title,
    icon: t.icon,
    isCurated: true,
    category: t.category,
    level: t.level,
    description: t.description,
    sourceLanguage: t.sourceLanguage ?? 'en',
    targetLanguage: t.targetLanguage ?? 'ko',
    isVisible: true,
    createdAt: t.createdAt,
  }));

  console.log(`📚 총 ${themes.length}개 테마 처리 시작\n`);

  // 이미 처리된 테마 로드
  const progress = loadProgress();
  const results: (ThemeMeta & { words: WordData[] })[] = [];

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    console.log(`[${i + 1}/${themes.length}] ${theme.title}`);

    if (progress[theme.id]) {
      console.log(`  ✓ 이미 처리됨 (${progress[theme.id].length}개 단어)`);
      results.push({ ...theme, words: progress[theme.id] });
      continue;
    }

    try {
      const words = await generateWords(theme);
      console.log(`  ✅ ${words.length}개 단어 생성`);
      progress[theme.id] = words;
      saveProgress(progress);
      results.push({ ...theme, words });

      // 중간 저장 (매 5개 테마마다)
      if ((i + 1) % 5 === 0) {
        saveResult(results);
        console.log(`  💾 중간 저장 완료`);
      }

      // API 레이트 리밋 방지 (테마 간 7초 대기)
      if (i < themes.length - 1) {
        await sleep(7000);
      }
    } catch (e: any) {
      console.error(`  ❌ 실패: ${e.message}`);
      // 실패한 테마는 기존 단어 유지
      const fallback = existing[i].words;
      results.push({ ...theme, words: fallback });
      progress[theme.id] = fallback;
      saveProgress(progress);
    }
  }

  saveResult(results);

  // 진행 파일 정리
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }

  console.log('\n🎉 완료!');
  console.log(`총 ${results.length}개 테마, 평균 ${Math.round(results.reduce((s, t) => s + t.words.length, 0) / results.length)}개 단어`);
}

main().catch(console.error);
