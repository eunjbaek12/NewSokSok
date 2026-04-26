import { fetch } from 'expo/fetch';
import { AutoFillResult } from './types';
import { getNaverDictCode } from '@/constants/languages';

const NAVER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://en.dict.naver.com/',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Alldict-Locale': 'ko',
};

function subdomainForDictCode(code: string): string {
    if (code.startsWith('ja') || code === 'koja') return 'ja';
    if (code.startsWith('zh') || code === 'kozh') return 'zh';
    if (code.startsWith('ko')) return 'korean';
    return 'en';
}

export async function searchNaverDict(term: string, sourceLang: string = 'en', targetLang: string = 'ko'): Promise<AutoFillResult | null> {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed) return null;

    const dictCode = getNaverDictCode(sourceLang, targetLang);
    if (!dictCode) return null;

    const subdomain = subdomainForDictCode(dictCode);
    const url = `https://${subdomain}.dict.naver.com/api3/${dictCode}/search?query=${encodeURIComponent(trimmed)}&m=pc&lang=ko`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
        const res = await fetch(url, {
            headers: NAVER_HEADERS,
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) return null;

        const data = await res.json();

        const items = data?.searchResultMap?.searchResultListMap?.WORD?.items;
        if (!items || items.length === 0) return null;

        const entry = items[0];
        const meansCollector = entry.meansCollector;
        if (!meansCollector || meansCollector.length === 0) return null;

        let meaningKr = '';
        let exampleEn = '';
        let exampleKr = '';

        for (const group of meansCollector) {
            if (group.means && group.means.length > 0) {
                if (!meaningKr) meaningKr = group.means[0].value;
                if (!exampleEn && group.means[0].exampleOri) {
                    exampleEn = group.means[0].exampleOri;
                    exampleKr = group.means[0].exampleTrans || '';
                }
            }
            if (meaningKr && exampleEn) break;
        }

        const cleanValue = (val: string) => val ? val.replace(/<\/?[^>]+(>|$)/g, "") : "";

        let phonetic = cleanValue(entry.phoneticSymbol || "");
        if (!phonetic && entry.searchPhoneticSymbolList && entry.searchPhoneticSymbolList.length > 0) {
            const usSymbol = entry.searchPhoneticSymbolList.find((s: any) => s.symbolTypeCode === 'US' && s.symbolValue);
            if (usSymbol) {
                phonetic = cleanValue(usSymbol.symbolValue);
            } else {
                const firstAvailable = entry.searchPhoneticSymbolList.find((s: any) => s.symbolValue);
                if (firstAvailable) {
                    phonetic = cleanValue(firstAvailable.symbolValue);
                }
            }
        }

        let pos = entry.partOfSpeech || entry.posName || "";
        if (!pos && entry.meansCollector) {
            const posList = entry.meansCollector
                .map((m: any) => m.partOfSpeech || m.partOfSpeech2 || m.partOfSpeechCode || m.posName)
                .filter((p: any) => p);
            if (posList.length > 0) {
                pos = Array.from(new Set(posList)).join(', ');
            }
        }

        return {
            meaningKr: cleanValue(meaningKr),
            definition: "",
            phonetic,
            pos: cleanValue(pos),
            exampleEn: cleanValue(exampleEn),
            exampleKr: cleanValue(exampleKr),
        };
    } catch {
        clearTimeout(timer);
        return null;
    }
}

export async function fetchNaverAutocomplete(term: string, sourceLang: string, targetLang: string): Promise<string[]> {
    const dictCode = getNaverDictCode(sourceLang, targetLang);
    if (!dictCode) return [];
    const trimmed = term.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const url = `https://ac.dict.naver.com/${dictCode}/ac?q=${encodeURIComponent(trimmed)}&q_enc=UTF-8&st=11&r_enc=UTF-8&r_format=json&t_korlex=1`;

    try {
        const res = await fetch(url, { headers: NAVER_HEADERS });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data?.items;
        if (!Array.isArray(items)) return [];
        return items.slice(0, 7).map((item: any) => Array.isArray(item) ? item[0] : item).filter(Boolean);
    } catch {
        return [];
    }
}

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
