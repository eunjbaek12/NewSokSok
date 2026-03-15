const fs = require('fs');
const file = 'constants/curationData.ts';
const content = fs.readFileSync(file, 'utf8');

const startIndex = content.indexOf(' = [') + 3;
const endIndex = content.lastIndexOf(']') + 1;
const jsonStr = content.substring(startIndex, endIndex);

try {
    let data = JSON.parse(jsonStr);
    data = data.map(t => {
        t.words = t.words.filter(w => w.term);
        return t;
    }).filter(t => t.words.length > 0);
    const newContent = "import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = " + JSON.stringify(data, null, 2) + ";\n";
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Fixed curation data successfully.');
} catch (e) {
    console.error('Failed to parse json', e.message);
}
