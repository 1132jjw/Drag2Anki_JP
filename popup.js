
document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 가져오기
    const elements = {
        ankiUrl: document.getElementById('ankiUrl'),
        openaiKey: document.getElementById('openaiKey'),
        deckName: document.getElementById('deckName'),
        noteType: document.getElementById('noteType'),
        fieldWord: document.getElementById('fieldWord'),
        fieldMeaning: document.getElementById('fieldMeaning'),
        fieldReading: document.getElementById('fieldReading'),
        fieldKanji: document.getElementById('fieldKanji'),
        darkMode: document.getElementById('darkMode'),
        fontSize: document.getElementById('fontSize'),
        fontSizeValue: document.getElementById('fontSizeValue'),
        cacheEnabled: document.getElementById('cacheEnabled'),
        shortcut: document.getElementById('shortcut'),
        testConnection: document.getElementById('testConnection'),
        connectionStatus: document.getElementById('connectionStatus'),
        saveSettings: document.getElementById('saveSettings'),
        resetSettings: document.getElementById('resetSettings')
    };

    // 기본 설정값
    const defaultSettings = {
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

    // 설정 로드
    loadSettings();

    // 이벤트 리스너 설정
    setupEventListeners();

    function loadSettings() {
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            const settings = result.drag2anki_settings || defaultSettings;

            // 폼 필드에 값 설정
            elements.ankiUrl.value = settings.ankiConnectUrl;
            elements.openaiKey.value = settings.openaiApiKey;
            elements.deckName.value = settings.deckName;
            elements.noteType.value = settings.noteType;
            elements.fieldWord.value = settings.fieldMapping.word;
            elements.fieldMeaning.value = settings.fieldMapping.meaning;
            elements.fieldReading.value = settings.fieldMapping.reading;
            elements.fieldKanji.value = settings.fieldMapping.kanji;
            elements.darkMode.checked = settings.darkMode;
            elements.fontSize.value = settings.fontSize;
            elements.fontSizeValue.textContent = settings.fontSize + 'px';
            elements.cacheEnabled.checked = settings.cacheEnabled;
            elements.shortcut.value = settings.shortcut;

            // 다크 모드 적용
            if (settings.darkMode) {
                document.body.classList.add('dark-mode');
            }
        });
    }

    function setupEventListeners() {
        // 폰트 크기 슬라이더
        elements.fontSize.addEventListener('input', function() {
            elements.fontSizeValue.textContent = this.value + 'px';
        });

        // 다크 모드 토글
        elements.darkMode.addEventListener('change', function() {
            if (this.checked) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });

        // 연결 테스트
        elements.testConnection.addEventListener('click', testAnkiConnection);

        // 설정 저장
        elements.saveSettings.addEventListener('click', saveSettings);

        // 기본값 복원
        elements.resetSettings.addEventListener('click', resetSettings);

        // 입력 필드 유효성 검사
        elements.ankiUrl.addEventListener('blur', validateUrl);
        elements.openaiKey.addEventListener('blur', validateApiKey);
    }

    function validateUrl() {
        const url = elements.ankiUrl.value.trim();
        if (url && !isValidUrl(url)) {
            showStatus('유효하지 않은 URL입니다.', 'error');
            elements.ankiUrl.focus();
        }
    }

    function validateApiKey() {
        const key = elements.openaiKey.value.trim();
        if (key && !key.startsWith('sk-')) {
            showStatus('OpenAI API 키는 "sk-"로 시작해야 합니다.', 'error');
            elements.openaiKey.focus();
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
            openaiApiKey: elements.openaiKey.value.trim(),
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
            fontSize: parseInt(elements.fontSize.value),
            cacheEnabled: elements.cacheEnabled.checked,
            shortcut: elements.shortcut.value.trim()
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

        // API 키 유효성 검사 (선택사항)
        const apiKey = elements.openaiKey.value.trim();
        if (apiKey && !apiKey.startsWith('sk-')) {
            showStatus('OpenAI API 키는 "sk-"로 시작해야 합니다.', 'error');
            elements.openaiKey.focus();
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

    // 키보드 단축키 정보 업데이트
    chrome.commands.getAll((commands) => {
        const toggleCommand = commands.find(cmd => cmd.name === 'toggle_extension');
        if (toggleCommand && toggleCommand.shortcut) {
            elements.shortcut.value = toggleCommand.shortcut;
        }
    });

    // 확장 프로그램 정보 표시
    const manifest = chrome.runtime.getManifest();
    const versionInfo = document.createElement('div');
    versionInfo.className = 'version-info';
    versionInfo.innerHTML = `
        <small>
            ${manifest.name} v${manifest.version}<br>
            <a href="https://github.com/drag2anki/drag2anki-jp" target="_blank">GitHub</a> | 
            <a href="mailto:support@drag2anki.com">문의</a>
        </small>
    `;
    document.querySelector('.info').appendChild(versionInfo);

    // 사용 통계 표시 (선택사항)
    chrome.storage.local.get(['usage_stats'], (result) => {
        if (result.usage_stats) {
            const stats = result.usage_stats;
            const statsInfo = document.createElement('div');
            statsInfo.className = 'stats-info';
            statsInfo.innerHTML = `
                <h4>사용 통계</h4>
                <p>검색한 단어: ${stats.wordsLookedUp}개</p>
                <p>저장한 카드: ${stats.cardsSaved}개</p>
            `;
            document.querySelector('.info').appendChild(statsInfo);
        }
    });
});
