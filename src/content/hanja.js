// hanja.js

// === 일본 신자체→한국 정자체 매핑 로딩 ===
let jpSimpToKrTradDict = null;
export async function loadJpSimpToKrTradDict() {
    if (jpSimpToKrTradDict) return jpSimpToKrTradDict;
    const resp = await fetch(chrome.runtime.getURL('data/jp_simp_to_kr_trad.json'));
    jpSimpToKrTradDict = await resp.json();
    return jpSimpToKrTradDict;
}

// === 한자 사전 로딩 ===
let hanjaDict = null;
export async function loadHanjaDict() {
    if (hanjaDict) return hanjaDict;
    const resp = await fetch(chrome.runtime.getURL('data/hanja.json'));
    hanjaDict = await resp.json();
    // 일본 신자체→한국 정자체 매핑도 미리 로딩
    await loadJpSimpToKrTradDict();
    return hanjaDict;
}

// === 한자 정보 조회 (일본 신자체→한국 정자체 변환 지원) ===
export async function getHanjaInfo(char) {
    await loadHanjaDict();
    await loadJpSimpToKrTradDict();
    
    if (hanjaDict[char]) return hanjaDict[char];
    if (jpSimpToKrTradDict && jpSimpToKrTradDict[char] && hanjaDict[jpSimpToKrTradDict[char]]) {
        return hanjaDict[jpSimpToKrTradDict[char]];
    }
    return null;
}
