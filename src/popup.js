
document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 가져오기
    const elements = {
        ankiUrl: document.getElementById('ankiUrl'),
        deckNameSelect: document.getElementById('deckNameSelect'),
        refreshDecks: document.getElementById('refreshDecks'),
        noteType: document.getElementById('noteType'),
        fieldWord: document.getElementById('fieldWord'),
        fieldMeaning: document.getElementById('fieldMeaning'),
        fieldReading: document.getElementById('fieldReading'),
        fieldKanji: document.getElementById('fieldKanji'),
        darkMode: document.getElementById('darkMode'),
        googleSearchTranslate: document.getElementById('googleSearchTranslate'),
        cacheEnabled: document.getElementById('cacheEnabled'),
        testConnection: document.getElementById('testConnection'),
        connectionStatus: document.getElementById('connectionStatus'),
        saveSettings: document.getElementById('saveSettings'),
        resetSettings: document.getElementById('resetSettings')
    };

    // 기본 설정값
    const defaultSettings = {
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
        googleSearchTranslate: false,
        cacheEnabled: true
    };

    // 설정 로드 및 UI 초기화
    loadSettings();
    setupEventListeners();

    // 덱 목록 로드 함수
    async function loadDeckNames() {
        showStatus('Anki 덱 목록을 불러오는 중...', 'info');
        elements.deckNameSelect.disabled = true;
        elements.refreshDecks.disabled = true;

        try {
            const ankiConnectUrl = elements.ankiUrl.value.trim();
            if (!ankiConnectUrl || !isValidUrl(ankiConnectUrl)) {
                showStatus('유효한 Anki Connect URL을 먼저 입력해주세요.', 'error');
                elements.deckNameSelect.innerHTML = '<option value="">URL 확인 필요</option>';
                return;
            }

            const deckNames = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'GET_DECK_NAMES',
                    ankiConnectUrl: ankiConnectUrl
                }, response => {
                    if (response && response.success) {
                        resolve(response.result);
                    } else {
                        reject(new Error(response ? response.error : '알 수 없는 오류'));
                    }
                });
            });

            elements.deckNameSelect.innerHTML = ''; // 기존 옵션 삭제
            deckNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                elements.deckNameSelect.appendChild(option);
            });

            // 저장된 덱 이름 선택
            chrome.storage.sync.get(['drag2anki_settings'], (result) => {
                const settings = result.drag2anki_settings || defaultSettings;
                if (settings.deckName && deckNames.includes(settings.deckName)) {
                    elements.deckNameSelect.value = settings.deckName;
                }
            });

            if (deckNames.length > 0) {
                showStatus('덱 목록을 성공적으로 불러왔습니다.', 'success');
            } else {
                showStatus('불러올 덱이 없습니다. Anki를 확인해주세요.', 'info');
            }

        } catch (error) {
            showStatus(`덱 목록 로드 실패: ${error.message}`, 'error');
            elements.deckNameSelect.innerHTML = '<option value="">Anki 연결 확인 필요</option>';
        } finally {
            elements.deckNameSelect.disabled = false;
            elements.refreshDecks.disabled = false;
        }
    }

    function loadSettings() {
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            const settings = result.drag2anki_settings || defaultSettings;

            elements.ankiUrl.value = settings.ankiConnectUrl;
            elements.noteType.value = settings.noteType;
            elements.fieldWord.value = settings.fieldMapping.word;
            elements.fieldMeaning.value = settings.fieldMapping.meaning;
            elements.fieldReading.value = settings.fieldMapping.reading;
            elements.fieldKanji.value = settings.fieldMapping.kanji;
            elements.darkMode.checked = settings.darkMode;
            elements.googleSearchTranslate.checked = settings.googleSearchTranslate;
            elements.cacheEnabled.checked = settings.cacheEnabled;

            if (settings.darkMode) {
                document.body.classList.add('dark-mode');
            }
            
            loadDeckNames();
        });
    }

    function setupEventListeners() {
        elements.darkMode.addEventListener('change', function() {
            document.body.classList.toggle('dark-mode', this.checked);
        });

        elements.testConnection.addEventListener('click', testAnkiConnection);
        elements.saveSettings.addEventListener('click', saveSettings);
        elements.resetSettings.addEventListener('click', resetSettings);
        elements.refreshDecks.addEventListener('click', loadDeckNames);
        elements.ankiUrl.addEventListener('blur', validateUrl);
    }

    function validateUrl() {
        const url = elements.ankiUrl.value.trim();
        if (url && !isValidUrl(url)) {
            showStatus('유효하지 않은 URL입니다.', 'error');
        }
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async function testAnkiConnection() {
        const url = elements.ankiUrl.value.trim();
        if (!validateUrl(url)) return;

        elements.testConnection.disabled = true;
        showStatus('Anki Connect와 연결 중...', 'info');

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'testAnkiConnection', url: url }, (res) => {
                    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(res);
                });
            });

            if (response && response.success) {
                showStatus(`연결 성공! Anki Connect 버전: ${response.version}`, 'success');
                loadDeckNames(); // 연결 성공 시 덱 목록 자동 로드
            } else {
                showStatus(response ? response.message : '연결 실패', 'error');
            }
        } catch (error) {
            showStatus(`연결 테스트 오류: ${error.message}`, 'error');
        } finally {
            elements.testConnection.disabled = false;
        }
    }

    function saveSettings() {
        if (!validateInputs()) return;

        const settings = {
            ankiConnectUrl: elements.ankiUrl.value.trim(),
            deckName: elements.deckNameSelect.value,
            noteType: elements.noteType.value.trim(),
            fieldMapping: {
                word: elements.fieldWord.value.trim(),
                meaning: elements.fieldMeaning.value.trim(),
                reading: elements.fieldReading.value.trim(),
                kanji: elements.fieldKanji.value.trim()
            },
            darkMode: elements.darkMode.checked,
            googleSearchTranslate: elements.googleSearchTranslate.checked,
            cacheEnabled: elements.cacheEnabled.checked
        };

        chrome.storage.sync.set({ drag2anki_settings: settings }, () => {
            if (chrome.runtime.lastError) {
                showStatus(`설정 저장 실패: ${chrome.runtime.lastError.message}`, 'error');
            } else {
                showStatus('설정이 저장되었습니다.', 'success');
                const originalText = elements.saveSettings.textContent;
                elements.saveSettings.textContent = '저장됨!';
                elements.saveSettings.classList.add('saved');
                setTimeout(() => {
                    elements.saveSettings.textContent = originalText;
                    elements.saveSettings.classList.remove('saved');
                }, 2000);
            }
        });
    }

    function validateInputs() {
        const requiredFields = [
            { el: elements.ankiUrl, name: 'Anki Connect URL' },
            { el: elements.deckNameSelect, name: '덱' },
            { el: elements.noteType, name: '노트 타입' },
            { el: elements.fieldWord, name: '단어 필드' },
            { el: elements.fieldMeaning, name: '뜻 필드' }
        ];

        for (const field of requiredFields) {
            if (!field.el.value.trim()) {
                showStatus(`${field.name}을(를) 선택 또는 입력해주세요.`, 'error');
                field.el.focus();
                return false;
            }
        }

        if (!isValidUrl(elements.ankiUrl.value.trim())) {
            showStatus('유효하지 않은 Anki Connect URL입니다.', 'error');
            elements.ankiUrl.focus();
            return false;
        }
        return true;
    }

    function resetSettings() {
        if (confirm('모든 설정을 기본값으로 복원하시겠습니까?')) {
            chrome.storage.sync.set({ drag2anki_settings: defaultSettings }, () => {
                loadSettings();
                showStatus('설정이 기본값으로 복원되었습니다.', 'info');
            });
        }
    }

    function showStatus(message, type = 'info') {
        elements.connectionStatus.textContent = message;
        elements.connectionStatus.className = `status ${type}`;
        setTimeout(() => {
            elements.connectionStatus.textContent = '';
            elements.connectionStatus.className = 'status';
        }, 3000);
    }

    const manifest = chrome.runtime.getManifest();
    const versionInfo = document.createElement('div');
    versionInfo.className = 'version-info';
    versionInfo.innerHTML = `
        <small>
            ${manifest.name} v${manifest.version}<br>
            <a href="https://github.com/1132jjw/Drag2Anki_JP" target="_blank">GitHub</a> | 
            <a href="mailto:draganki01@gmail.com">문의</a>
        </small>
    `;
    document.querySelector('.info').appendChild(versionInfo);
});
