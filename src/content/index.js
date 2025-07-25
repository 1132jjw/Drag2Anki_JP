import { loadSettings } from './settings';
import { handleTextSelection, handleKeyDown, handleDocumentClick, injectStyles } from './dom';

function init() {
    loadSettings();
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    injectStyles();
}

init();
