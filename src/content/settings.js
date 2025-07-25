// settings.js

export let settings = {
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

// 설정 변경 감지
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.drag2anki_settings) {
        settings = { ...settings, ...changes.drag2anki_settings.newValue };
    }
});

export function loadSettings() {
    chrome.storage.sync.get(['drag2anki_settings'], (result) => {
        if (result.drag2anki_settings) {
            settings = { ...settings, ...result.drag2anki_settings };
        }
    });
}
