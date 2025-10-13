// Disable verbose logs for production (content script isolated world)
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    console.log = function () {};
}

// Ensure the popup stays fully visible after dynamic height changes (e.g., long messages)
function ensurePopupVisible() {
    if (!popup || !popup.shadowRoot) return;
    const p = popup.shadowRoot.querySelector('.drag2anki-popup');
    if (!p) return;
    const rect = p.getBoundingClientRect();
    const viewportBottom = window.innerHeight;
    const overflowBottom = rect.bottom - viewportBottom + 8; // 8px margin
    if (overflowBottom > 0) {
        // move popup up by the overflow amount
        const currentTop = parseFloat(p.style.top || '0');
        p.style.top = (currentTop - overflowBottom) + 'px';
    }
}

// --- Anki connection diagnosis ---
function testAnkiConnectionClient() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'testAnkiConnection', url: settings.ankiConnectUrl }, (res) => {
            resolve(res || { success: false, error: 'unknown', message: '연결 확인 중 오류가 발생했습니다.' });
        });
    });
}

async function showConnectivityHelp(baseMessage) {
    const diag = await testAnkiConnectionClient();
    if (diag && diag.success) {
        // 연결은 가능한데 다른 오류인 경우
        const msg = baseMessage || '작업 처리 중 오류가 발생했습니다.';
        showSaveError(`${msg}`);
        return;
    }
    const url = settings.ankiConnectUrl;
    const hint = `Anki가 실행 중인지, AnkiConnect 애드온이 설치 및 활성화되었는지 확인해 주세요. 기본 주소는 ${url} 입니다.`;
    const extra = diag && diag.message ? `\n${diag.message}` : '';
    showSaveError(`Anki에 연결할 수 없습니다. ${hint}${extra}`);
}
// anki.js

import { settings } from './settings';
import { isKanaOnly } from './utils';
import { currentWordInfo } from './api';
import { popup } from './popup';
import { showDuplicateModal, hideDuplicateModal } from './popup';

// --- Auto field mapping (per model) ---
const __fieldCache = new Map(); // modelName -> { word, meaning, reading?, kanji? }

async function fetchModelFields(modelName) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'GET_MODEL_FIELDS',
            ankiConnectUrl: settings.ankiConnectUrl,
            modelName
        }, (res) => {
            if (res && res.success && Array.isArray(res.result)) return resolve(res.result);
            resolve([]);
        });
    });
}

function pickByAliases(fields, aliases) {
    // try exact (case-insensitive) alias first, then contains-based
    const lower = fields.map(f => ({ raw: f, low: f.toLowerCase() }));
    for (const a of aliases) {
        const al = a.toLowerCase();
        const hit = lower.find(x => x.low === al);
        if (hit) return hit.raw;
    }
    for (const a of aliases) {
        const al = a.toLowerCase();
        const hit = lower.find(x => x.low.includes(al));
        if (hit) return hit.raw;
    }
    return null;
}

async function resolveFieldMapping(modelName) {
    if (__fieldCache.has(modelName)) return __fieldCache.get(modelName);
    const fields = await fetchModelFields(modelName);
    let word = null, meaning = null, reading = null, kanji = null;
    if (fields.length) {
        word = pickByAliases(fields, ['Front', 'Expression', 'Term', 'Word', 'Vocab', 'Sentence']);
        meaning = pickByAliases(fields, ['Back', 'Meaning', 'Definition', 'Translation', 'Korean', 'English']);
        reading = pickByAliases(fields, ['Reading', 'Furigana', 'Yomi', 'Ruby']);
        kanji = pickByAliases(fields, ['Kanji', 'Character', 'Hanzi']);
        // fallback to first/second if still empty
        if (!word) word = fields[0];
        if (!meaning) meaning = fields[1] || fields[0];
    } else {
        // fallback to settings if model fields couldn't be fetched
        word = settings.fieldMapping.word;
        meaning = settings.fieldMapping.meaning;
        reading = settings.fieldMapping.reading;
        kanji = settings.fieldMapping.kanji;
    }
    const resolved = { word, meaning, reading, kanji };
    __fieldCache.set(modelName, resolved);
    return resolved;
}

