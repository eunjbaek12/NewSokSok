import fs from 'fs';

const data = JSON.parse(fs.readFileSync('naver_test.json', 'utf8'));
const items = data?.searchResultMap?.searchResultListMap?.WORD?.items;
const entry = items[0];
const meansCollector = entry.meansCollector;

let pos = entry.partOfSpeech || entry.posName || "";
if (!pos && entry.meansCollector) {
    const posList = entry.meansCollector
        .map((m) => m.partOfSpeech || m.posName)
        .filter((p) => p);
    if (posList.length > 0) {
        pos = Array.from(new Set(posList)).join(', ');
    }
}
const cleanValue = (val) => val ? val.replace(/<\/?[^>]+(>|$)/g, "") : "";
console.log('Final POS:', cleanValue(pos));
