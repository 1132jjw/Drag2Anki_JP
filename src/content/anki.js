// anki.js

import { settings } from './settings';
import { isKanaOnly } from './utils';
import { currentWordInfo } from './api';
import { popup } from './popup';

// 정확히 일치하는 중복만 검사하는 함수 (background.js에 위임)
export async function checkDuplicateExact(text) {
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

export async function saveToAnki(text) {
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

export function createAnkiNote(text, wordInfo) {
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


export async function addNoteToAnki(note) {
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

export function showSaveSuccess() {
    const saveBtn = popup.querySelector('.save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '저장됨! [단어]';
    saveBtn.style.backgroundColor = '#4CAF50';

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '';
    }, 2000);
}

export function showSaveError(message) {
    const saveBtn = popup.querySelector('.save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = (message || '저장 실패') + ' [단어]';
    saveBtn.style.backgroundColor = '#f44336';

    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '';
    }, 2000);
}

export async function saveKanjiToAnki(kanji, btnEl) {
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

export function createKanjiAnkiNote(kanji) {
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