// 정확히 일치하는 중복만 검사하는 함수 (background.js에 위임)
export async function checkDuplicateExact(text, fieldNameOverride, deckNameFilter) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'CHECK_DUPLICATE_EXACT',
            ankiConnectUrl: settings.ankiConnectUrl,
            params: { query: `"${text.trim()}"` },
            fieldName: fieldNameOverride || settings.fieldMapping.word,
            modelName: settings.noteType,
            text: text.trim(),
            deckName: deckNameFilter || null
        }, response => {
            console.log('[Drag2Anki] CHECK_DUPLICATE_EXACT response:', response);
            if (response && response.success) {
                resolve(response.isDuplicate);
            } else {
                reject(response ? response.error : 'Anki 중복 검사 오류');
            }
        });
    });
}

async function getExistingByFront(frontText, fieldNameOverride, deckNameFilter) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'GET_EXISTING_BY_FRONT',
            ankiConnectUrl: settings.ankiConnectUrl,
            fieldName: fieldNameOverride || settings.fieldMapping.word,
            modelName: settings.noteType,
            text: frontText.trim(),
            deckName: deckNameFilter || null
        }, response => {
            if (response && response.success) {
                resolve(response.result); // { id, modelName, front, back } | null
            } else {
                reject(response ? response.error : '기존 노트 조회 오류');
            }
        });
    });
}

async function deleteNotes(noteIds) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'DELETE_NOTES',
            ankiConnectUrl: settings.ankiConnectUrl,
            noteIds
        }, response => {
            if (response && response.success) resolve(true);
            else reject(response ? response.error : '노트 삭제 오류');
        });
    });
}

export async function getDeckNames() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'GET_DECK_NAMES',
            ankiConnectUrl: settings.ankiConnectUrl,
            params: {}
        }, response => {
            if (response && response.success) {
                resolve(response.result);
            } else {
                reject(response ? response.error : 'Anki 덱 목록 가져오기 오류');
            }
        });
    });
}

