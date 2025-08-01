import { handleTextSelection, handleKeyDown, handleDocumentClick, injectStyles, toggleExtension } from '../src/content/dom.js';

// Mock dependencies
jest.mock('../src/content/utils', () => ({
  getSelectedTextWithoutRuby: jest.fn(),
  isJapaneseTextOnly: jest.fn(),
  removeJapaneseParens: jest.fn()
}));

jest.mock('../src/content/popup', () => ({
  showPopup: jest.fn(),
  hidePopup: jest.fn(),
  popup: null
}));

describe('DOM 모듈 테스트', () => {
  let mockSelection, mockRange, mockDocument;

  beforeEach(() => {
    // DOM API mocks
    mockRange = {
      getBoundingClientRect: jest.fn(() => ({
        top: 100,
        left: 200,
        width: 50,
        height: 20
      }))
    };

    mockSelection = {
      rangeCount: 1,
      getRangeAt: jest.fn(() => mockRange)
    };

    // window mock 설정
    Object.defineProperty(global, 'window', {
      value: {
        getSelection: jest.fn(() => mockSelection)
      },
      writable: true
    });

    // document mock 설정
    mockDocument = {
      querySelector: jest.fn(),
      getElementById: jest.fn(),
      createElement: jest.fn(() => ({
        id: '',
        textContent: '',
        appendChild: jest.fn()
      })),
      head: {
        appendChild: jest.fn()
      }
    };
    
    Object.defineProperty(global, 'document', {
      value: mockDocument,
      writable: true
    });

    // Mock 함수들 초기화
    jest.clearAllMocks();
  });

  describe('handleTextSelection', () => {
    const { getSelectedTextWithoutRuby, isJapaneseTextOnly, removeJapaneseParens } = require('../src/content/utils');
    const { showPopup, hidePopup } = require('../src/content/popup');

    test('문자열 인자로 일본어 텍스트를 처리해야 함', () => {
      const searchBox = { getBoundingClientRect: jest.fn(() => ({ top: 0, left: 0 })) };
      global.document.querySelector.mockReturnValue(searchBox);
      isJapaneseTextOnly.mockReturnValue(true);
      removeJapaneseParens.mockReturnValue('日本語');

      handleTextSelection('日本語');

      expect(isJapaneseTextOnly).toHaveBeenCalledWith('日本語');
      expect(removeJapaneseParens).toHaveBeenCalledWith('日本語');
      expect(showPopup).toHaveBeenCalledWith('日本語', { top: 0, left: 0 }, '日本語');
    });

    test('일본어가 아닌 텍스트는 팝업을 숨겨야 함', () => {
      const searchBox = { getBoundingClientRect: jest.fn(() => ({ top: 0, left: 0 })) };
      global.document.querySelector.mockReturnValue(searchBox);
      isJapaneseTextOnly.mockReturnValue(false);

      handleTextSelection('English text');

      expect(hidePopup).toHaveBeenCalled();
      expect(showPopup).not.toHaveBeenCalled();
    });

    test('선택된 텍스트를 처리해야 함', async () => {
      getSelectedTextWithoutRuby.mockReturnValue('日本語');
      isJapaneseTextOnly.mockReturnValue(true);
      removeJapaneseParens.mockReturnValue('日本語');

      // setTimeout을 mock하여 즉시 실행되도록 함
      jest.useFakeTimers();
      
      handleTextSelection();
      
      // 타이머를 진행시켜 setTimeout 콜백 실행
      jest.advanceTimersByTime(20);
      
      expect(getSelectedTextWithoutRuby).toHaveBeenCalled();
      expect(showPopup).toHaveBeenCalledWith('日本語', expect.any(Object), '日本語');
      
      jest.useRealTimers();
    });

    test('선택된 텍스트가 일본어가 아니면 팝업을 숨겨야 함', async () => {
      getSelectedTextWithoutRuby.mockReturnValue('English');
      isJapaneseTextOnly.mockReturnValue(false);

      jest.useFakeTimers();
      
      handleTextSelection();
      
      jest.advanceTimersByTime(20);
      expect(hidePopup).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('handleKeyDown', () => {
    const { hidePopup } = require('../src/content/popup');

    test('Ctrl+Shift+D 키 조합으로 확장 프로그램을 토글해야 함', () => {
      const mockEvent = {
        ctrlKey: true,
        shiftKey: true,
        code: 'KeyD',
        preventDefault: jest.fn()
      };

      console.log = jest.fn();
      handleKeyDown(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Drag2Anki_JP 토글');
    });

    test('Escape 키로 팝업을 숨겨야 함', () => {
      const mockEvent = {
        key: 'Escape',
        ctrlKey: false,
        shiftKey: false
      };

      handleKeyDown(mockEvent);

      expect(hidePopup).toHaveBeenCalled();
    });

    test('다른 키는 무시해야 함', () => {
      const mockEvent = {
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        preventDefault: jest.fn()
      };

      handleKeyDown(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(hidePopup).not.toHaveBeenCalled();
    });
  });

  describe('handleDocumentClick', () => {
    const { hidePopup, popup } = require('../src/content/popup');

    test('팝업 외부 클릭 시 팝업을 숨겨야 함', () => {
      const mockPopup = {
        contains: jest.fn(() => false)
      };
      
      // popup mock 설정
      const popupModule = require('../src/content/popup');
      popupModule.popup = mockPopup;

      const mockEvent = {
        target: document.createElement('div')
      };

      handleDocumentClick(mockEvent);

      expect(mockPopup.contains).toHaveBeenCalledWith(mockEvent.target);
      expect(hidePopup).toHaveBeenCalled();
    });

    test('팝업 내부 클릭 시 팝업을 숨기지 않아야 함', () => {
      const mockPopup = {
        contains: jest.fn(() => true)
      };

      const popupModule = require('../src/content/popup');
      popupModule.popup = mockPopup;

      const mockEvent = {
        target: document.createElement('div')
      };

      handleDocumentClick(mockEvent);

      expect(hidePopup).not.toHaveBeenCalled();
    });
  });

  describe('injectStyles', () => {
    test('스타일을 주입해야 함', () => {
      global.document.getElementById.mockReturnValue(null);
      const mockStyleElement = {
        id: '',
        textContent: ''
      };
      global.document.createElement.mockReturnValue(mockStyleElement);

      injectStyles();

      expect(global.document.createElement).toHaveBeenCalledWith('style');
      expect(mockStyleElement.id).toBe('drag2anki-styles');
      expect(global.document.head.appendChild).toHaveBeenCalledWith(mockStyleElement);
    });

    test('이미 스타일이 주입되어 있으면 다시 주입하지 않아야 함', () => {
      global.document.getElementById.mockReturnValue({}); // 이미 존재함을 시뮬레이션

      injectStyles();

      expect(global.document.createElement).not.toHaveBeenCalled();
      expect(global.document.head.appendChild).not.toHaveBeenCalled();
    });
  });

  describe('toggleExtension', () => {
    test('확장 프로그램 토글 로그를 출력해야 함', () => {
      console.log = jest.fn();

      toggleExtension();

      expect(console.log).toHaveBeenCalledWith('Drag2Anki_JP 토글');
    });
  });
});
