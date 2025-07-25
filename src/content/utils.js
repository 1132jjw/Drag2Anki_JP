// utils.js

export function isKanaOnly(text) {
    const kanaRegex = /^[\u3040-\u309F\u30A0-\u30FF]+$/;
    return kanaRegex.test(text);}

export function isJapaneseTextOnly(text) {
    // 일본어 문자, 괄호, 괄호 안의 일본어 허용
    const japaneseWithParensRegex = /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\(\)]+$/;
    return japaneseWithParensRegex.test(text);
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
