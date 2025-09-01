// dom.js

import { getSelectedTextWithoutRuby, isJapaneseTextOnly, isEnglishTextOnly, removeJapaneseParens } from './utils';
import { showPopup, hidePopup } from './popup';
import { popup } from './popup';

export function handleTextSelection(arg) {
    // 팝업이 열려있으면 무시
    if (popup && popup.contains(arg?.target)) return;

    // 구글 검색창에서 텍스트 추출
    if (typeof arg === 'string') {
        const text = arg.trim();
        const searchBox = document.querySelector('textarea[name="q"], input[name="q"]');
        if (text && (isJapaneseTextOnly(text) || isEnglishTextOnly(text))) {
            // 1000자 제한 적용
            const limitedText = text.length > 1000 ? text.substring(0, 1000) : text;
            const normalizedText = isJapaneseTextOnly(limitedText) ? removeJapaneseParens(limitedText) : limitedText;
            const rect = searchBox.getBoundingClientRect();
            showPopup(limitedText, rect, normalizedText, text.length);
        } else {
            hidePopup();
        }
        return;
    }

    // 드랙그해서 텍스트 추출
    setTimeout(() => {
        const selectedText = getSelectedTextWithoutRuby();

        if (selectedText && (isJapaneseTextOnly(selectedText) || isEnglishTextOnly(selectedText))) {
            // 1000자 제한 적용
            const limitedText = selectedText.length > 1000 ? selectedText.substring(0, 1000) : selectedText;
            const normalizedText = isJapaneseTextOnly(limitedText) ? removeJapaneseParens(limitedText) : limitedText;
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            // 팝업에는 제한된 텍스트, 내부처리에는 정규화된 텍스트 전달
            showPopup(limitedText, rect, normalizedText, selectedText.length);
        } else {
            hidePopup();
        }
    }, 20);
}


export function handleKeyDown(event) {
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