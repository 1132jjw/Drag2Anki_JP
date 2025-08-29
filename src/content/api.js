// Disable verbose logs for production (content script isolated world)
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    console.log = function () {};
}
// api.js

import { getHanjaInfo } from './hanja';
import { safeValue, tokenize, isSingleWord, getTextLanguage, isEnglishWord } from './utils';
import { displayWordInfo, displayError } from './popup';
import { getKanjiFromDB, setKanjiToDB, getWordFromDB, setWordToDB, getEnglishWordFromDB, setEnglishWordToDB } from './firebase';
import { settings } from './settings';
import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

export let currentWordInfo = null; // 전역 선언

// 캐시 시스템
let cache = new Map();
let CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간


export async function fetchKanjiData(text) {
    const kanjiList = text.match(/[\u4E00-\u9FAF]/g) || [];
    const kanjiData = [];
    
    for (const kanji of kanjiList) {
        console.log(`한자 정보 조회: ${kanji}`);
        let data = {};
        
        // 1. Firebase DB에서 먼저 조회
        try {
            const dbData = await getKanjiFromDB(kanji);
            if (dbData) {
                console.log(`Firebase DB에서 한자 정보 찾음: ${kanji}`);
                kanjiData.push(dbData);
                continue; // DB에 있으면 다음 한자로
            }
        } catch (error) {
            console.error(`Firebase DB 조회 오류 (${kanji}):`, error);
        }
        
        // 2. DB에 없으면 외부 API에서 조회
        try {
            const response = await fetch(`https://kanjiapi.dev/v1/kanji/${kanji}`);
            data = await response.json();
        } catch (error) {
            console.error(`KanjiAPI 조회 오류 (${kanji}):`, error);
        }

        // 3. 한국 한자 정보 추가
        const koreanHanjaInfo = await getHanjaInfo(kanji);
        if (koreanHanjaInfo) {
            data.korean = koreanHanjaInfo;
        } else {
            // 4. LLM에서 한자 설명 받기
            let llmMeaning = null;
            try {
                llmMeaning = await fetchLLMMeaning(kanji);
            } catch (e) {
                llmMeaning = null;
            }
            if (llmMeaning) {
                data.korean = {
                    meaning: llmMeaning.meaning.replace(/\n/g, '<br>') || '(이 한자는 한국에서 사용되지 않습니다.)',
                    reading: '<br>[일본 한자]'
                };
            } else {
                data.korean = {
                    meaning: '(이 한자는 한국에서 사용되지 않습니다.)',
                    reading: '<br>[일본 한자]'
                };
            }
        }

        kanjiData.push(data);
        
        // 5. 새로 조회한 데이터를 Firebase DB에 비동기로 저장
        try {
            await setKanjiToDB(kanji, data);
            console.log(`Firebase DB에 한자 정보 저장: ${kanji}`);
        } catch (error) {
            console.error(`Firebase DB 저장 오류 (${kanji}):`, error);
        }
    }

    return kanjiData;
}

// ----- Helpers: Furigana, LLM (word), DeepL (sentence) -----
let __kuroshiroInstance = null;
let __kuroshiroInitPromise = null;

// Proxy server configuration
// const PROXY_BASE_URL = 'http://localhost:3001';
const PROXY_BASE_URL = 'https://drag2ankijpproxy-production.up.railway.app';
// For production, use: 'https://drag2ankijpproxy-production.up.railway.app'

async function generateFurigana(text) {
    try {
        if (!__kuroshiroInstance) {
            __kuroshiroInstance = new Kuroshiro();
            if (!__kuroshiroInitPromise) {
                // In Chrome extension, load kuromoji dictionaries from packaged resources
                const dictBase = (typeof chrome !== 'undefined' && chrome?.runtime?.getURL)
                    ? chrome.runtime.getURL('dict')
                    : '/dict';
                __kuroshiroInitPromise = __kuroshiroInstance.init(new KuromojiAnalyzer({
                    dictPath: dictBase
                }));
            }
            await __kuroshiroInitPromise;
        }
        // Convert to HTML with ruby annotations (furigana)
        return await __kuroshiroInstance.convert(text, { 
            to: 'hiragana',
            mode: 'furigana',
            romajiSystem: 'hepburn',
            delimiter_start: '<ruby>',
            delimiter_end: '</ruby>',
            separator: '<rt>',
            fallback: (char, options) => {
                // For characters that can't be converted, just return the character
                return char;
            }
        });
    } catch (e) {
        console.error('Kuroshiro 초기화/변환 오류:', e);
        // Return original text if conversion fails
        return text;
    }
}