export async function saveToAnki(text, deckName) {
    try {
        const wordInfo = currentWordInfo; // wordInfo 직접 사용
        console.log('저장할 단어 정보:', wordInfo);
        // Resolve model field mapping once
        const modelName = settings.noteType;
        const fmap = await resolveFieldMapping(modelName);

        // Front 정확 일치 중복 체크
        const frontValue = text;
        console.log('[Drag2Anki] saveToAnki frontValue:', frontValue, 'deck:', deckName);
        const isDuplicate = await checkDuplicateExact(frontValue, fmap.word, deckName);
        console.log('[Drag2Anki] isDuplicate(word):', isDuplicate);
        if (isDuplicate) {
            // 기존 노트 정보 조회 시도
            const existing = await getExistingByFront(frontValue, fmap.word, deckName).catch(() => null);
            console.log('[Drag2Anki] existing note (word):', existing);
            if (existing) {
                console.log('[Drag2Anki] showing duplicate modal (pre-check, word) with existing:', existing);
                showDuplicateModal(existing, async () => {
                    console.log('[Drag2Anki] duplicate modal confirm (word)');
                    try {
                        await deleteNotes([existing.id]);
                        console.log('[Drag2Anki] deleted existing note id:', existing.id);
                        const note = createAnkiNote(text, wordInfo, deckName, fmap);
                        console.log('[Drag2Anki] re-adding note:', note);
                        const result = await addNoteToAnki(note);
                        hideDuplicateModal();
                        console.log('[Drag2Anki] addNoteToAnki result:', result);
                        if (result && result.ok) showSaveSuccess(); else if (result && result.duplicate) showSaveError('이미 저장됨'); else showSaveError('카드 저장에 실패했습니다.');
                    } catch (err) {
                        console.error('[Drag2Anki] delete->add failed:', err);
                        hideDuplicateModal();
                        showSaveError('삭제 후 저장 실패');
                    }
                }, () => {
                    console.log('[Drag2Anki] duplicate modal cancel (word)');
                    hideDuplicateModal();
                    showSaveError('이미 저장됨');
                });
                return;
            }
            // existing을 못 찾은 경우: add 시도 후 배경의 duplicate 응답으로 모달 처리 폴백
            const note = createAnkiNote(text, wordInfo, deckName, fmap);
            const addResOnDup = await addNoteToAnki(note).catch(() => null);
            if (addResOnDup && addResOnDup.duplicate) {
                const ex2 = addResOnDup.existing || await getExistingByFront(frontValue, fmap.word, deckName).catch(() => null);
                if (ex2) {
                    showDuplicateModal(ex2, async () => {
                        try {
                            await deleteNotes([ex2.id]);
                            const retry = await addNoteToAnki(note);
                            hideDuplicateModal();
                            if (retry && retry.ok) showSaveSuccess(); else showSaveError('카드 저장에 실패했습니다.');
                        } catch (e) {
                            hideDuplicateModal();
                            showSaveError('삭제 후 저장 실패');
                        }
                    }, () => {
                        hideDuplicateModal();
                        showSaveError('이미 저장됨');
                    });
                    return;
                }
                return showSaveError('이미 저장됨');
            }
            if (addResOnDup && addResOnDup.ok) {
                return showSaveSuccess();
            }
            return showSaveError('이미 Anki에 저장된 단어입니다.');
        }

        // 카드 생성
        const note = createAnkiNote(text, wordInfo, deckName, fmap);
        const addRes = await addNoteToAnki(note);
        console.log('[Drag2Anki] addNoteToAnki result (word):', addRes);

        if (addRes && addRes.ok) {
            showSaveSuccess();
        } else if (addRes && addRes.invalidFields) {
            const model = addRes.modelName || settings.noteType;
            const fields = Array.isArray(addRes.modelFields) ? addRes.modelFields.join(', ') : '알 수 없음';
            showSaveError(`모델(${model})에 필요한 필드가 없습니다. 필드 목록: ${fields}`);
        } else if (addRes && addRes.duplicate) {
            // 사전 중복 체크가 놓친 경우: 배경이 중복 반환 → 모달 띄워서 처리
            try {
                const frontValue = text;
                const existing = addRes.existing || await getExistingByFront(frontValue);
                console.log('[Drag2Anki] existing from add duplicate (word):', existing);
                if (existing) {
                    console.log('[Drag2Anki] showing duplicate modal (post-add, word) with existing:', existing);
                    showDuplicateModal(existing, async () => {
                        console.log('[Drag2Anki] duplicate modal confirm (post-add duplicate, word)');
                        try {
                            await deleteNotes([existing.id]);
                            console.log('[Drag2Anki] deleted existing note id:', existing.id);
                            const retryRes = await addNoteToAnki(note);
                            hideDuplicateModal();
                            console.log('[Drag2Anki] retry add result:', retryRes);
                            if (retryRes && retryRes.ok) showSaveSuccess();
                            else if (retryRes && retryRes.invalidFields) {
                                const model = retryRes.modelName || settings.noteType;
                                const fields = Array.isArray(retryRes.modelFields) ? retryRes.modelFields.join(', ') : '알 수 없음';
                                showSaveError(`모델(${model})에 필요한 필드가 없습니다. 필드 목록: ${fields}`);
                            } else showSaveError('카드 저장에 실패했습니다.');
                        } catch (err) {
                            console.error('[Drag2Anki] delete->retry add failed:', err);
                            hideDuplicateModal();
                            showSaveError('삭제 후 저장 실패');
                        }
                    }, () => {
                        console.log('[Drag2Anki] duplicate modal cancel (post-add duplicate, word)');
                        hideDuplicateModal();
                        showSaveError('이미 저장됨');
                    });
                } else {
                    showSaveError('이미 저장됨');
                }
            } catch (e) {
                console.warn('[Drag2Anki] getExistingByFront after add duplicate failed:', e);
                showSaveError('이미 저장됨');
            }
        } else {
            await showConnectivityHelp('카드 저장에 실패했습니다.');
        }

    } catch (error) {
        console.error('Anki 저장 오류:', error);
        const msg = typeof error === 'string' ? error : (error?.message || '네트워크 오류');
        if (/fetch|network|failed/i.test(msg)) {
            await showConnectivityHelp();
        } else {
            showSaveError('작업 처리 중 오류가 발생했습니다.');
        }
    }
}

