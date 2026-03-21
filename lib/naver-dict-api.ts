import { fetch } from 'expo/fetch';
import { AutoFillResult } from './types';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:5000';

export async function searchNaverDict(term: string): Promise<AutoFillResult | null> {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed) return null;

    const tryFetch = async (url: string, isProxy = false) => {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://en.dict.naver.com/',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Alldict-Locale': 'ko'
        };

        const res = await fetch(url, isProxy ? undefined : { headers });
        if (!res.ok) {
            console.warn(`Fetch failed (${isProxy ? 'proxy' : 'direct'}): ${res.status}`);
            return null;
        }

        try {
            return await res.json();
        } catch (e) {
            const text = await res.text().catch(() => 'No body');
            console.error(`JSON parse error (${isProxy ? 'proxy' : 'direct'}):`, e, 'Body snippet:', text.substring(0, 100));
            throw e;
        }
    };

    try {
        let data = null;

        // 1. Try Proxy first (More reliable for CSRF/Headers)
        try {
            data = await tryFetch(`${API_BASE}/api/dict/naver?query=${encodeURIComponent(trimmed)}`, true);
        } catch (e) {
            console.warn("Proxy fetch failed, falling back to direct...");
        }

        // 2. Try Direct if proxy failed or returned null
        if (!data) {
            const directUrl = `https://en.dict.naver.com/api3/enko/search?query=${encodeURIComponent(trimmed)}&m=pc&lang=ko`;
            data = await tryFetch(directUrl, false);
        }

        if (!data) return null;

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

        // POS Extraction Improvement
        let pos = entry.partOfSpeech || entry.posName || "";

        // If top-level POS is missing, check meansCollector groups
        if (!pos && entry.meansCollector) {
            const posList = entry.meansCollector
                .map((m: any) => m.partOfSpeech || m.partOfSpeech2 || m.partOfSpeechCode || m.posName)
                .filter((p: any) => p);
            if (posList.length > 0) {
                // Join unique POS values if multiple exist
                pos = Array.from(new Set(posList)).join(', ');
            }
        }

        return {
            meaningKr: cleanValue(meaningKr),
            definition: "", // Default to empty string as requested by the user
            phonetic,
            pos: cleanValue(pos),
            exampleEn: cleanValue(exampleEn),
            exampleKr: cleanValue(exampleKr),
        };
    } catch (error) {
        console.error('Naver Dictionary search final failure:', error);
        return null;
    }
}
