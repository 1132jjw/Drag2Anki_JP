
// Drag2Anki_JP Background Service Worker
// Disable verbose logs for production
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    // keep error/warn; silence regular logs
    console.log = function () {};
}

// DeepL API key function removed - now using proxy server
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

// 컨텍스트 메뉴 기능 제거됨 (권한 최소화 및 UX 단순화)

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

// Proxy server configuration
const PROXY_BASE_URL = 'https://drag2ankijpproxy-production.up.railway.app';

// Anki 카드 중복 확인 요청 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Proxy API requests to avoid CORS issues
    if (request.type === 'PROXY_DEEPL') {
        const { text, sourceLanguage } = request;
        const endpoint = sourceLanguage === 'EN' ? '/deepl/translate-english' : '/deepl/translate';
        fetch(`${PROXY_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, result: data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    else if (request.type === 'PROXY_OPENAI') {
        const { prompt_type, messages } = request;
        fetch(`${PROXY_BASE_URL}/openai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt_type, messages })
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, result: data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    // DeepL_TRANSLATE handler removed - now using proxy server directly from content script
    else if (request.type === 'CHECK_DUPLICATE') {
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
                // 요청 필드명을 우선 사용. 모델 필드 조회 시에만 동일 이름(대소문자 무시) 매칭을 시도.
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
                            const matched = modelFields.find(k => k.toLowerCase() === (primaryField || '').toLowerCase());
                            if (!matched) {
                                // 모델에 해당 필드가 없으면, 이 모델 기준으로는 중복이 아님
                                return sendResponse({ success: true, isDuplicate: false });
                            }
                            primaryField = matched; // 동일 이름이 있을 경우만 정규화
                        }
                        console.log('[Drag2Anki/bg] resolved field:', modelName, '->', primaryField);
                    } catch (e) {
                        // 필드 조회 실패 시 요청 필드명을 그대로 사용
                    }
                }
                // 쿼리: (옵션)덱 + (옵션)노트 타입 + 첫 필드 정확 일치 제한
                const deckPart = request.deckName ? `deck:"${request.deckName}" ` : '';
                const modelPart = modelName ? `note:"${modelName}" ` : '';
                const broadQuery = deckPart + modelPart + `field:${primaryField}:"${text}"`;
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
                // 더 이상 broad fallback을 사용하지 않음: 필드 정확 일치만 중복으로 간주
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
                // Detect invalid field/model errors
                const looksLikeFieldError = /(field|fields|required|missing|not\s+found)/i.test(errMsg);
                if (looksLikeFieldError) {
                    const modelName = request.params?.note?.modelName || request.params?.modelName;
                    if (modelName) {
                        return fetch(request.ankiConnectUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'modelFieldNames', version: 6, params: { modelName } })
                        })
                        .then(mr => mr.json())
                        .then(mf => {
                            const modelFields = Array.isArray(mf?.result) ? mf.result : [];
                            return sendResponse({ success: false, invalidFields: true, error: errMsg, modelName, modelFields });
                        })
                        .catch(() => sendResponse({ success: false, invalidFields: true, error: errMsg, modelName }));
                    }
                    return sendResponse({ success: false, invalidFields: true, error: errMsg });
                }
                if (isDup) {
                    // Try to find existing by Front field from params, scoped to target deck if provided
                    const noteObj = request.params?.note || request.params || {};
                    const fields = noteObj.fields || {};
                    const fieldName = Object.keys(fields)[0] || 'Front';
                    const frontText = (fields[fieldName] || '').toString().trim();
                    const deckName = noteObj.deckName || '';
                    const deckPart = deckName ? `deck:"${deckName}" ` : '';
                    const query = deckPart + `"${frontText}"`;
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
                        .then(async (info) => {
                            const res = info.result || [];
                            // filter by exact front equality
                            const equalFront = res.filter(n => {
                                const raw = n.fields?.[fieldName]?.value || '';
                                const plain = raw.replace(/<[^>]*>/g, '').trim();
                                return plain === frontText;
                            });
                            let match = equalFront[0] || res[0] || null;
                            // if deck specified, refine by deck
                            if (match && deckName) {
                                try {
                                    const candidateIds = equalFront.length ? equalFront.map(n => n.noteId || n.id).filter(Boolean) : ids;
                                    if (candidateIds && candidateIds.length) {
                                        const cardIdsRes = await fetch(request.ankiConnectUrl, {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ action: 'findCards', version: 6, params: { query: `nid:${candidateIds.join(' or nid:')}` } })
                                        });
                                        const cardIdsData = await cardIdsRes.json();
                                        const cardIds = cardIdsData.result || [];
                                        if (cardIds.length) {
                                            const cardsInfoRes = await fetch(request.ankiConnectUrl, {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ action: 'cardsInfo', version: 6, params: { cards: cardIds } })
                                            });
                                            const cardsInfoData = await cardsInfoRes.json();
                                            const want = (cardsInfoData.result || []).find(c => (c.deckName || '') === deckName);
                                            if (want) {
                                                const wantId = want.noteId;
                                                const exact = res.find(n => (n.noteId || n.id) === wantId);
                                                if (exact) match = exact;
                                            }
                                        }
                                    }
                                } catch {}
                            }
                            // Resolve back field name case-insensitively; fallback to any non-front field
                let backKey = null;
                if (match && match.fields) {
                    const keys = Object.keys(match.fields);
                    backKey = keys.find(k => k.toLowerCase() === 'back');
                    if (!backKey) backKey = keys.find(k => k !== fieldName);
                }
                let deckNameResolved = '';
                try {
                    const noteId = match ? (match.noteId || match.id) : null;
                    if (noteId) {
                        const cardsRes = await fetch(request.ankiConnectUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'findCards', version: 6, params: { query: `nid:${noteId}` } })
                        });
                        const cardsData = await cardsRes.json();
                        const cardIds = cardsData.result || [];
                        if (cardIds.length) {
                            const cardsInfoRes = await fetch(request.ankiConnectUrl, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'cardsInfo', version: 6, params: { cards: [cardIds[0]] } })
                            });
                            const cardsInfoData = await cardsInfoRes.json();
                            deckNameResolved = (cardsInfoData.result && cardsInfoData.result[0] && cardsInfoData.result[0].deckName) || '';
                        }
                    }
                } catch {}
                const existing = match ? {
                                id: match.noteId || match.id || ids[0],
                                modelName: match.modelName,
                                front: match.fields?.[fieldName]?.value || '',
                                back: (backKey ? (match.fields?.[backKey]?.value || '') : ''),
                                deckName: deckNameResolved || deckName || '알 수 없음'
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
                // 요청 필드명을 우선 사용. 모델 필드 조회 시 동일 이름(대소문자 무시) 매칭만 정규화.
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
                            const matched = modelFields.find(k => k.toLowerCase() === (primaryField || '').toLowerCase());
                            if (!matched) {
                                // 모델에 해당 필드가 없으면 기존 노트 조회 불가
                                sendResponse({ success: true, result: null });
                                return;
                            }
                            primaryField = matched;
                        }
                        console.log('[Drag2Anki/bg] resolved field:', modelName, '->', primaryField);
                    } catch (e) {
                        // ignore, keep requested field name
                    }
                }
                const deckPart = request.deckName ? `deck:"${request.deckName}" ` : '';
                const modelPart = modelName ? `note:"${modelName}" ` : '';
                const query = deckPart + modelPart + `field:${primaryField}:"${text}"`;
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
                // 더 이상 broad fallback을 사용하지 않음: 필드 정확 일치만 조회
                if (!ids.length) {
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT no result');
                    sendResponse({ success: true, result: null });
                    return;
                }
                if (ids.length === 0) {
                    // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT no result');
                    sendResponse({ success: true, result: null });
                    return;
                }
                // 2) notesInfo (해당 덱 우선 매칭)
                const infoRes = await fetch(request.ankiConnectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'notesInfo', version: 6, params: { notes: ids } })
                });
                const infoData = await infoRes.json();
                // 정확히 첫 필드가 일치하는(HTML 제거 후 텍스트 기준) 후보들 필터링
                const target = text;
                const candidates = (infoData.result || []).filter(n => {
                    const fieldKeys = Object.keys(n.fields || {});
                    const resolvedKey = fieldKeys.find(k => k.toLowerCase() === (primaryField || '').toLowerCase()) || primaryField;
                    const raw = n.fields?.[resolvedKey]?.value || '';
                    const plain = raw.replace(/<[^>]*>/g, '').trim();
                    return plain === target;
                });
                let note = candidates[0] || (infoData.result && infoData.result[0]) || null;
                // 덱 지정이 있는 경우, 해당 덱의 노트로 추가 정밀 선택
                if (note && request.deckName) {
                    try {
                        const tmpIds = candidates.length ? candidates.map(n => n.noteId || n.id).filter(Boolean) : ids;
                        if (tmpIds && tmpIds.length) {
                            // 각 노트의 첫 카드로 덱 확인
                            const cardIdsRes = await fetch(request.ankiConnectUrl, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'findCards', version: 6, params: { query: `nid:${tmpIds.join(' or nid:')}` } })
                            });
                            const cardIdsData = await cardIdsRes.json();
                            const cardIds = cardIdsData.result || [];
                            if (cardIds.length) {
                                const cardsInfoRes = await fetch(request.ankiConnectUrl, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'cardsInfo', version: 6, params: { cards: cardIds } })
                                });
                                const cardsInfoData = await cardsInfoRes.json();
                                const match = (cardsInfoData.result || []).find(c => (c.deckName || '') === request.deckName);
                                if (match) {
                                    // 해당 카드의 노트 id로 note 선택
                                    const wantId = match.noteId;
                                    const exact = (infoData.result || []).find(n => (n.noteId || n.id) === wantId);
                                    if (exact) note = exact;
                                }
                            }
                        }
                    } catch (e) {
                        // 덱 해상도 실패 시 최초 후보 유지
                    }
                }
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
                
                // 덱 이름을 가져오기 위해 카드 정보 조회 (지정 덱 우선)
                let deckName = request.deckName || '';
                try {
                    const noteId = note.noteId || note.id || ids[0];
                    const cardsRes = await fetch(request.ankiConnectUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'findCards', version: 6, params: { query: `nid:${noteId}` } })
                    });
                    const cardsData = await cardsRes.json();
                    if (cardsData.result && cardsData.result.length > 0) {
                        const cardId = cardsData.result[0];
                        const cardInfoRes = await fetch(request.ankiConnectUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'cardsInfo', version: 6, params: { cards: [cardId] } })
                        });
                        const cardInfoData = await cardInfoRes.json();
                        if (cardInfoData.result && cardInfoData.result.length > 0) {
                            deckName = cardInfoData.result[0].deckName || '';
                        }
                    }
                } catch (e) {
                    console.warn('[Drag2Anki/bg] Failed to get deck name:', e);
                }
                
                // console.log('[Drag2Anki/bg] GET_EXISTING_BY_FRONT note:', { id: note.noteId || note.id || ids[0], modelName: note.modelName, front, back, deckName });
                sendResponse({
                    success: true,
                    result: {
                        id: note.noteId || note.id || ids[0],
                        modelName: note.modelName,
                        front,
                        back,
                        deckName
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
    else if (request.type === 'GET_MODEL_FIELDS') {
        const modelName = request.modelName;
        if (!modelName) {
            sendResponse({ success: false, error: 'modelName is required' });
            return true;
        }
        fetch(request.ankiConnectUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'modelFieldNames', version: 6, params: { modelName } })
        })
        .then(r => r.json())
        .then(data => {
            if (data && data.error) {
                sendResponse({ success: false, error: data.error });
            } else {
                sendResponse({ success: true, result: Array.isArray(data.result) ? data.result : [] });
            }
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
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

// 웹 요청 인터셉트 (필요시 사용) - 권한이 없으면 등록하지 않음
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
    try {
        chrome.webRequest.onBeforeRequest.addListener(
            (details) => {
                // API 요청 로깅 또는 수정 (디버깅 용도)
                if (details.url.includes('jisho.org') || details.url.includes('openai.com')) {
                    console.log('API 요청:', details.url);
                }
            },
            { urls: ['<all_urls>'] },
            ['requestBody']
        );
    } catch (e) {
        // 권한이 없는 환경에서는 조용히 무시
    }
}

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