export function createAnkiNote(text, wordInfo, deckName, fmapResolved) {
    const fields = {};
    const fmap = fmapResolved || { ...settings.fieldMapping };
    
    // LLM에서 받아온 후리가나와 뜻 사용
    let meaning = '';
    let reading = '';
    
    if (wordInfo.llmMeaning && wordInfo.llmMeaning.meaning) {
        meaning = wordInfo.llmMeaning.meaning;
    }
    
    // 영어가 아닌 경우에만 reading 처리
    const isEnglish = wordInfo.llmMeaning && wordInfo.llmMeaning.language === 'english';
    
    if (!isEnglish) {
        if (wordInfo.llmMeaning && wordInfo.llmMeaning.reading) {
            reading = wordInfo.llmMeaning.reading;
        } else if (wordInfo.jisho && wordInfo.jisho.japanese[0].reading) {
            // LLM에서 후리가나를 받지 못한 경우 Jisho API 사용 (fallback)
            reading = wordInfo.jisho.japanese[0].reading;
        }
        
        if (!isKanaOnly(text) && reading) {
            meaning = reading + '\n\n' + meaning;
        }
    }
    
    fields[fmap.word] = text;
    fields[fmap.meaning] = meaning.replace(/\n/g, '<br>');

    return {
        deckName: deckName,
        modelName: settings.noteType,
        fields: fields,
        options: {
            allowDuplicate: false,
            duplicateScope: 'deck',
            duplicateScopeOptions: { deckName }
        },
        tags: ['drag2anki']
    };
}


export async function addNoteToAnki(note) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'ADD_TO_ANKI',
            ankiConnectUrl: settings.ankiConnectUrl,
            params: { note }
        }, response => {
            // 배경 스크립트가 duplicate 정보를 포함해서 내려줌
            if (response && response.success) {
                return resolve({ ok: true, id: response.result });
            }
            if (response && response.invalidFields) {
                return resolve({ ok: false, invalidFields: true, modelName: response.modelName, modelFields: response.modelFields, error: response.error });
            }
            if (response && response.duplicate) {
                return resolve({ ok: false, duplicate: true, existing: response.existing, error: response.error });
            }
            if (response && response.error) {
                return reject(response.error);
            }
            return reject('Anki 저장 오류');
        });
    });
}

export function showSaveSuccess() {
    if (!popup || !popup.shadowRoot) return;
    const root = popup.shadowRoot;
    const saveBtn = root.querySelector('.save-btn');
    if (saveBtn) {
        const originalBg = saveBtn.style.backgroundColor;
        saveBtn.style.backgroundColor = '#4CAF50';
        setTimeout(() => { saveBtn.style.backgroundColor = originalBg; }, 1200);
    }
    // Show a success message box instead of shrinking into the button
    let msg = root.querySelector('.save-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.className = 'save-msg';
        msg.style.cssText = 'margin-top:8px; white-space:pre-wrap; line-height:1.4; font-size:12px; color:#0a3; background:rgba(10,180,50,0.1); padding:8px 10px; border-radius:6px; max-width:100%; word-break:break-word; border:1px solid rgba(10,180,50,0.3)';
        const footer = root.querySelector('.popup-footer');
        if (footer) footer.appendChild(msg);
    }
    if (msg) {
        msg.textContent = '저장됨!';
        msg.style.display = 'block';
    }
    ensurePopupVisible();
}

export function showSaveError(message) {
    if (!popup || !popup.shadowRoot) return;
    const root = popup.shadowRoot;
    // keep button color feedback briefly
    const saveBtn = root.querySelector('.save-btn');
    if (saveBtn) {
        const originalBg = saveBtn.style.backgroundColor;
        saveBtn.style.backgroundColor = '#f44336';
        setTimeout(() => { saveBtn.style.backgroundColor = originalBg; }, 1200);
    }
    // Render a dedicated message area that can wrap long text
    let msg = root.querySelector('.save-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.className = 'save-msg';
        msg.style.cssText = 'margin-top:8px; white-space:pre-wrap; line-height:1.5; font-size:12px; color:#b00020; background:rgba(244,67,54,0.08); padding:8px 10px; border-radius:6px; max-width:100%; word-break:break-word; border:1px solid rgba(244,67,54,0.25)';
        const footer = root.querySelector('.popup-footer');
        if (footer) footer.appendChild(msg);
    }
    if (msg) {
        msg.textContent = message || '저장 실패';
        msg.style.display = 'block';
    }
    ensurePopupVisible();
}

