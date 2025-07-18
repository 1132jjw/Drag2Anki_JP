
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

    let currentWordInfo = null; // 전역 선언

    // 캐시 시스템
    const cache = new Map();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

    // === 일본 신자체→한국 정자체 매핑 로딩 ===
    let jpSimpToKrTradDict = null;
    async function loadJpSimpToKrTradDict() {
        if (jpSimpToKrTradDict) return jpSimpToKrTradDict;
        const resp = await fetch(chrome.runtime.getURL('data/jp_simp_to_kr_trad.json'));
        jpSimpToKrTradDict = await resp.json();
        return jpSimpToKrTradDict;
    }

    // === 한자 사전 로딩 ===
    let hanjaDict = null;
    async function loadHanjaDict() {
        if (hanjaDict) return hanjaDict;
        const resp = await fetch(chrome.runtime.getURL('data/hanja.json'));
        hanjaDict = await resp.json();
        // 일본 신자체→한국 정자체 매핑도 미리 로딩
        await loadJpSimpToKrTradDict();
        return hanjaDict;
    }

    // === 한자 정보 조회 (일본 신자체→한국 정자체 변환 지원) ===
    async function getHanjaInfo(char) {
        await loadHanjaDict();
        await loadJpSimpToKrTradDict();
        
        if (hanjaDict[char]) return hanjaDict[char];
        if (jpSimpToKrTradDict && jpSimpToKrTradDict[char] && hanjaDict[jpSimpToKrTradDict[char]]) {
            return hanjaDict[jpSimpToKrTradDict[char]];
        }
        return null;
    }

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

    function isJapaneseTextOnly(text) {
        // 일본어 문자, 괄호, 괄호 안의 일본어 허용
        const japaneseWithParensRegex = /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\(\)]+$/;
        return japaneseWithParensRegex.test(text);
    }

    function isKanaOnly(text) {
        const kanaRegex = /^[\u3040-\u309F\u30A0-\u30FF]+$/;
        return kanaRegex.test(text);}

    function showPopup(displayText, rect, normalizedText) {
        hidePopup();

        popup = createPopup(displayText, rect);
        document.body.appendChild(popup);
        
        // 팝업 위치 조정
        adjustPopupPosition(popup, rect);
        
        // 단어 정보 로드 시 normalizedText 사용
        loadWordInfo(normalizedText);
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
                <button class="save-btn">Anki에 저장 [단어]</button>
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
                const [jishoData, llmMeaning, kanjiData] = await Promise.allSettled([
                    fetchJishoData(text),
                    fetchLLMMeaning(text),
                    fetchKanjiData(text)
                ]);

                wordInfo = {
                    jisho: safeValue(jishoData),
                    llmMeaning: safeValue(llmMeaning),
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

            currentWordInfo = wordInfo; // wordInfo 저장
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

    async function fetchLLMMeaning(text) {
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
                model: 'gpt-4.1-mini-2025-04-14',
                messages: [
                    {
                        role: 'system',
                        content: `
                        [응답 형식]

                        후리가나: [단어의 후리가나]
                        뜻:
                        [품사]
                            1.	[의미1]
                            2.	[의미2]
                        …

                        ⸻

                        예시
                        입력: 偶然
                        출력:
                        후리가나: ぐうぜん
                        뜻:
                        명사
                            1.	우연
                            2.	(철학) ((contingency)) 우연성; 어떤 사물이 인과율에 근거하지 않는 성질

                        부사
                            1.	뜻하지 않게; 우연히

                        ⸻

                        입력받은 일본어 단어마다 위 형식에 맞춰 답변해 주세요.
                        `,
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
        const content = data.choices[0].message.content;
        
        // 후리가나와 뜻을 분리하여 객체로 반환
        const readingMatch = content.match(/후리가나:\s*(.+)/);
        const meaningMatch = content.match(/뜻:\s*([\s\S]*)/);
        
        return {
            reading: readingMatch ? readingMatch[1].trim() : '',
            meaning: meaningMatch ? meaningMatch[1].trim() : content
        };
    }

    async function fetchKanjiData(text) {
        const kanjiList = text.match(/[\u4E00-\u9FAF]/g) || [];
        const kanjiData = [];
        for (const kanji of kanjiList) {
            let data = {};
            try {
                const response = await fetch(`https://kanjiapi.dev/v1/kanji/${kanji}`);
                data = await response.json();
            } catch (error) {
                console.error(`한자 정보 로드 오류 (${kanji}):`, error);
            }

            const koreanHanjaInfo = await getHanjaInfo(kanji);
            if (koreanHanjaInfo) {
                data.korean = koreanHanjaInfo;
            } else {
                // 한자 1글자만 LLM에 넣어서 설명 받기
                let llmMeaning = null;
                try {
                    llmMeaning = await fetchLLMMeaning(kanji);
                } catch (e) {
                    llmMeaning = null;
                }
                if (llmMeaning) {
                    data.korean = {
                        meaning: llmMeaning.meaning.replace(/\n/g, '<br>') || '(이 한자는 한국에서 사용되지 않습니다.)',
                        reading: '<br>[일본 한자]'
                    };
                } else {
                    data.korean = {
                        meaning: '(이 한자는 한국에서 사용되지 않습니다.)',
                        reading: '<br>[일본 한자]'
                    };
                }
            }

            kanjiData.push(data);
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

        document.querySelector('#kanji-tab .kanji-info').innerHTML = kanjiHtml;
        // 한자 저장 버튼 이벤트 위임 (뜻 탭용) 제거
        // 한자 탭용 기존 이벤트 위임 유지
        const kanjiInfoEl = document.querySelector('#kanji-tab .kanji-info');
        if (kanjiInfoEl) {
            kanjiInfoEl.addEventListener('click', async function(e) {
                const btn = e.target.closest('.kanji-save-btn');
                if (btn) {
                    const idx = btn.getAttribute('data-kanji-idx');
                    if (wordInfo.kanji && wordInfo.kanji[idx]) {
                        await saveKanjiToAnki(wordInfo.kanji[idx], btn);
                    }
                }
            });
        }
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

    // 정확히 일치하는 중복만 검사하는 함수 (background.js에 위임)
    async function checkDuplicateExact(text) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'CHECK_DUPLICATE_EXACT',
                ankiConnectUrl: settings.ankiConnectUrl,
                params: { query: `"${text.trim()}"` },
                fieldName: settings.fieldMapping.word,
                text: text.trim()
            }, response => {
                if (response && response.success) {
                    resolve(response.isDuplicate);
                } else {
                    reject(response ? response.error : 'Anki 중복 검사 오류');
                }
            });
        });
    }

    async function saveToAnki(text) {
        try {
            const wordInfo = currentWordInfo; // wordInfo 직접 사용
            console.log('저장할 단어 정보:', wordInfo);

            // 중복 체크 (정확히 일치하는 경우만)
            const isDuplicate = await checkDuplicateExact(text);
            if (isDuplicate) {
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

    function createAnkiNote(text, wordInfo) {
        const fields = {};
        
        // LLM에서 받아온 후리가나와 뜻 사용
        let meaning = '';
        let reading = '';
        
        if (wordInfo.llmMeaning && wordInfo.llmMeaning.meaning) {
            meaning = wordInfo.llmMeaning.meaning;
        }
        
        if (wordInfo.llmMeaning && wordInfo.llmMeaning.reading) {
            reading = wordInfo.llmMeaning.reading;
        } else if (wordInfo.jisho && wordInfo.jisho.japanese[0].reading) {
            // LLM에서 후리가나를 받지 못한 경우 Jisho API 사용 (fallback)
            reading = wordInfo.jisho.japanese[0].reading;
        }
        
        if (!isKanaOnly(text) && reading) {
            meaning = reading + '\n\n' + meaning;
        }
        
        fields[settings.fieldMapping.word] = text + ' [단어]';
        fields[settings.fieldMapping.meaning] = meaning.replace(/\n/g, '<br>');

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
        saveBtn.textContent = '저장됨! [단어]';
        saveBtn.style.backgroundColor = '#4CAF50';

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 2000);
    }

    function showSaveError(message) {
        const saveBtn = popup.querySelector('.save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = (message || '저장 실패') + ' [단어]';
        saveBtn.style.backgroundColor = '#f44336';

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.backgroundColor = '';
        }, 2000);
    }

    async function saveKanjiToAnki(kanji, btnEl) {
        try {
            console.log('saveKanjiToAnki', kanji);
            // 중복 체크 (한자 자체로, 정확히 일치하는 경우만)
            const isDuplicate = await checkDuplicateExact(kanji.kanji);
            if (isDuplicate) {
                console.log('이미 저장됨');
                return showKanjiSaveError(btnEl, '이미 저장됨');
            }
            // 카드 생성
            const note = createKanjiAnkiNote(kanji);
            const result = await addNoteToAnki(note);
            if (result) {
                showKanjiSaveSuccess(btnEl);
            } else {
                showKanjiSaveError(btnEl, '저장 실패');
            }
        } catch (error) {
            showKanjiSaveError(btnEl, 'Anki 오류');
        }
    }
    function createKanjiAnkiNote(kanji) {
        const fields = {};
        // Front: just the kanji + [한자]
        fields[settings.fieldMapping.word] = (kanji.kanji || '').trim() + ' [한자]';

        // Back: Korean meaning, 음독, 훈독, each with label and linebreaks
        let back = '';
        if (kanji.korean?.meaning || kanji.korean?.reading) {
            back += (kanji.korean?.meaning || '') + (kanji.korean?.reading ? ' ' + kanji.korean.reading : '') + '\n';
        }
        // Add Japanese readings with labels
        if (kanji.on_readings && kanji.on_readings.length > 0) {
            back += '음독: ' + kanji.on_readings.join(', ') + '\n';
        }
        if (kanji.kun_readings && kanji.kun_readings.length > 0) {
            back += '훈독: ' + kanji.kun_readings.join(', ') + '\n';
        }
        fields[settings.fieldMapping.meaning] = back.replace(/\n/g, '<br>');

        if (settings.fieldMapping.reading) {
            fields[settings.fieldMapping.reading] = (kanji.on_readings?.join(', ') || '') + '<br>' + (kanji.kun_readings?.join(', ') || '');
        }
        if (settings.fieldMapping.kanji) {
            fields[settings.fieldMapping.kanji] = kanji.kanji || '';
        }
        return {
            deckName: settings.deckName,
            modelName: settings.noteType,
            fields: fields,
            tags: ['drag2anki', 'kanji']
        };
    }
    function showKanjiSaveSuccess(btn) {
        const originalText = btn.textContent;
        btn.textContent = '저장됨! [한자]';
        btn.style.backgroundColor = '#4CAF50';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
        }, 2000);
    }
    function showKanjiSaveError(btn, message) {
        const originalText = btn.textContent;
        btn.textContent = (message || '저장 실패') + ' [한자]';
        btn.style.backgroundColor = '#f44336';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
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
    
    function getSelectedTextWithoutRuby() {
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
    
    function removeJapaneseParens(text) {
        // 예: 生(ま)れる → 生まれる
        return text.replace(/[\(\)]/g, ''); // 괄호만 제거
        // 또는, 괄호와 그 안의 문자까지 제거하려면: text.replace(/\([^\)]*\)/g, '')
    }
})();