// LLM 호출 함수 (일본어 단어 의미 조회용)
async function callLLMForWordMeaning(text) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'PROXY_OPENAI',
            prompt_type: 'word_meaning',
            messages: [
                {
                    role: 'user',
                    content: text
                }
            ]
        }, response => {
            if (response && response.success) {
                const data = response.result;
                console.log('일본어 LLM API 응답:', data);
                
                if (data.error) {
                    reject(new Error(`OpenAI API Error: ${data.error.message}`));
                    return;
                }
                
                if (data.status === 'error') {
                    reject(new Error(`Proxy Server Error ${data.code}: ${data.message}`));
                    return;
                }
                
                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    console.error('LLM API response structure:', data);
                    reject(new Error('Invalid API response structure'));
                    return;
                }
                
                resolve(data.choices[0].message.content.trim());
            } else {
                reject(new Error(response ? response.error : '일본어 LLM API 호출 오류'));
            }
        });
    });
}

// LLM 호출 함수 (영어 단어 의미 조회용)
async function callLLMForEnglishWordMeaning(text) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'PROXY_OPENAI',
            prompt_type: 'english_word_meaning',
            messages: [
                {
                    role: 'user',
                    content: text
                }
            ]
        }, response => {
            if (response && response.success) {
                const data = response.result;
                console.log('영어 LLM API 응답:', data);
                
                if (data.error) {
                    reject(new Error(`OpenAI API Error: ${data.error.message}`));
                    return;
                }
                
                if (data.status === 'error') {
                    reject(new Error(`Proxy Server Error ${data.code}: ${data.message}`));
                    return;
                }
                
                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    console.error('LLM API response structure:', data);
                    reject(new Error('Invalid API response structure'));
                    return;
                }
                
                resolve(data.choices[0].message.content.trim());
            } else {
                reject(new Error(response ? response.error : '영어 LLM API 호출 오류'));
            }
        });
    });
}

async function translateWithDeepL(text, sourceLanguage = 'JA') {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'PROXY_DEEPL',
            text: text,
            sourceLanguage: sourceLanguage
        }, response => {
            if (response && response.success) {
                const data = response.result;
                console.log('DeepL API 응답:', data);
                
                if (data.error) {
                    reject(new Error(`DeepL API Error: ${data.error.message}`));
                    return;
                }
                
                if (data.status === 'error') {
                    reject(new Error(`Proxy Server Error ${data.code}: ${data.message}`));
                    return;
                }
                
                // DeepL 프록시 응답 구조 확인: data.data.translations 또는 data.translations
                const translations = data.data?.translations || data.translations;
                if (!translations || !translations[0] || !translations[0].text) {
                    console.error('DeepL API response structure:', data);
                    reject(new Error('Invalid API response structure'));
                    return;
                }
                
                resolve(translations[0].text);
            } else {
                reject(new Error(response ? response.error : 'DeepL API 호출 오류'));
            }
        });
    });
}

