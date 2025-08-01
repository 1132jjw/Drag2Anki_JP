import { fetchJishoData, fetchKanjiData, fetchLLMMeaning } from '../src/content/api.js';

// Mock dependencies
jest.mock('../src/content/settings', () => ({
  settings: {
    openaiApiKey: 'test-api-key',
    cacheEnabled: true
  }
}));

jest.mock('../src/content/hanja', () => ({
  getHanjaInfo: jest.fn()
}));

jest.mock('../src/content/popup', () => ({
  displayWordInfo: jest.fn(),
  displayError: jest.fn()
}));

global.fetch = jest.fn();

describe('API 모듈 테스트', () => {
  beforeEach(() => {
    fetch.mockClear();
    console.error = jest.fn();
  });

  describe('fetchJishoData', () => {
    test('Jisho API에서 단어 데이터를 가져와야 함', async () => {
      const mockResponse = {
        data: [{
          slug: 'test-word',
          japanese: [{ word: 'テスト', reading: 'てすと' }],
          senses: [{ english_definitions: ['test'] }]
        }]
      };

      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      });

      const result = await fetchJishoData('テスト');

      expect(fetch).toHaveBeenCalledWith(
        'https://drag2ankijpproxy-production.up.railway.app/jisho?word=%E3%83%86%E3%82%B9%E3%83%88'
      );
      expect(result).toEqual(mockResponse.data[0]);
    });

    test('데이터가 없을 때 null을 반환해야 함', async () => {
      const mockResponse = { data: [] };

      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      });

      const result = await fetchJishoData('존재하지않는단어');

      expect(result).toBe(null);
    });
  });

  describe('fetchKanjiData', () => {
    test('한자 데이터를 가져와야 함', async () => {
      const { getHanjaInfo } = require('../src/content/hanja');
      
      const mockKanjiApiResponse = {
        kanji: '日',
        meanings: ['day', 'sun'],
        kun_readings: ['ひ', 'か'],
        on_readings: ['ニチ', 'ジツ']
      };

      const mockHanjaInfo = {
        meaning: '날 일',
        reading: '일'
      };

      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockKanjiApiResponse)
      });

      getHanjaInfo.mockResolvedValueOnce(mockHanjaInfo);

      const result = await fetchKanjiData('日本');

      expect(fetch).toHaveBeenCalledWith('https://kanjiapi.dev/v1/kanji/日');
      expect(getHanjaInfo).toHaveBeenCalledWith('日');
      expect(result).toHaveLength(2); // 日, 本 두 글자
      expect(result[0]).toEqual({
        ...mockKanjiApiResponse,
        korean: mockHanjaInfo
      });
    });

    test('한자가 없는 텍스트는 빈 배열을 반환해야 함', async () => {
      const result = await fetchKanjiData('ひらがな');
      expect(result).toEqual([]);
    });

    test('API 에러 시에도 처리해야 함', async () => {
      fetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await fetchKanjiData('日');

      expect(console.error).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('fetchLLMMeaning', () => {
    test('OpenAI API를 통해 의미를 가져와야 함', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '후리가나: てすと\n뜻:\n명사\n    1. 시험\n    2. 테스트'
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      });

      const result = await fetchLLMMeaning('テスト');

      expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key'
        },
        body: expect.stringContaining('テスト')
      });

      expect(result).toEqual({
        reading: 'てすと',
        meaning: '명사\n    1. 시험\n    2. 테스트'
      });
    });

    test('API 키가 없으면 null을 반환해야 함', async () => {
      // settings mock을 일시적으로 변경
      const { settings } = require('../src/content/settings');
      const originalApiKey = settings.openaiApiKey;
      settings.openaiApiKey = null;

      const result = await fetchLLMMeaning('テスト');

      expect(result).toBe(null);
      expect(fetch).not.toHaveBeenCalled();

      // 원래 값으로 복원
      settings.openaiApiKey = originalApiKey;
    });

    test('후리가나 매칭이 실패해도 처리해야 함', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '뜻: 테스트입니다'
          }
        }]
      };

      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      });

      const result = await fetchLLMMeaning('テスト');

      expect(result).toEqual({
        reading: '',
        meaning: '테스트입니다'
      });
    });
  });
});
