import { loadSettings } from './settings';
import { handleTextSelection, handleKeyDown, handleDocumentClick, injectStyles } from './dom';
import { startSearchBoxMonitor } from './googleSearch';

async function init() {
    const settings = await loadSettings();
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    injectStyles();

    if (settings.googleSearchTranslate) {
        startSearchBoxMonitor();
    }
}

init();
