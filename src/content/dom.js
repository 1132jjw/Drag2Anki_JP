// dom.js

import { getSelectedTextWithoutRuby, isJapaneseTextOnly, removeJapaneseParens } from './utils';
import { showPopup, hidePopup } from './popup';
import { popup } from './popup';

export function handleTextSelection(event) {
    // 팝업이 열려있으면 무시
    if (popup && popup.contains(event.target)) return;

    setTimeout(() => {
        const selectedText = getSelectedTextWithoutRuby();

        if (selectedText && isJapaneseTextOnly(selectedText)) {
            const normalizedText = removeJapaneseParens(selectedText);
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            // 팝업에는 원본, 내부처리에는 정규화된 텍스트 전달
            showPopup(selectedText, rect, normalizedText);
        } else {
            hidePopup();
        }
    }, 20);
}


export function handleKeyDown(event) {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        toggleExtension();
    }

    if (event.key === 'Escape') {
        hidePopup();
    }
}

export function handleDocumentClick(event) {
    if (popup && !popup.contains(event.target)) {
        hidePopup();
    }
}

export function injectStyles() {
    if (document.getElementById('drag2anki-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'drag2anki-styles';
    style.textContent = `
        /* 기본 스타일은 content.css에서 로드됩니다 */
    `;
    document.head.appendChild(style);
}

export function toggleExtension() {
    // 확장 프로그램 활성화/비활성화 토글
    console.log('Drag2Anki_JP 토글');
}
