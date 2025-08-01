import { 
  isKanaOnly, 
  isJapaneseTextOnly, 
  removeJapaneseParens, 
  safeValue 
} from '../src/content/utils.js';

describe('Utils 모듈 테스트', () => {
  describe('isKanaOnly', () => {
    test('히라가나만 포함된 텍스트는 true를 반환해야 함', () => {
      expect(isKanaOnly('ひらがな')).toBe(true);
      expect(isKanaOnly('こんにちは')).toBe(true);
    });

    test('가타카나만 포함된 텍스트는 true를 반환해야 함', () => {
      expect(isKanaOnly('カタカナ')).toBe(true);
      expect(isKanaOnly('コンニチハ')).toBe(true);
    });

    test('히라가나와 가타카나가 혼합된 텍스트는 true를 반환해야 함', () => {
      expect(isKanaOnly('ひらがなカタカナ')).toBe(true);
    });

    test('한자가 포함된 텍스트는 false를 반환해야 함', () => {
      expect(isKanaOnly('日本語')).toBe(false);
      expect(isKanaOnly('ひらがな漢字')).toBe(false);
    });

    test('영어가 포함된 텍스트는 false를 반환해야 함', () => {
      expect(isKanaOnly('hello')).toBe(false);
      expect(isKanaOnly('ひらがなhello')).toBe(false);
    });

    test('빈 문자열은 false를 반환해야 함', () => {
      expect(isKanaOnly('')).toBe(false);
    });
  });

  describe('isJapaneseTextOnly', () => {
    test('일본어 문자만 포함된 텍스트는 true를 반환해야 함', () => {
      expect(isJapaneseTextOnly('日本語')).toBe(true);
      expect(isJapaneseTextOnly('ひらがな')).toBe(true);
      expect(isJapaneseTextOnly('カタカナ')).toBe(true);
      expect(isJapaneseTextOnly('日本語ひらがなカタカナ')).toBe(true);
    });

    test('괄호가 포함된 일본어 텍스트는 true를 반환해야 함', () => {
      expect(isJapaneseTextOnly('生(ま)れる')).toBe(true);
      expect(isJapaneseTextOnly('(日本語)')).toBe(true);
    });

    test('영어가 포함된 텍스트는 false를 반환해야 함', () => {
      expect(isJapaneseTextOnly('Hello日本語')).toBe(false);
      expect(isJapaneseTextOnly('abc')).toBe(false);
    });

    test('숫자가 포함된 텍스트는 false를 반환해야 함', () => {
      expect(isJapaneseTextOnly('日本語123')).toBe(false);
    });

    test('빈 문자열은 false를 반환해야 함', () => {
      expect(isJapaneseTextOnly('')).toBe(false);
    });
  });

  describe('removeJapaneseParens', () => {
    test('괄호를 제거해야 함', () => {
      expect(removeJapaneseParens('生(ま)れる')).toBe('生まれる');
      expect(removeJapaneseParens('(日本語)')).toBe('日本語');
    });

    test('여러 괄호를 모두 제거해야 함', () => {
      expect(removeJapaneseParens('(生)(ま)(れる)')).toBe('生まれる');
    });

    test('괄호가 없는 텍스트는 그대로 반환해야 함', () => {
      expect(removeJapaneseParens('日本語')).toBe('日本語');
      expect(removeJapaneseParens('ひらがな')).toBe('ひらがな');
    });

    test('빈 문자열은 빈 문자열을 반환해야 함', () => {
      expect(removeJapaneseParens('')).toBe('');
    });
  });

  describe('safeValue', () => {
    test('성공적인 데이터는 value를 반환해야 함', () => {
      const data = {
        status: 'fulfilled',
        value: { result: 'test data' }
      };
      expect(safeValue(data)).toEqual({ result: 'test data' });
    });

    test('에러가 있는 데이터는 null을 반환해야 함', () => {
      const data = {
        status: 'fulfilled',
        value: { error: 'some error' }
      };
      expect(safeValue(data)).toBe(null);
    });

    test('실패한 상태의 데이터는 null을 반환해야 함', () => {
      const data = {
        status: 'rejected',
        value: { result: 'test data' }
      };
      expect(safeValue(data)).toBe(null);
    });

    test('null 또는 undefined 데이터는 null을 반환해야 함', () => {
      expect(safeValue(null)).toBe(null);
      expect(safeValue(undefined)).toBe(null);
    });

    test('value가 없는 데이터는 null을 반환해야 함', () => {
      const data = {
        status: 'fulfilled'
      };
      expect(safeValue(data)).toBe(null);
    });
  });
});
