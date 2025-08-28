
// Drag2Anki_JP Background Service Worker
// Disable verbose logs for production
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    // keep error/warn; silence regular logs
    console.log = function () {};
}

// Resolve DeepL API key from build-time env only (.env via dotenv/DefinePlugin)
async function getDeepLKeyBg() {
    try {
        // Access directly so bundler can inline the value at build time.
        // eslint-disable-next-line no-undef
        const v = process.env.DEEPL_API_KEY;
        return v || '';
    } catch (_) {
        // In case process is not defined at runtime (should be inlined by bundler)
        return '';
    }
}
chrome.runtime.onInstalled.addListener(() => {
    // console.log('Drag2Anki_JP 익스텐션이 설치되었습니다.');

    // 기본 설정 초기화
    chrome.storage.sync.get(['drag2anki_settings'], (result) => {
        if (!result.drag2anki_settings) {
            const defaultSettings = {
                openaiApiKey: '',
                deeplApiKey: '',
                ankiConnectUrl: 'http://localhost:8765',
                deckName: 'Japanese',
                noteType: 'Basic',
                fieldMapping: {
                    word: 'Front',
                    meaning: 'Back'
                },
                darkMode: false,
                googleSearchTranslate: false,
                cacheEnabled: true
            };

            chrome.storage.sync.set({ drag2anki_settings: defaultSettings });
        } else {
            // 마이그레이션: 기존 사용자 설정에 deeplApiKey가 없으면 추가
            const current = result.drag2anki_settings || {};
            if (typeof current.deeplApiKey === 'undefined') {
                current.deeplApiKey = '';
                chrome.storage.sync.set({ drag2anki_settings: current });
            }
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
    if (request.type === 'DEEPL_TRANSLATE') {
        (async () => {
            try {
                const text = request.text || '';
                const target_lang = request.target_lang || 'KO';
                const source_lang = request.source_lang || 'JA';
                const key = request.key || await getDeepLKeyBg();
                if (!key) {
                    throw new Error('DeepL API 키가 설정되지 않았습니다. .env에 DEEPL_API_KEY를 설정하고 다시 빌드하세요.');
                }

                const res = await fetch('https://api-free.deepl.com/v2/translate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `DeepL-Auth-Key ${key}`
                    },
                    body: new URLSearchParams({
                        text,
                        target_lang,
                        source_lang,
                        split_sentences: '1',
                        preserve_formatting: '1'
                    }).toString()
                });

                if (!res.ok) {
                    const msg = `DeepL HTTP ${res.status}: ${res.statusText}`;
                    throw new Error(msg);
                }
                const data = await res.json();
                sendResponse({ success: true, data });
            } catch (error) {
                console.error('[Drag2Anki/bg] DEEPL_TRANSLATE error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // async response
    }
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
                const modelName = request.modelName;
                const text = request.text;
                // 모델의 첫 필드명 조회 (없으면 요청 필드명 사용)
                let primaryField = request.fieldName;
                let modelFields = null;
                if (modelName) {
                    try {
                        const mfRes = await fetch(request.ankiConnectUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'modelFieldNames', version: 6, params: { modelName } })
                        });
                        const mfData = await mfRes.json();
                        if (Array.isArray(mfData?.result) && mfData.result.length > 0) {
                            modelFields = mfData.result;
                            primaryField = modelFields[0];
                        }
                        console.log('[Drag2Anki/bg] model first field:', modelName, '->', primaryField);
                    } catch (e) {
                        // console.warn('[Drag2Anki/bg] modelFieldNames failed, fallback to request.fieldName:', e);
                    }
                }
                // 쿼리: 노트 타입 + 첫 필드 정확 일치 제한
                const broadQuery = (modelName ? `note:"${modelName}" ` : '') + `field:${primaryField}:"${text}"`;
                const findRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'findNotes',
                        version: 6,
                        params: { query: broadQuery }
                    })
                });
                const findData = await findRes.json();
                // console.log('[Drag2Anki/bg] CHECK_DUPLICATE_EXACT query:', broadQuery, 'primaryField:', primaryField);
                // console.log('[Drag2Anki/bg] findNotes result ids:', findData?.result);
                let ids = findData.result;
                // Fallback: if no ids with field-scoped query, try broad query note+text only
                if (!ids || ids.length === 0) {
                    const fallbackQuery = (modelName ? `note:"${modelName}" ` : '') + `"${text}"`;
                    // console.log('[Drag2Anki/bg] no ids, fallback query:', fallbackQuery);
                    const fbRes = await fetch(request.ankiConnectUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'findNotes', version: 6, params: { query: fallbackQuery } })
                    });
                    const fbData = await fbRes.json();
                    // console.log('[Drag2Anki/bg] fallback ids:', fbData?.result);
                    ids = fbData.result || [];
                    if (!ids.length) {
                        // console.log('[Drag2Anki/bg] duplicate: false (no ids even after fallback)');
                        sendResponse({ success: true, isDuplicate: false });
                        return;
                    }
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
                // console.log('[Drag2Anki/bg] notesInfo count:', infoData?.result?.length);
                const isDuplicate = infoData.result.some(note => {
                    const fieldKeys = Object.keys(note.fields || {});
                    const resolvedKey = fieldKeys.find(k => k.toLowerCase() === (primaryField || '').toLowerCase()) || primaryField;
                    const raw = (note.fields?.[resolvedKey]?.value) || '';
                    const plain = raw.replace(/<[^>]*>/g, '').trim();
                    const target = (text || '').trim();
                    const match = plain === target;
                    if (match) {
                        // console.log('[Drag2Anki/bg] duplicate match on note', note.noteId || note.id, { plain, target });
                    } else {
                        // console.log('[Drag2Anki/bg] not match', {
                        //     plain,
                        //     target,
                        //     plainLen: plain.length,
                        //     targetLen: target.length,
                        //     model: note.modelName,
                        //     field: resolvedKey
                        // });
                    }
                    return match;
                });
                // console.log('[Drag2Anki/bg] duplicate computed:', isDuplicate);
                sendResponse({ success: true, isDuplicate });
            } catch (error) {
                console.error('[Drag2Anki/bg] CHECK_DUPLICATE_EXACT error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
    else if (request.type === 'ADD_TO_ANKI') {
        // console.log('[Drag2Anki/bg] ADD_TO_ANKI start');
        fetch(request.ankiConnectUrl, {
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
            // console.log('[Drag2Anki/bg] ADD_TO_ANKI result:', data);
            if (data && data.error) {
                // Duplicate or other error from Anki
                const errMsg = String(data.error || 'Unknown error');
                const isDup = /duplicate/i.test(errMsg) || data.result === null;
                if (isDup) {
                    // Try to find existing by Front field from params
                    const fields = request.params?.note?.fields || request.params?.fields || {};
                    const fieldName = Object.keys(fields)[0] || 'Front';
                    const frontText = (fields[fieldName] || '').toString().trim();
                    const query = `"${frontText}"`;
                    return fetch(request.ankiConnectUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'findNotes', version: 6, params: { query } })
                    })
                    .then(r => r.json())
                    .then(found => {
                        const ids = found.result || [];
                        if (!ids.length) {
                            return sendResponse({ success: false, duplicate: true, error: errMsg, existing: null });
                        }
                        return fetch(request.ankiConnectUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'notesInfo', version: 6, params: { notes: ids } })
                        })
                        .then(ir => ir.json())
                        .then(info => {
                            const res = info.result || [];
                            const match = res.find(n => {
                                const raw = n.fields?.[fieldName]?.value || '';
                                const plain = raw.replace(/<[^>]*>/g, '').trim();
                                return plain === frontText;
                            }) || res[0] || null;
                            const existing = match ? {
                                id: match.noteId || match.id || ids[0],
                                modelName: match.modelName,
                                front: match.fields?.[fieldName]?.value || '',
                                back: match.fields?.Back?.value || ''
                            } : null;
                            return sendResponse({ success: false, duplicate: true, error: errMsg, existing });
                        });
                    })
                    .catch(() => sendResponse({ success: false, duplicate: true, error: errMsg }));
                }
                return sendResponse({ success: false, error: errMsg });
            }
            sendResponse({ success: true, result: data.result });
        })
        .catch(err => {
            console.error('[Drag2Anki/bg] ADD_TO_ANKI error:', err);
            sendResponse({ success: false, error: err.message });
        });

        // true를 리턴하면 sendResponse를 비동기로 사용 가능
        return true;
    }
    else if (request.type === 'GET_EXISTING_BY_FRONT') {
        // Front 필드로 정확히 일치하는 기존 노트 정보 반환
        (async () => {
            try {
                const modelName = request.modelName;
                // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT start', { fieldName: request.fieldName, modelName: modelName, text: request.text });
                // Broad query with model + primary field equality to capture the right note
                const text = request.text.trim();
                // 모델의 첫 필드명 조회 (없으면 요청 필드명 사용)
                let primaryField = request.fieldName;
                let modelFields = null; // will be used to resolve Back field later
                if (modelName) {
                    try {
                        const mfRes = await fetch(request.ankiConnectUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'modelFieldNames', version: 6, params: { modelName } })
                        });
                        const mfData = await mfRes.json();
                        if (Array.isArray(mfData?.result) && mfData.result.length > 0) {
                            modelFields = mfData.result;
                            primaryField = modelFields[0];
                        }
                        console.log('[Drag2Anki/bg] model first field:', modelName, '->', primaryField);
                    } catch (e) {
                        // console.warn('[Drag2Anki/bg] modelFieldNames failed, fallback to request.fieldName:', e);
                    }
                }
                const query = (modelName ? `note:"${modelName}" ` : '') + `field:${primaryField}:"${text}"`;
                // 1) findNotes
                const findRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'findNotes', version: 6, params: { query } })
                });
                const findData = await findRes.json();
                // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT query:', query, 'primaryField:', primaryField);
                // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT ids:', findData?.result);
                let ids = findData.result || [];
                // Fallback to broad query if none
                if (!ids.length) {
                    const fallbackQuery = (modelName ? `note:"${modelName}" ` : '') + `"${text}"`;
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT no ids, fallback query:', fallbackQuery);
                    const fbRes = await fetch(request.ankiConnectUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'findNotes', version: 6, params: { query: fallbackQuery } })
                    });
                    const fbData = await fbRes.json();
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT fallback ids:', fbData?.result);
                    ids = fbData.result || [];
                }
                if (ids.length === 0) {
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT no result');
                    sendResponse({ success: true, result: null });
                    return;
                }
                // 2) notesInfo (첫 번째 노트만 사용)
                const infoRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'notesInfo', version: 6, params: { notes: ids } })
                });
                const infoData = await infoRes.json();
                // 정확히 첫 필드가 일치하는(HTML 제거 후 텍스트 기준) 첫 노트 선택
                const target = text;
                const matched = (infoData.result || []).find(n => {
                    const fieldKeys = Object.keys(n.fields || {});
                    const resolvedKey = fieldKeys.find(k => k.toLowerCase() === (primaryField || '').toLowerCase()) || primaryField;
                    const raw = n.fields?.[resolvedKey]?.value || '';
                    const plain = raw.replace(/<[^>]*>/g, '').trim();
                    return plain === target;
                });
                const note = matched || (infoData.result && infoData.result[0]) || null;
                if (!note) {
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT notesInfo empty');
                    sendResponse({ success: true, result: null });
                    return;
                }
                const fieldKeys = Object.keys(note.fields || {});
                const resolvedKey = fieldKeys.find(k => k.toLowerCase() === (primaryField || '').toLowerCase()) || primaryField;
                // Resolve back field: prefer modelFields[1]; else field named 'back'; else any field not primary
                let backKey = (modelFields && modelFields[1]) ? modelFields[1] : (fieldKeys.find(k => k.toLowerCase() === 'back'));
                if (!backKey) backKey = fieldKeys.find(k => k !== resolvedKey) || 'Back';
                const backResolved = fieldKeys.find(k => k.toLowerCase() === (backKey || '').toLowerCase()) || backKey;
                const front = note.fields?.[resolvedKey]?.value || '';
                const back = note.fields?.[backResolved]?.value || '';
                // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT note:', { id: note.noteId || note.id || ids[0], modelName: note.modelName, front, back });
                sendResponse({
                    success: true,
                    result: {
                        id: note.noteId || note.id || ids[0],
                        modelName: note.modelName,
                        front,
                        back
                    }
                });
            } catch (error) {
                console.error('[Drag2Anki/bg] GET_EXISTING_BY_FRONT error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
    else if (request.type === 'DELETE_NOTES') {
        // 지정된 노트 ID들 삭제
        // console.log('[Drag2Anki/bg] DELETE_NOTES start', { noteIds: request.noteIds });
        fetch(request.ankiConnectUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deleteNotes', version: 6, params: { notes: request.noteIds } })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            console.log('[Drag2Anki/bg] DELETE_NOTES success:', data.result);
            sendResponse({ success: true, result: data.result });
        })
        .catch(err => {
            console.error('[Drag2Anki/bg] DELETE_NOTES error:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
    else if (request.type === 'GET_DECK_NAMES') {
        fetch(request.ankiConnectUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'deckNames',
                version: 6
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            sendResponse({ success: true, result: data.result });
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // 비동기 응답 명시
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
        // console.log('설정이 변경되었습니다:', changes.drag2anki_settings.newValue);

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

// 익스텐션 제거 시 평가
// chrome.runtime.onInstalled.addListener(() => {
//     chrome.runtime.setUninstallURL('https://forms.gle/feedback');
// });
