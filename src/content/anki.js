// Disable verbose logs for production (content script isolated world)
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    console.log = function () {};
}
// anki.js

import { settings } from './settings';
import { isKanaOnly } from './utils';
import { currentWordInfo } from './api';
import { popup } from './popup';
import { showDuplicateModal, hideDuplicateModal } from './popup';

// 정확히 일치하는 중복만 검사하는 함수 (background.js에 위임)
export async function checkDuplicateExact(text) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'CHECK_DUPLICATE_EXACT',
            ankiConnectUrl: settings.ankiConnectUrl,
            params: { query: `"${text.trim()}"` },
            fieldName: settings.fieldMapping.word,
            modelName: settings.noteType,
            text: text.trim()
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

async function getExistingByFront(frontText) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'GET_EXISTING_BY_FRONT',
            ankiConnectUrl: settings.ankiConnectUrl,
            fieldName: settings.fieldMapping.word,
            modelName: settings.noteType,
            text: frontText.trim()
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

        // Front 정확 일치 중복 체크 (단어는 [단어] 접미사 포함)
        const frontValue = `${text} [단어]`;
        console.log('[Drag2Anki] saveToAnki frontValue:', frontValue, 'deck:', deckName);
        const isDuplicate = await checkDuplicateExact(frontValue);
        console.log('[Drag2Anki] isDuplicate(word):', isDuplicate);
        if (isDuplicate) {
            // 기존 노트 정보 조회 후 모달 표시
            const existing = await getExistingByFront(frontValue);
            console.log('[Drag2Anki] existing note (word):', existing);
            if (existing) {
                console.log('[Drag2Anki] showing duplicate modal (pre-check, word) with existing:', existing);
                showDuplicateModal(existing, async () => {
                    console.log('[Drag2Anki] duplicate modal confirm (word)');
                    try {
                        await deleteNotes([existing.id]);
                        console.log('[Drag2Anki] deleted existing note id:', existing.id);
                        const note = createAnkiNote(text, wordInfo, deckName);
                        console.log('[Drag2Anki] re-adding note:', note);
                        const result = await addNoteToAnki(note);
                        hideDuplicateModal();
                        console.log('[Drag2Anki] addNoteToAnki result:', result);
                        if (result) showSaveSuccess(); else showSaveError('카드 저장에 실패했습니다.');
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
            return showSaveError('이미 Anki에 저장된 단어입니다.');
        }

        // 카드 생성
        const note = createAnkiNote(text, wordInfo, deckName);
        const addRes = await addNoteToAnki(note);
        console.log('[Drag2Anki] addNoteToAnki result (word):', addRes);

        if (addRes && addRes.ok) {
            showSaveSuccess();
        } else if (addRes && addRes.duplicate) {
            // 사전 중복 체크가 놓친 경우: 배경이 중복 반환 → 모달 띄워서 처리
            try {
                const frontValue = `${text} [단어]`;
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
                            if (retryRes && retryRes.ok) showSaveSuccess(); else showSaveError('카드 저장에 실패했습니다.');
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
            showSaveError('카드 저장에 실패했습니다.');
        }

    } catch (error) {
        console.error('Anki 저장 오류:', error);
        showSaveError(typeof error === 'string' ? error : 'Anki 연결에 실패했습니다.');
    }
}

export function createAnkiNote(text, wordInfo, deckName) {
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
        deckName: deckName,
        modelName: settings.noteType,
        fields: fields,
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
    const saveBtn = popup.shadowRoot.querySelector('.save-btn');
    if (!saveBtn) return;

    const originalText = saveBtn.textContent;
    saveBtn.textContent = '저장됨! [단어]';
    saveBtn.style.backgroundColor = '#4CAF50';

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '';
    }, 2000);
}

export function showSaveError(message) {
    if (!popup || !popup.shadowRoot) return;
    const saveBtn = popup.shadowRoot.querySelector('.save-btn');
    if (!saveBtn) return;

    const originalText = saveBtn.textContent;
    saveBtn.textContent = (message || '저장 실패') + ' [단어]';
    saveBtn.style.backgroundColor = '#f44336';

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '';
    }, 2000);
}

// Kanji save flow with duplicate handling (modal -> delete -> retry)
export async function saveKanjiToAnki(kanji, btnEl, deckName) {
    try {
        const frontValue = `${kanji.kanji} [한자]`;
        const isDuplicate = await checkDuplicateExact(frontValue);
        if (isDuplicate) {
            try {
                const existing = await getExistingByFront(frontValue);
                if (existing) {
                    showDuplicateModal(existing, async () => {
                        try {
                            await deleteNotes([existing.id]);
                            const note = createKanjiAnkiNote(kanji, deckName);
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
        const note = createKanjiAnkiNote(kanji, deckName);
        const result = await addNoteToAnki(note);
        if (result && result.ok) {
            showKanjiSaveSuccess(btnEl);
            return;
        }
        if (result && result.duplicate) {
            const existing = result.existing || (await getExistingByFront(frontValue).catch(() => null));
            if (existing) {
                showDuplicateModal(existing, async () => {
                    try {
                        await deleteNotes([existing.id]);
                        const retryNote = createKanjiAnkiNote(kanji, deckName);
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
        showKanjiSaveError(btnEl, '저장 실패');
    } catch (error) {
        showKanjiSaveError(btnEl, 'Anki 오류');
    }
}

export function createKanjiAnkiNote(kanji, deckName) {
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
        deckName: deckName,
        modelName: settings.noteType,
        fields: fields,
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
