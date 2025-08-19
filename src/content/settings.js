// settings.js

export let settings = {
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

// 설정 변경 감지
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.drag2anki_settings) {
        const incoming = { ...changes.drag2anki_settings.newValue };
        // 필드 매핑은 항상 기본값 유지
        if (incoming.fieldMapping) delete incoming.fieldMapping;
        // 노트 타입은 항상 Basic 유지
        if (incoming.noteType) delete incoming.noteType;
        settings = { ...settings, ...incoming };
    }
});

export function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['drag2anki_settings'], (result) => {
            if (result.drag2anki_settings) {
                const stored = { ...result.drag2anki_settings };
                // 필드 매핑은 무시하고 기본값 사용
                if (stored.fieldMapping) delete stored.fieldMapping;
                // 노트 타입은 무시하고 기본값(Basic) 사용
                if (stored.noteType) delete stored.noteType;
                settings = { ...settings, ...stored };
            }
            resolve(settings);
        });
    });
}
