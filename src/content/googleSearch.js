// src/content/googleSearch.js

import { handleTextSelection } from './dom.js';

// 검색창 변화 감지 및 번역 함수
export function startSearchBoxMonitor() {
    let prevValue = '';
    setInterval(() => {
        const searchBox = document.querySelector('textarea[name="q"], input[name="q"]');
        if (!searchBox) return;
        const currentValue = searchBox.value.trim();
        if (currentValue !== prevValue) {
            prevValue = currentValue;
            handleTextSelection(currentValue);
        }
    }, 1000);
}
