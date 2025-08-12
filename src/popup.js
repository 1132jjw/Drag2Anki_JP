
document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 가져오기
    const elements = {
        ankiUrl: document.getElementById('ankiUrl'),

        deckName: document.getElementById('deckName'),
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

    // 설정 로드
    loadSettings();

    // 이벤트 리스너 설정
    setupEventListeners();

    function loadSettings() {
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            const settings = result.drag2anki_settings || defaultSettings;

            // 폼 필드에 값 설정
            elements.ankiUrl.value = settings.ankiConnectUrl;

            elements.deckName.value = settings.deckName;
            elements.noteType.value = settings.noteType;
            elements.fieldWord.value = settings.fieldMapping.word;
            elements.fieldMeaning.value = settings.fieldMapping.meaning;
            elements.fieldReading.value = settings.fieldMapping.reading;
            elements.fieldKanji.value = settings.fieldMapping.kanji;
            elements.darkMode.checked = settings.darkMode;
            elements.googleSearchTranslate.checked = settings.googleSearchTranslate;
            elements.cacheEnabled.checked = settings.cacheEnabled;

            // 다크 모드 적용
            if (settings.darkMode) {
                document.body.classList.add('dark-mode');
            }
        });
    }

    function setupEventListeners() {
        // 다크 모드 토글
        elements.darkMode.addEventListener('change', function() {
            if (this.checked) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });

        // Google 검색 시 자동 번역 토글
        elements.googleSearchTranslate.addEventListener('change', function() {
            chrome.storage.sync.set({ drag2anki_settings: { googleSearchTranslate: this.checked } });
        });

        // 연결 테스트
        elements.testConnection.addEventListener('click', testAnkiConnection);

        // 설정 저장
        elements.saveSettings.addEventListener('click', saveSettings);

        // 기본값 복원
        elements.resetSettings.addEventListener('click', resetSettings);

        // 입력 필드 유효성 검사
        elements.ankiUrl.addEventListener('blur', validateUrl);

    }

    function validateUrl() {
        const url = elements.ankiUrl.value.trim();
        if (url && !isValidUrl(url)) {
            showStatus('유효하지 않은 URL입니다.', 'error');
            elements.ankiUrl.focus();
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

        if (!url) {
            showStatus('Anki Connect URL을 입력해주세요.', 'error');
            return;
        }

        if (!isValidUrl(url)) {
            showStatus('유효하지 않은 URL입니다.', 'error');
            return;
        }

        showStatus('연결 테스트 중...', 'info');
        elements.testConnection.disabled = true;

        try {
            const result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'testAnkiConnection',
                    url: url
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (result.success) {
                showStatus(`연결 성공! Anki Connect 버전: ${result.version}`, 'success');
            } else {
                showStatus(result.message || '연결 실패', 'error');
            }
        } catch (error) {
            showStatus('연결 테스트 중 오류가 발생했습니다: ' + error.message, 'error');
        } finally {
            elements.testConnection.disabled = false;
        }
    }

    function saveSettings() {
        // 입력값 유효성 검사
        if (!validateInputs()) {
            return;
        }

        const settings = {

            ankiConnectUrl: elements.ankiUrl.value.trim(),
            deckName: elements.deckName.value.trim(),
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
                showStatus('설정 저장 중 오류가 발생했습니다.', 'error');
            } else {
                showStatus('설정이 저장되었습니다.', 'success');

                // 저장 버튼 피드백
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
            { element: elements.ankiUrl, name: 'Anki Connect URL' },
            { element: elements.deckName, name: '덱 이름' },
            { element: elements.noteType, name: '노트 타입' },
            { element: elements.fieldWord, name: '단어 필드' },
            { element: elements.fieldMeaning, name: '뜻 필드' }
        ];

        for (const field of requiredFields) {
            if (!field.element.value.trim()) {
                showStatus(`${field.name}을(를) 입력해주세요.`, 'error');
                field.element.focus();
                return false;
            }
        }

        // URL 유효성 검사
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

        // 3초 후 자동으로 숨기기
        setTimeout(() => {
            elements.connectionStatus.textContent = '';
            elements.connectionStatus.className = 'status';
        }, 3000);
    }

    // 확장 프로그램 정보 표시
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
