import fs from 'fs';
import https from 'https';
const url = 'https://en.dict.naver.com/api3/enko/search?query=test&m=pc&lang=ko';
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://en.dict.naver.com/' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => fs.writeFileSync('naver_test.json', JSON.stringify(JSON.parse(data), null, 2)));
});
