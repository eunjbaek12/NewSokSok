import { searchNaverDict } from './lib/naver-dict-api';

async function run() {
    const result = await searchNaverDict('test');
    console.log(result);
}
run();
