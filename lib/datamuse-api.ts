import { fetch } from 'expo/fetch';

// Datamuse API — 영어 자동완성 (오픈 데이터, attribution 권장)
// https://www.datamuse.com/api/
export async function fetchDatamuseAutocomplete(term: string): Promise<string[]> {
    const trimmed = term.trim().toLowerCase();
    if (trimmed.length < 2) return [];
    try {
        const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(trimmed)}*&max=7`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((item: any) => item.word).filter(Boolean);
    } catch {
        return [];
    }
}
