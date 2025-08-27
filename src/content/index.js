/* global __webpack_public_path__ */
// Ensure async chunks load from extension URL, not the page origin
try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
        // e.g., chrome-extension://<id>/
        __webpack_public_path__ = chrome.runtime.getURL('');
    }
} catch (e) {
    // ignore
}

// Minimal process shim for browser (some deps reference process)
if (typeof window !== 'undefined' && typeof window.process === 'undefined') {
    window.process = { env: {} };
}

// Disable verbose logs for production (content script isolated world)
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    console.log = function () {};
}
import { loadSettings } from './settings';
import { handleTextSelection, handleKeyDown, handleDocumentClick, injectStyles } from './dom';
import { startSearchBoxMonitor } from './googleSearch';
import { initializeFirebase } from './firebaseConfig';

async function init() {
    const settings = await loadSettings();
    
    // Firebase 초기화 (비동기로 실행, 실패해도 다른 기능에 영향 없음)
    try {
        await initializeFirebase();
        console.log('Firebase 초기화 완료');
    } catch (error) {
        console.warn('Firebase 초기화 실패 (DB 기능 비활성화):', error);
    }
    
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    injectStyles();

    if (settings.googleSearchTranslate) {
        startSearchBoxMonitor();
    }
}

init();
