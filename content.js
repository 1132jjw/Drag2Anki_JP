
// Drag2Anki_JP Content Script
(function() {
    'use strict';

    // 전역 변수
    let popup = null;
    let settings = {
        openaiApiKey: '',
        ankiConnectUrl: 'http://localhost:8765',
        deckName: 'Japanese',
        noteType: 'Basic',
        fieldMapping: {
            word: 'Front',
            meaning: 'Back',
            reading: 'Reading',
            kanji: 'Kanji'
        },
        darkMode: false,
        fontSize: 14,
        cacheEnabled: true,
        shortcut: 'Ctrl+Shift+D'
    };

    // 캐시 시스템
    const cache = new Map();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

    // 초기화
    init();

    function init() {
        loadSettings();
        setupEventListeners();
        injectStyles();
    }

    function loadSettings() {
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            if (result.drag2anki_settings) {
                settings = { ...settings, ...result.drag2anki_settings };
            }
        });
    }

    function setupEventListeners() {
        // 텍스트 선택 이벤트
        document.addEventListener('mouseup', handleTextSelection);

        // 키보드 이벤트
        document.addEventListener('keydown', handleKeyDown);

        // 클릭 이벤트 (팝업 외부 클릭 시 닫기)
        document.addEventListener('click', handleDocumentClick);
    }

