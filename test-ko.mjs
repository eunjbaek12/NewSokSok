import fs from 'fs';
import https from 'https';

const url = 'https://en.dict.naver.com/api3/enko/search?query=' + encodeURIComponent('사과') + '&m=pc&lang=ko';
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://en.dict.naver.com/' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const dataObj = JSON.parse(data);
        const items = dataObj?.searchResultMap?.searchResultListMap?.WORD?.items;
        if (items && items.length > 0) {
            fs.writeFileSync('korean_test.json', JSON.stringify(items[0], null, 2));
            console.log("Saved korean_test.json");
        } else {
            console.log("No items found");
        }
    });
});
