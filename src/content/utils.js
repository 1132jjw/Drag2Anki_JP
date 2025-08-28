// utils.js
import kuromoji from 'kuromoji';

export function isKanaOnly(text) {
    const kanaRegex = /^[\u3040-\u309F\u30A0-\u30FF]+$/;
    return kanaRegex.test(text);}

export function isJapaneseTextOnly(text) {
    // 허용 문자 집합: 일본어 문자(히라가나, 가타카나, 한자) + 일본어 구두점/기호 + 일부 영문/숫자
    // const allowedCharsRegex = /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\u2010-\u2027\u203B\u2190-\u21FFA-Za-z0-9]+$/;
    
    // 한국어(가-힣, ㄱ-ㅎ, ㅏ-ㅣ)가 포함되면 false
    const hasKoreanRegex = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
    // 최소 한 글자 이상의 일본어(히라가나/가타카나/한자)가 포함되어야 함
    const hasJapaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
    return hasJapaneseRegex.test(text) && !hasKoreanRegex.test(text);
}

export function removeJapaneseParens(text) {
    // 예: 生(ま)れる → 生まれる
    return text.replace(/[\(\)]/g, ''); // 괄호만 제거
    // 또는, 괄호와 그 안의 문자까지 제거하려면: text.replace(/\([^\)]*\)/g, '')
}

export function safeValue(data) {
    if (data && data.status === 'fulfilled' && data.value && !data.value.error) {
        return data.value;
    }
    return null;
}

export function getSelectedTextWithoutRuby() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return '';
    
    const range = selection.getRangeAt(0);
    const container = range.cloneContents();
    
    // 임시 div에 붙여서 <rt>, <rp> 태그 및 후리가나 class 제거
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(container);
    
    // 모든 <rt> 태그 제거 (후리가나 텍스트)
    tempDiv.querySelectorAll('rt').forEach(rt => rt.remove());
    // 모든 <rp> 태그 제거 (후리가나 괄호)
    tempDiv.querySelectorAll('rp').forEach(rp => rp.remove());
    // furigana, pronunciation 등 후리가나 class를 가진 span 제거
    tempDiv.querySelectorAll('.furigana, .pronunciation, .reading, .yomi').forEach(el => el.remove());
    
    // 텍스트만 추출
    return tempDiv.textContent.trim();
}

export function tokenize(text) {
    return new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath: chrome.runtime.getURL('dict') })
            .build(function (err, tokenizer) {
                if (err) {
                    console.error("분석기 생성 실패:", err);
                    reject(err);
                    return;
                }
                const tokens = tokenizer.tokenize(text);
                resolve(tokens);
            });
    });
}

export function isSingleWord(tokens) {
    if (!tokens || tokens.length === 0) {
        return false;
    }

    // 토큰이 1개 일때는 무조건 DB에 저장
    if (tokens.length === 1) {
        return true;
    }

    const independentPos = ['名詞', '動詞', '形容詞', '副詞', '連体詞', '接続詞', '感動詞', '形状詞'];
    
    // 1. 자립어의 개수를 센다.
    const independentWordCount = tokens.filter(token => independentPos.includes(token.pos)).length;

    // 2. 자립어가 정확히 1개일 때만 '의미 단위'일 가능성이 있다.
    return independentWordCount === 1;
}