function handleTextSelection(event) {
    // 팝업이 열려있으면 무시
    if (popup && popup.contains(event.target)) return;

    setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && isJapaneseText(selectedText)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            showPopup(selectedText, rect);
        } else {
            hidePopup();
        }
    }, 20); // 10~30ms 정도면 충분
}


    function handleKeyDown(event) {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
            event.preventDefault();
            toggleExtension();
        }

        if (event.key === 'Escape') {
            hidePopup();
        }
    }

    function handleDocumentClick(event) {
        if (popup && !popup.contains(event.target)) {
            hidePopup();
        }
    }

    function isJapaneseText(text) {
        const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
        return japaneseRegex.test(text);
    }

    function showPopup(text, rect) {
        hidePopup();

        popup = createPopup(text, rect);
        document.body.appendChild(popup);

        // 팝업 위치 조정
        adjustPopupPosition(popup, rect);

        // 단어 정보 로드
        loadWordInfo(text);
    }

    function createPopup(text, rect) {
        const popup = document.createElement('div');
        popup.id = 'drag2anki-popup';
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
                <button class="save-btn">Anki에 저장</button>
            </div>
        `;

        // 이벤트 리스너 추가
        popup.querySelector('.close-btn').addEventListener('click', hidePopup);
        popup.querySelector('.save-btn').addEventListener('click', () => saveToAnki(text));

        // 탭 이벤트
        popup.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
        });

        return popup;
    }

    function adjustPopupPosition(popup, rect) {
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

    async function loadWordInfo(text) {
        try {
            const cacheKey = text;
            let wordInfo = null;

            // 캐시 확인
            if (settings.cacheEnabled && cache.has(cacheKey)) {
                const cached = cache.get(cacheKey);
                if (Date.now() - cached.timestamp < CACHE_DURATION) {
                    wordInfo = cached.data;
                }
            }

            if (!wordInfo) {
                // API 요청
                const [jishoData, translationData, kanjiData] = await Promise.allSettled([
                    fetchJishoData(text),
                    fetchTranslation(text),
                    fetchKanjiData(text)
                ]);

                wordInfo = {
                    jisho: safeValue(jishoData),
                    translation: safeValue(translationData),
                    kanji: safeValue(kanjiData)
                };
                console.log('단어 정보:', wordInfo);

                // 캐시 저장
                if (settings.cacheEnabled) {
                    cache.set(cacheKey, {
                        data: wordInfo,
                        timestamp: Date.now()
                    });
                }
            }

            displayWordInfo(wordInfo);

        } catch (error) {
            console.error('단어 정보 로드 오류:', error);
            displayError('정보를 불러오는 중 오류가 발생했습니다.');
        }
    }

    async function fetchJishoData(text) {
        const response = await fetch(`https://drag2ankijpproxy-production.up.railway.app/jisho?word=${encodeURIComponent(text)}`);
        const data = await response.json();
        return data.data[0] || null;
    }

    async function fetchTranslation(text) {
        if (!settings.openaiApiKey) {
            return null;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: '일본어 단어를 한국어로 번역해주세요. 간단하고 명확한 뜻만 답변해주세요.'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 100
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async function fetchKanjiData(text) {
        const kanjiList = text.match(/[\u4E00-\u9FAF]/g) || [];
        const kanjiData = [];

        for (const kanji of kanjiList) {
            try {
                const response = await fetch(`https://kanjiapi.dev/v1/kanji/${kanji}`);
                const data = await response.json();
                kanjiData.push(data);
            } catch (error) {
                console.error(`한자 정보 로드 오류 (${kanji}):`, error);
            }
        }

        return kanjiData;
    }

    function safeValue(data) {
        if (data && data.status === 'fulfilled' && data.value && !data.value.error) {
            return data.value;
        }
        return null;
    }

    function displayWordInfo(wordInfo) {
        const loadingEl = popup.querySelector('.loading');
        const tabsEl = popup.querySelector('.tabs');
        const meaningTab = popup.querySelector('#meaning-tab');
        const kanjiTab = popup.querySelector('#kanji-tab');

        loadingEl.style.display = 'none';
        tabsEl.style.display = 'flex';

        // 뜻 탭 내용
        let readingHtml = '<div class="reading-text">정보가 없습니다.</div>';
        let meaningHtml = '<div class="meaning-text">정보가 없습니다.</div>';

        if (wordInfo.jisho) {
            const reading = wordInfo.jisho.japanese[0];
            if (reading.reading) {
                readingHtml = `<div class="reading-text">${reading.reading}</div>`;
            }

            const meanings = wordInfo.jisho.senses[0].english_definitions;
            meaningHtml = `<div class="meaning-text">${meanings.join(', ')}</div>`;
        }

        if (wordInfo.translation) {
            meaningHtml += `<div class="korean-meaning">한국어: ${wordInfo.translation}</div>`;
        }

        meaningTab.querySelector('.reading').innerHTML = readingHtml;
        meaningTab.querySelector('.meaning').innerHTML = meaningHtml;

        // 한자 탭 내용
        let kanjiHtml = '';
        if (wordInfo.kanji && wordInfo.kanji.length > 0) {
            wordInfo.kanji.forEach(kanji => {
                kanjiHtml += `
                    <div class="kanji-item">
                        <div class="kanji-char">${kanji.kanji}</div>
                        <div class="kanji-details">
                            <div class="kanji-meanings">뜻: ${kanji.meanings.join(', ')}</div>
                            <div class="kanji-readings">
                                <span>음독: ${kanji.on_readings.join(', ')}</span>
                                <span>훈독: ${kanji.kun_readings.join(', ')}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            kanjiHtml = '<div class="no-kanji">한자 정보가 없습니다.</div>';
        }

        document.querySelector('#kanji-tab .kanji-info').innerHTML = kanjiHtml;
    }

    function displayError(message) {
        const loadingEl = popup.querySelector('.loading');
        loadingEl.innerHTML = `<div class="error">${message}</div>`;
    }

    function switchTab(tabName) {
        console.log(`Switching to tab: ${tabName}`);
        popup.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        popup.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

        popup.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        popup.querySelector(`#${tabName}-tab`).classList.add('active');
    }

    async function saveToAnki(text) {
        try {
            const wordInfo = getCurrentWordInfo();

            // 중복 체크
            const duplicateCheck = await checkDuplicate(text);
            if (duplicateCheck.length > 0) {
                return showSaveError('이미 Anki에 저장된 단어입니다.');
            }

            // 카드 생성
            const note = createAnkiNote(text, wordInfo);
            const result = await addNoteToAnki(note);

            if (result) {
                showSaveSuccess();
            } else {
                showSaveError('카드 저장에 실패했습니다.');
            }

        } catch (error) {
            console.error('Anki 저장 오류:', error);
            showSaveError('Anki 연결에 실패했습니다.');
        }
    }

    function getCurrentWordInfo() {
        const meaningTab = popup.querySelector('#meaning-tab');
        const kanjiTab = popup.querySelector('#kanji-tab');

        return {
            reading: meaningTab.querySelector('.reading-text')?.textContent || '',
            meaning: meaningTab.querySelector('.meaning-text')?.textContent || '',
            koreanMeaning: meaningTab.querySelector('.korean-meaning')?.textContent || '',
            kanji: kanjiTab.querySelector('.kanji-info')?.textContent || ''
        };
    }

    function checkDuplicate(text) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'CHECK_DUPLICATE',
                ankiConnectUrl: settings.ankiConnectUrl,
                params: {
                    query: `deck:"${settings.deckName}" ${settings.fieldMapping.word}:"${text}"`
                }
            }, response => {
                if (response && response.success) {
                    resolve(response.result); // findNotes 결과
                } else {
                    reject(response ? response.error : 'Anki 중복 검사 오류');
                }
            });
        });
    }

    function createAnkiNote(text, wordInfo) {
        const fields = {};
        fields[settings.fieldMapping.word] = text;
        fields[settings.fieldMapping.meaning] = wordInfo.meaning + (wordInfo.koreanMeaning ? '<br>' + wordInfo.koreanMeaning : '');
        fields[settings.fieldMapping.reading] = wordInfo.reading;
        fields[settings.fieldMapping.kanji] = wordInfo.kanji;

        return {
            deckName: settings.deckName,
            modelName: settings.noteType,
            fields: fields,
            tags: ['drag2anki']
        };
    }

    function addNoteToAnki(note) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'ADD_TO_ANKI',
                ankiConnectUrl: settings.ankiConnectUrl, // 예: 'http://localhost:8765'
                params: {
                    note: note
                }
            }, response => {
                if (response && response.success) {
                    resolve(response.result);
                } else {
                    reject(response ? response.error : "Anki 저장 오류");
                }
            });
        });
    }


    function showSaveSuccess() {
        const saveBtn = popup.querySelector('.save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '저장됨!';
        saveBtn.style.backgroundColor = '#4CAF50';

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 2000);
    }

    function showSaveError(message) {
        const saveBtn = popup.querySelector('.save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = message || '저장 실패';
        saveBtn.style.backgroundColor = '#f44336';

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 2000);
    }

    function hidePopup() {
        if (popup) {
            popup.remove();
            popup = null;
        }
    }

    function toggleExtension() {
        // 확장 프로그램 활성화/비활성화 토글
        console.log('Drag2Anki_JP 토글');
    }

    function injectStyles() {
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

    // 설정 변경 감지
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.drag2anki_settings) {
            settings = { ...settings, ...changes.drag2anki_settings.newValue };
        }
    });

})();
