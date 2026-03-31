import { Word } from '@/lib/types';

export interface ParsedWord extends Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> {
    id: string; // Temporary ID for list keying
    term: string;
    meaningKr: string;
    definition: string;
    exampleEn: string;
    exampleKr: string;
    tags: string[];
    isValid: boolean;
}

/**
 * Parses a raw string (either Tab-separated or Comma-separated) into an array of ParsedWord.
 * Expects the following order:
 * 0: term (required)
 * 1: meaningKr (required)
 * 2: definition (optional)
 * 3: exampleEn (optional)
 * 4: exampleKr (optional)
 * 5: tags (optional, comma-separated)
 */
export function parseImportedText(text: string): ParsedWord[] {
    if (!text || !text.trim()) return [];

    // Determine delimiter: if there's a tab, assume it's Excel paste (TSV), else CSV
    const isTsv = text.includes('\t');
    const delimiter = isTsv ? '\t' : ',';

    // Split into lines, removing empty lines
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

    const HEADER_KEYWORDS = ['단어', 'word', 'term', 'vocab', '어휘', '영단어', 'english', '뜻', 'meaning'];

    const parsedWords: ParsedWord[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Simple split for TSV.
        // For CSV, a simple split by comma might break if values contain commas.
        // However, for MVP and copy/paste from simple spreadsheets, plain split works.
        // If robust CSV parsing is needed, consider regex or a library like 'papaparse'.
        let columns: string[] = [];
        if (isTsv) {
            columns = line.split(delimiter);
        } else {
            // Basic naive CSV split handling quotes somewhat (Not a full parser, but better than strict split)
            const rowRegex = /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g;
            const matches = line.match(rowRegex);
            columns = matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : line.split(',').map(s => s.trim());
        }

        // 첫 행이 헤더인 경우 자동 스킵
        if (i === 0 && HEADER_KEYWORDS.includes(columns[0]?.trim().toLowerCase() || '')) {
            continue;
        }

        // Map columns
        const term = columns[0]?.trim() || '';
        const meaningKr = columns[1]?.trim() || '';
        const definition = columns[2]?.trim() || '';
        const exampleEn = columns[3]?.trim() || '';
        const exampleKr = columns[4]?.trim() || '';

        const tagString = columns[5]?.trim() || '';
        const tags = tagString ? tagString.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

        parsedWords.push({
            id: `temp-${Date.now()}-${i}`,
            term,
            meaningKr,
            definition,
            exampleEn,
            exampleKr,
            tags,
            isStarred: false,
            isValid: term.length > 0 && meaningKr.length > 0, // Mark row as invalid if term or meaning is missing
        });
    }

    return parsedWords;
}
