
document.addEventListener('DOMContentLoaded', function() {
    // DOM 요소 가져오기
    const elements = {
        deckNameSelect: document.getElementById('deckNameSelect'),
        refreshDecks: document.getElementById('refreshDecks'),
        darkMode: document.getElementById('darkMode'),
        googleSearchTranslate: document.getElementById('googleSearchTranslate'),
        cacheEnabled: document.getElementById('cacheEnabled'),
        connectionStatus: document.getElementById('connectionStatus'),
        saveSettings: document.getElementById('saveSettings'),
        resetSettings: document.getElementById('resetSettings')
    };

    // 상태 메시지 자동 숨김 타이머
    let statusHideTimer = null;

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

    // 연결 테스트 + 덱 목록 로드 함수
    async function loadDeckNames() {
        showStatus('Anki 연결 확인 및 덱 목록을 불러오는 중...', 'info');
        elements.deckNameSelect.disabled = true;
        elements.refreshDecks.disabled = true;

        try {
            const ankiConnectUrl = defaultSettings.ankiConnectUrl; // 고정 URL 사용
            // 1) 연결 테스트
            const testRes = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'testAnkiConnection', url: ankiConnectUrl }, (res) => {
                    chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(res);
                });
            });

            if (!testRes || !testRes.success) {
                showStatus(testRes ? (testRes.message || '연결 실패') : '연결 실패', 'error');
                elements.deckNameSelect.innerHTML = '<option value="">Anki 연결 확인 필요</option>';
                return;
            }
            showStatus(`연결 성공! Anki Connect 버전: ${testRes.version}. 덱 목록 로드 중...`, 'success');

            // 2) 덱 목록 가져오기
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

        elements.saveSettings.addEventListener('click', saveSettings);
        elements.resetSettings.addEventListener('click', resetSettings);
        elements.refreshDecks.addEventListener('click', loadDeckNames);
    }

    // 제거: URL 입력 검증 관련 로직은 더 이상 사용되지 않음

    // testAnkiConnection은 더 이상 별도로 사용하지 않음 (새로고침 버튼에서 통합 수행)

    function saveSettings() {
        if (!validateInputs()) return;

        const settings = {
            deckName: elements.deckNameSelect.value,
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
            { el: elements.deckNameSelect, name: '덱' }
        ];

        for (const field of requiredFields) {
            if (!field.el.value.trim()) {
                showStatus(`${field.name}을(를) 선택 또는 입력해주세요.`, 'error');
                field.el.focus();
                return false;
            }
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
        // 이전 타이머가 있다면 해제
        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }

        elements.connectionStatus.textContent = message;
        elements.connectionStatus.className = `status ${type}`;

        // 에러는 더 오래 표시 (8초), 그 외 3초
        const duration = type === 'error' ? 8000 : 3000;
        statusHideTimer = setTimeout(() => {
            elements.connectionStatus.textContent = '';
            elements.connectionStatus.className = 'status';
            statusHideTimer = null;
        }, duration);
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
