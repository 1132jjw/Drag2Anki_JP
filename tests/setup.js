// Jest 테스트 환경 설정 (Node 환경)
global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`)
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};

// DOM API 모킹
global.fetch = jest.fn();

// Window 객체 모킹
global.window = {
  getSelection: jest.fn(() => ({
    rangeCount: 1,
    getRangeAt: jest.fn(() => ({
      getBoundingClientRect: jest.fn(() => ({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0
      }))
    })),
    toString: jest.fn(() => '')
  }))
};

// Document 객체 모킹
global.document = {
  querySelector: jest.fn(),
  getElementById: jest.fn(),
  createElement: jest.fn(() => ({
    id: '',
    textContent: '',
    appendChild: jest.fn()
  })),
  head: {
    appendChild: jest.fn()
  },
  createDocumentFragment: jest.fn(() => ({
    appendChild: jest.fn(),
    textContent: ''
  }))
};

// Range API 모킹
global.Range = class Range {
  constructor() {
    this.startContainer = null;
    this.endContainer = null;
    this.startOffset = 0;
    this.endOffset = 0;
  }
  
  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0
    };
  }
  
  cloneContents() {
    return global.document.createDocumentFragment();
  }
};

// 콘솔 에러 억제 (테스트 중 불필요한 로그 방지)
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  error: jest.fn(),
  warn: jest.fn(),
  log: originalConsole.log // 일반 로그는 유지
};
