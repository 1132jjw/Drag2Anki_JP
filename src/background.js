
// Drag2Anki_JP Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Drag2Anki_JP 익스텐션이 설치되었습니다.');

    // 기본 설정 초기화
    chrome.storage.sync.get(['drag2anki_settings'], (result) => {
        if (!result.drag2anki_settings) {
            const defaultSettings = {
                openaiApiKey: '',
                ankiConnectUrl: 'http://localhost:8765',
                deckName: 'Japanese',
                noteType: 'Basic',
                fieldMapping: {
                    word: 'Front',
                    meaning: 'Back'
                },
                darkMode: false,
                googleSearchTranslate: false,
                fontSize: 14,
                cacheEnabled: true,
                shortcut: 'Ctrl+Shift+D'
            };

            chrome.storage.sync.set({ drag2anki_settings: defaultSettings });
        }
    });
});

// 컨텍스트 메뉴 추가
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'drag2anki-translate',
        title: 'Drag2Anki로 번역',
        contexts: ['selection']
    });
});

// 컨텍스트 메뉴 클릭 이벤트
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'drag2anki-translate') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'translateSelection',
            text: info.selectionText
        });
    }
});

// 키보드 단축키 처리
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle_extension') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleExtension' });
        });
    }
});

// Anki Connect 연결 테스트
async function testAnkiConnection(url) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'version',
                version: 6
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return {
            success: true,
            version: data.result,
            message: 'Anki Connect에 성공적으로 연결되었습니다.'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: 'Anki Connect 연결에 실패했습니다. Anki가 실행 중이고 Anki Connect 애드온이 설치되어 있는지 확인해주세요.'
        };
    }
}

// Anki 카드 중복 확인 요청 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHECK_DUPLICATE') {
        fetch(request.ankiConnectUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'findNotes',
                version: 6,
                params: request.params
            })
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, result: data.result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // 비동기 응답 명시
    }
    else if (request.type === 'CHECK_DUPLICATE_EXACT') {
        // 정확히 일치하는 중복 검사
        (async () => {
            try {
                // 1. findNotes로 note id 찾기
                const findRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'findNotes',
                        version: 6,
                        params: request.params
                    })
                });
                const findData = await findRes.json();
                const ids = findData.result;
                if (!ids || ids.length === 0) {
                    sendResponse({ success: true, isDuplicate: false });
                    return;
                }
                // 2. notesInfo로 실제 필드값 확인
                const infoRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'notesInfo',
                        version: 6,
                        params: { notes: ids }
                    })
                });
                const infoData = await infoRes.json();
                const fieldName = request.fieldName;
                const text = request.text;
                const isDuplicate = infoData.result.some(note =>
                    (note.fields[fieldName]?.value?.trim() === text.trim())
                );
                sendResponse({ success: true, isDuplicate });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
    else if (request.type === 'ADD_TO_ANKI') {
        // AnkiConnect로 fetch
        fetch('http://localhost:8765/', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "addNote",
                version: 6,
                params: request.params
            }),
        })
        .then(res => res.json())
        .then(data => {
            sendResponse({ success: true, result: data.result });
        })
        .catch(err => sendResponse({ success: false, error: err.message }));

        // true를 리턴하면 sendResponse를 비동기로 사용 가능
        return true;
    }
    else if (request.action === 'testAnkiConnection') {
        testAnkiConnection(request.url)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // 비동기 응답을 위해 true 반환
    }
    else if (request.action === 'fetchWithCORS') {
        fetchWithCORS(request.url, request.options)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
});


// CORS 문제 해결을 위한 fetch 프록시
async function fetchWithCORS(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return { data };
    } catch (error) {
        throw new Error(`네트워크 오류: ${error.message}`);
    }
}

// 알림 시스템
function showNotification(title, message, type = 'basic') {
    chrome.notifications.create({
        type: type,
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message
    });
}

// 설정 변경 감지 및 동기화
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.drag2anki_settings) {
        console.log('설정이 변경되었습니다:', changes.drag2anki_settings.newValue);

        // 모든 탭에 설정 변경 알림
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'settingsChanged',
                    settings: changes.drag2anki_settings.newValue
                }).catch(() => {
                    // 메시지 전송 실패 시 무시 (content script가 없는 탭)
                });
            });
        });
    }
});

// 웹 요청 인터셉트 (필요시 사용)
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // API 요청 로깅 또는 수정
        if (details.url.includes('jisho.org') || details.url.includes('openai.com')) {
            console.log('API 요청:', details.url);
        }
    },
    { urls: ['<all_urls>'] },
    ['requestBody']
);

// 탭 업데이트 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // 특정 사이트에서 자동 활성화 등의 로직
        console.log('페이지 로드 완료:', tab.url);
    }
});

// 익스텐션 제거 시 정리
chrome.runtime.onSuspend.addListener(() => {
    console.log('Drag2Anki_JP 익스텐션이 종료됩니다.');
    // 필요한 정리 작업 수행
});

// 오류 처리
chrome.runtime.onInstalled.addListener(() => {
    chrome.runtime.setUninstallURL('https://forms.gle/feedback');
});

// 배지 업데이트 (사용량 표시)
function updateBadge(count) {
    chrome.action.setBadgeText({
        text: count > 0 ? count.toString() : ''
    });
    chrome.action.setBadgeBackgroundColor({
        color: '#667eea'
    });
}

// 통계 수집 (개인정보 없음)
chrome.storage.local.get(['usage_stats'], (result) => {
    if (!result.usage_stats) {
        chrome.storage.local.set({
            usage_stats: {
                wordsLookedUp: 0,
                cardsSaved: 0,
                lastUsed: Date.now()
            }
        });
    }
});
