// popup.js

import { loadWordInfo } from './api';
import { saveToAnki, saveKanjiToAnki } from './anki';
import contentCss from '../../content.css';

export let popup = null;

export function showPopup(displayText, rect, normalizedText) {
    hidePopup();

    const container = createPopup(displayText, rect);
    popup = container; // popup 변수가 container를 참조하도록 변경
    document.body.appendChild(container);
    
    // 팝업 위치 조정
    adjustPopupPosition(container, rect);
    
    // 단어 정보 로드 시 normalizedText 사용
    loadWordInfo(normalizedText);
}

export function hidePopup() {
    if (popup) {
        popup.remove();
        popup = null;
    }
}

export function createPopup(text, rect) {
    const container = document.createElement('div');
    container.id = 'drag2anki-jp-container';
    const shadowRoot = container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = contentCss.default ? contentCss.default : contentCss;
    shadowRoot.appendChild(style);

    const popup = document.createElement('div');
    popup.className = 'drag2anki-popup';

    popup.innerHTML = `
        <div class="popup-header">
            <span class="word-text">${text}</span>
            <button class="close-btn">&times;</button>
        </div>
        <div class="popup-content">
            <div class="loading">정보를 불러오는 중...</div>
            <div class="tabs">
                <button class="tab-btn active" data-tab="meaning">뜻</button>
                <button class="tab-btn" data-tab="kanji">한자</button>
            </div>
            <div class="tab-content">
                <div id="meaning-tab" class="tab-panel active">
                    <div class="reading"></div>
                    <div class="meaning"></div>
                </div>
                <div id="kanji-tab" class="tab-panel">
                    <div class="kanji-info"></div>
                </div>
            </div>
        </div>
        <div class="popup-footer">
            <button class="save-btn">Anki에 저장 [단어]</button>
        </div>
    `;

    // 이벤트 리스너 추가
    popup.querySelector('.close-btn').addEventListener('click', hidePopup);
    popup.querySelector('.save-btn').addEventListener('click', () => {
        // 저장 시점에 최신 덱 설정을 가져와서 전달
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            const deckName = result.drag2anki_settings?.deckName || 'Japanese'; // 기본값
            saveToAnki(text, deckName);
        });
    });

    // 탭 이벤트
    popup.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    shadowRoot.appendChild(popup);

    return container;
}

export function adjustPopupPosition(container, rect) {
    const popup = container.shadowRoot.querySelector('.drag2anki-popup');
    if (!popup) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupRect = popup.getBoundingClientRect();

    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 10;

    // 오른쪽 경계 체크
    if (left + popupRect.width > viewportWidth) {
        left = viewportWidth - popupRect.width - 10;
    }

    // 아래쪽 경계 체크
    if (top + popupRect.height > viewportHeight + window.scrollY) {
        top = rect.top + window.scrollY - popupRect.height - 10;
    }

    popup.style.left = Math.max(0, left) + 'px';
    popup.style.top = Math.max(0, top) + 'px';
}

export function displayWordInfo(wordInfo) {
    if (!popup || !popup.shadowRoot) return;
    const shadowRoot = popup.shadowRoot;
    const loadingEl = shadowRoot.querySelector('.loading');
    const tabsEl = shadowRoot.querySelector('.tabs');
    const meaningTab = shadowRoot.querySelector('#meaning-tab');
    const kanjiTab = shadowRoot.querySelector('#kanji-tab');

    loadingEl.style.display = 'none';
    tabsEl.style.display = 'flex';

    // 뜻 탭 내용
    let readingHtml = '<div class="reading-text">정보가 없습니다.</div>';
    let meaningHtml = '<div class="meaning-text">정보가 없습니다.</div>';

    // LLM에서 받아온 후리가나 사용
    if (wordInfo.llmMeaning && wordInfo.llmMeaning.reading) {
        readingHtml = `<div class="reading-text">${wordInfo.llmMeaning.reading}</div>`;
    } else if (wordInfo.jisho && wordInfo.jisho.japanese[0].reading) {
        // LLM에서 후리가나를 받지 못한 경우 Jisho API 사용 (fallback)
        readingHtml = `<div class="reading-text">${wordInfo.jisho.japanese[0].reading}</div>`;
    }

    // LLM에서 받아온 뜻 사용
    if (wordInfo.llmMeaning && wordInfo.llmMeaning.meaning) {
        meaningHtml = `<div class="meaning-text">${wordInfo.llmMeaning.meaning.replace(/\n/g, '<br>')}</div>`;
    } else if (wordInfo.jisho) {
        // LLM에서 뜻을 받지 못한 경우 Jisho API 사용 (fallback)
        const meanings = wordInfo.jisho.senses[0].english_definitions;
    }

    meaningTab.querySelector('.reading').innerHTML = readingHtml;
    meaningTab.querySelector('.meaning').innerHTML = meaningHtml;

    // 한자 탭 내용
    let kanjiHtml = '';
    if (wordInfo.kanji && wordInfo.kanji.length > 0) {
        wordInfo.kanji.forEach((kanji, idx) => {
            kanjiHtml += `
                <div class="kanji-item" data-kanji-idx="${idx}">
                    <div class="kanji-char">${kanji.kanji}</div>
                    <div class="kanji-details">
                        <div class="kanji-meanings">${kanji.korean?.meaning || ''} ${kanji.korean?.reading || ''}</div>
                        <div class="kanji-readings">
                            <span>음독: ${(kanji.on_readings||[]).join(', ')}</span>
                            <span>훈독: ${(kanji.kun_readings||[]).join(', ')}</span>
                            <span>JLPT: ${kanji.jlpt || ''}</span>
                        </div>
                        <button class="kanji-save-btn" data-kanji-idx="${idx}">Anki에 저장 [한자]</button>
                    </div>
                </div>
            `;
        });
    } else {
        kanjiHtml = '<div class="no-kanji">한자 정보가 없습니다.</div>';
    }

    shadowRoot.querySelector('#kanji-tab .kanji-info').innerHTML = kanjiHtml;
    // 한자 저장 버튼 이벤트 위임 (뜻 탭용) 제거
    // 한자 탭용 기존 이벤트 위임 유지
    const kanjiInfoEl = shadowRoot.querySelector('#kanji-tab .kanji-info');
    if (kanjiInfoEl) {
        kanjiInfoEl.addEventListener('click', async function(e) {
            const btn = e.target.closest('.kanji-save-btn');
            if (btn) {
                const idx = btn.getAttribute('data-kanji-idx');
                if (wordInfo.kanji && wordInfo.kanji[idx]) {
                    // 저장 시점에 최신 덱 설정을 가져와서 전달
                    chrome.storage.sync.get(['drag2anki_settings'], (result) => {
                        const deckName = result.drag2anki_settings?.deckName || 'Japanese'; // 기본값
                        saveKanjiToAnki(wordInfo.kanji[idx], btn, deckName);
                    });
                }
            }
        });
    }
}

export function displayError(message) {
    if (!popup || !popup.shadowRoot) return;
    const shadowRoot = popup.shadowRoot;
    const loadingEl = shadowRoot.querySelector('.loading');
    if (loadingEl) {
        loadingEl.innerHTML = `<div class="error">${message}</div>`;
    }
}

export function switchTab(tabName) {
    if (!popup || !popup.shadowRoot) return;
    const shadowRoot = popup.shadowRoot;
    shadowRoot.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    shadowRoot.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

    shadowRoot.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    shadowRoot.querySelector(`#${tabName}-tab`).classList.add('active');
}