export async function fetchLLMMeaning(text) {
    const language = getTextLanguage(text);
    
    // 영어 텍스트인 경우
    if (language === 'english') {
        const isWord = isEnglishWord(text);
        
        if (isWord) {
            // 영어 단어: Firebase에서 먼저 조회, 없으면 GPT로 사전 형식 제공
            console.log(`영어 단어 의미 조회: ${text}`);
            
            // 1. Firebase에서 먼저 조회
            let meaning = await getEnglishWordFromDB(text);
            
            if (meaning) {
                console.log(`영어 단어 DB에서 조회 성공: ${text}`);
                return { reading: text, meaning: meaning, language: 'english' };
            }
            
            // 2. DB에 없으면 GPT로 조회
            console.log(`영어 단어 GPT 조회: ${text}`);
            try {
                meaning = await callLLMForEnglishWordMeaning(text);
                
                // 3. GPT 결과를 Firebase에 저장
                if (meaning) {
                    await setEnglishWordToDB(text, meaning);
                }
            } catch (e) {
                console.error('LLM 영어 단어 의미 조회 오류:', e);
                // 폴백으로 DeepL 사용
                try {
                    meaning = await translateWithDeepL(text, 'EN');
                } catch (deeplError) {
                    console.error('DeepL 폴백 오류:', deeplError);
                }
            }
            return { reading: text, meaning: meaning, language: 'english' };
        } else {
            // 영어 문장: DeepL로 번역
            console.log(`영어 문장 번역(DeepL): ${text}`);
            let meaning = '';
            try {
                meaning = await translateWithDeepL(text, 'EN');
            } catch (deeplError) {
                console.error('DeepL 영어 번역 오류:', deeplError);
                // 폴백으로 GPT 사용
                try {
                    meaning = await callLLMForEnglishWordMeaning(text);
                } catch (e) {
                    console.error('LLM 폴백 오류:', e);
                }
            }
            return { reading: text, meaning: meaning, language: 'english' };
        }
    }
    
    // 일본어 텍스트인 경우 (기존 로직)
    if (language === 'japanese') {
        const tokens = await tokenize(text);
        const isWord = isSingleWord(tokens);

        // 1) 항상 먼저 후리가나 생성
        const reading = await generateFurigana(text);

        // 2) 분기: 단어 vs 문장
        if (isWord) {
            // 2-1) 캐시(DB) 먼저 확인
            try {
                const dbData = await getWordFromDB(text);
                if (dbData) {
                    console.log(`Firebase DB에서 단어 정보 찾음: ${text}`);
                    // DB의 reading이 없다면 이번에 생성한 reading을 보강해서 반환
                    return { reading: dbData.reading || reading, meaning: dbData.meaning, language: 'japanese' };
                }
            } catch (error) {
                console.error(`Firebase DB 조회 오류 (${text}):`, error);
            }

            // 2-2) LLM에서 뜻 받아오기
            let meaning = '';
            try {
                meaning = await callLLMForWordMeaning(text);
            } catch (e) {
                console.error('LLM 의미 조회 오류:', e);
                meaning = '';
            }

            // 2-3) DB 저장 (reading은 Kuroshiro 결과 사용)
            try {
                await setWordToDB(text, { reading: reading, meaning: meaning });
                console.log(`Firebase DB에 단어 정보 저장: ${text}`);
            } catch (error) {
                console.error(`Firebase DB 저장 오류 (${text}):`, error);
            }

            return { reading: reading, meaning: meaning, language: 'japanese' };
        } else {
            // 문장: DeepL 번역 우선, 실패 시 LLM 폴백
            console.log(`문장 번역(DeepL) 시도: ${text}`);
            let meaning = '';
            try {
                meaning = await translateWithDeepL(text, 'JA');
            } catch (deeplError) {
                console.error('DeepL 번역 오류:', deeplError);
            }
            if (!meaning) {
                try {
                    meaning = await callLLMForWordMeaning(text);
                } catch (e) {
                    console.error('LLM 폴백 오류:', e);
                }
            }
            return { reading: reading, meaning: meaning, language: 'japanese' };
        }
    }
    
    // 알 수 없는 언어인 경우
    return { reading: text, meaning: '지원하지 않는 언어입니다.', language: 'unknown' };
}

export async function loadWordInfo(text) {
    try {
        const cacheKey = text;
        let wordInfo = null;

        // 캐시 확인
        if (settings.cacheEnabled && cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_DURATION) {
                wordInfo = cached.data;
            }
        }

        if (!wordInfo) {
            // API 요청
            const [llmMeaningResult, kanjiResult] = await Promise.allSettled([
                fetchLLMMeaning(text), // settings 인자 제거
                fetchKanjiData(text)  // settings 인자 제거
            ]);

            console.log('API 요청 결과:', {
                llmMeaningResult,
                kanjiResult
            });

            wordInfo = {
                llmMeaning: safeValue(llmMeaningResult),
                kanji: safeValue(kanjiResult)
            };

            console.log('단어 정보:', wordInfo);

            // 캐시 저장
            if (settings.cacheEnabled) {
                cache.set(cacheKey, {
                    data: wordInfo,
                    timestamp: Date.now()
                });
            }
        }

        currentWordInfo = wordInfo; // wordInfo 저장
        displayWordInfo(wordInfo);

    } catch (error) {
        console.error('단어 정보 로드 오류:', error);
        displayError('정보를 불러오는 중 오류가 발생했습니다.');
    }
}