// Kanji save flow with duplicate handling (modal -> delete -> retry)
export async function saveKanjiToAnki(kanji, btnEl, deckName) {
    try {
        const modelName = settings.noteType;
        const fmap = await resolveFieldMapping(modelName);
        const frontValue = `${kanji.kanji} [한자]`;
        const isDuplicate = await checkDuplicateExact(frontValue, fmap.word, deckName);
        if (isDuplicate) {
            try {
                const existing = await getExistingByFront(frontValue, fmap.word, deckName);
                if (existing) {
                    showDuplicateModal(existing, async () => {
                        try {
                            await deleteNotes([existing.id]);
                            const note = createKanjiAnkiNote(kanji, deckName, fmap);
                            const addRes = await addNoteToAnki(note);
                            if (addRes && addRes.ok) {
                                showKanjiSaveSuccess(btnEl);
                            } else if (addRes && addRes.duplicate) {
                                showKanjiSaveError(btnEl, '이미 저장됨');
                            } else {
                                showKanjiSaveError(btnEl, '저장 실패');
                            }
                        } catch (e) {
                            showKanjiSaveError(btnEl, '삭제 실패');
                        } finally {
                            hideDuplicateModal();
                        }
                    }, () => {
                        hideDuplicateModal();
                        showKanjiSaveError(btnEl, '이미 저장됨');
                    });
                    return;
                }
                return showKanjiSaveError(btnEl, '이미 저장됨');
            } catch (e) {
                return showKanjiSaveError(btnEl, '이미 저장됨');
            }
        }
        // No pre-check duplicate -> try add
        const note = createKanjiAnkiNote(kanji, deckName, fmap);
        const result = await addNoteToAnki(note);
        if (result && result.ok) {
            showKanjiSaveSuccess(btnEl);
            return;
        }
        if (result && result.duplicate) {
            const existing = result.existing || (await getExistingByFront(frontValue, fmap.word, deckName).catch(() => null));
            if (existing) {
                showDuplicateModal(existing, async () => {
                    try {
                        await deleteNotes([existing.id]);
                        const retryNote = createKanjiAnkiNote(kanji, deckName, fmap);
                        const retry = await addNoteToAnki(retryNote);
                        if (retry && retry.ok) {
                            showKanjiSaveSuccess(btnEl);
                        } else {
                            showKanjiSaveError(btnEl, '저장 실패');
                        }
                    } catch (e) {
                        showKanjiSaveError(btnEl, '삭제 실패');
                    } finally {
                        hideDuplicateModal();
                    }
                }, () => {
                    hideDuplicateModal();
                    showKanjiSaveError(btnEl, '이미 저장됨');
                });
                return;
            }
            return showKanjiSaveError(btnEl, '이미 저장됨');
        }
        // 연결 문제 진단 (간단 메시지)
        const diag = await testAnkiConnectionClient();
        if (!diag || !diag.success) {
            showKanjiSaveError(btnEl, 'Anki 연결 실패');
        } else {
            showKanjiSaveError(btnEl, '저장 실패');
        }
    } catch (error) {
        const msg = typeof error === 'string' ? error : (error?.message || '네트워크 오류');
        if (/fetch|network|failed/i.test(msg)) {
            showKanjiSaveError(btnEl, 'Anki 연결 실패');
        } else {
            showKanjiSaveError(btnEl, 'Anki 오류');
        }
    }
}

export function createKanjiAnkiNote(kanji, deckName, fmapResolved) {
    const fields = {};
    const fmap = fmapResolved || { ...settings.fieldMapping };
    // Front: just the kanji + [한자]
    fields[fmap.word] = (kanji.kanji || '').trim() + ' [한자]';

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
    fields[fmap.meaning] = back.replace(/\n/g, '<br>');

    if (fmap.reading) {
        fields[fmap.reading] = (kanji.on_readings?.join(', ') || '') + '<br>' + (kanji.kun_readings?.join(', ') || '');
    }
    if (fmap.kanji) {
        fields[fmap.kanji] = kanji.kanji || '';
    }
    return {
        deckName: deckName,
        modelName: settings.noteType,
        fields: fields,
        options: {
            allowDuplicate: false,
            duplicateScope: 'deck',
            duplicateScopeOptions: { deckName }
        },
        tags: ['drag2anki', 'kanji']
    };
}

export function showKanjiSaveSuccess(btn) {
    const originalText = btn.textContent;
    btn.textContent = '저장됨! [한자]';
    btn.style.backgroundColor = '#4CAF50';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
    }, 2000);
}

export function showKanjiSaveError(btn, message) {
    const originalText = btn.textContent;
    btn.textContent = (message || '저장 실패') + ' [한자]';
    btn.style.backgroundColor = '#f44336';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
    }, 2000);
}
