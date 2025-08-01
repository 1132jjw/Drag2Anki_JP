import { loadJpSimpToKrTradDict, loadHanjaDict, getHanjaInfo } from '../src/content/hanja.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Hanja 모듈 테스트', () => {
  beforeEach(() => {
    // 각 테스트 전에 fetch mock을 초기화
    fetch.mockClear();
    // 모듈 캐시 초기화
    jest.resetModules();
  });

  describe('loadJpSimpToKrTradDict', () => {
    test('일본 신자체→한국 정자체 매핑 사전을 로드해야 함', async () => {
      const mockData = { '学': '學', '国': '國' };
      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockData)
      });

      const result = await loadJpSimpToKrTradDict();
      
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test-id/data/jp_simp_to_kr_trad.json');
      expect(result).toEqual(mockData);
    });

    test('이미 로드된 사전은 다시 fetch하지 않아야 함', async () => {
      // 새로운 모듈 인스턴스를 가져와서 캐시 테스트
      const { loadJpSimpToKrTradDict } = await import('../src/content/hanja.js');
      
      const mockData = { '学': '學', '国': '國' };
      fetch.mockResolvedValue({
        json: () => Promise.resolve(mockData)
      });

      // 첫 번째 호출
      const result1 = await loadJpSimpToKrTradDict();
      // 두 번째 호출
      const result2 = await loadJpSimpToKrTradDict();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
    });
  });

  describe('loadHanjaDict', () => {
    test('한자 사전을 로드해야 함', async () => {
      const { loadHanjaDict } = await import('../src/content/hanja.js');
      
      const mockHanjaData = { 
        '學': { meaning: '배울 학', reading: '학' },
        '國': { meaning: '나라 국', reading: '국' }
      };
      const mockMappingData = { '学': '學', '国': '國' };

      fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockHanjaData)
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockMappingData)
        });

      const result = await loadHanjaDict();

      expect(fetch).toHaveBeenNthCalledWith(1, 'chrome-extension://test-id/data/hanja.json');
      expect(fetch).toHaveBeenNthCalledWith(2, 'chrome-extension://test-id/data/jp_simp_to_kr_trad.json');
      expect(result).toEqual(mockHanjaData);
    });
  });

  describe('getHanjaInfo', () => {
    beforeEach(() => {
      // 각 테스트 전에 내부 캐시를 초기화하기 위해 모듈을 다시 로드
      jest.resetModules();
    });

    test('한국 정자체 한자 정보를 반환해야 함', async () => {
      const mockHanjaData = { 
        '學': { meaning: '배울 학', reading: '학' }
      };
      const mockMappingData = { '学': '學' };

      fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockHanjaData)
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockMappingData)
        });

      const { getHanjaInfo } = await import('../src/content/hanja.js');
      const result = await getHanjaInfo('學');

      expect(result).toEqual({ meaning: '배울 학', reading: '학' });
    });

    test('일본 신자체를 한국 정자체로 변환하여 정보를 반환해야 함', async () => {
      const mockHanjaData = { 
        '學': { meaning: '배울 학', reading: '학' }
      };
      const mockMappingData = { '学': '學' };

      fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockHanjaData)
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockMappingData)
        });

      const { getHanjaInfo } = await import('../src/content/hanja.js');
      const result = await getHanjaInfo('学');

      expect(result).toEqual({ meaning: '배울 학', reading: '학' });
    });

    test('존재하지 않는 한자는 null을 반환해야 함', async () => {
      const mockHanjaData = {};
      const mockMappingData = {};

      fetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockHanjaData)
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(mockMappingData)
        });

      const { getHanjaInfo } = await import('../src/content/hanja.js');
      const result = await getHanjaInfo('不存在');

      expect(result).toBe(null);
    });
  });
});
