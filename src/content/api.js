// Disable verbose logs for production (content script isolated world)
const __D2A_SILENCE_LOG__ = true;
if (typeof console !== 'undefined' && __D2A_SILENCE_LOG__) {
    console.log = function () {};
}
// api.js

import { getHanjaInfo } from './hanja';
import { safeValue, tokenize, isSingleWord } from './utils';
import { displayWordInfo, displayError } from './popup';
import { getKanjiFromDB, setKanjiToDB, getWordFromDB, setWordToDB } from './firebase';
import { settings } from './settings';

export let currentWordInfo = null; // 전역 선언

// 캐시 시스템
let cache = new Map();
let CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

export async function fetchJishoData(text) {
    const response = await fetch(`https://drag2ankijpproxy-production.up.railway.app/jisho?word=${encodeURIComponent(text)}`);
    const data = await response.json();
    return data.data[0] || null;
}

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

async function generateFurigana(text) {
    try {
        if (!__kuroshiroInstance) {
            const Kuroshiro = (await import('kuroshiro')).default;
            const KuromojiAnalyzer = (await import('kuroshiro-analyzer-kuromoji')).default;
            __kuroshiroInstance = new Kuroshiro();
            if (!__kuroshiroInitPromise) {
                // In browser/extension, supply dictPath for kuromoji dictionaries via CDN
                __kuroshiroInitPromise = __kuroshiroInstance.init(new KuromojiAnalyzer({
                    dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict'
                }));
            }
            await __kuroshiroInitPromise;
        }
        // 전체 문장도 히라가나로 변환 가능 (단어/문장 공통 처리)
        return await __kuroshiroInstance.convert(text, { to: 'hiragana' });
    } catch (e) {
        console.error('Kuroshiro 초기화/변환 오류:', e);
        return '';
    }
}

async function callLLMForWordMeaning(text) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4.1-2025-04-14',
            messages: [
                {
                    role: 'system',
                    content: `
                    [응답 형식]

                    - 가능한 한 전체 응답이 200 토큰을 넘지 않도록 간결하게 작성
                    - 너무 상세하지 않게 기존의 사전과 비슷한 정보량을 전달하기

                    [출력 포맷 예시]

                    뜻:
                    [품사]
                        1.\t[의미1]
                        2.\t[의미2]
                    …

                    ⸻

                    [예시]
                    입력: 偶然
                    출력:
                    뜻:
                    명사
                        1.\t우연
                        2.\t(철학) ((contingency)) 우연성; 어떤 사물이 인과율에 근거하지 않는 성질

                    부사
                        1.\t뜻하지 않게; 우연히

                    ⸻

                    입력받은 일본어 단어마다 위 형식에 맞춰 답변해 주세요.
                    `,
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            max_tokens: 200
        })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const meaningMatch = content.match(/뜻:\s*([\s\S]*)/);
    const meaning = meaningMatch ? meaningMatch[1].trim() : content;
    return meaning;
}

async function translateWithDeepL(text) {
    const deeplResponse = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`
        },
        body: new URLSearchParams({
            text: text,
            target_lang: 'KO', // 한국어로 번역
            source_lang: 'JA', // 일본어에서
            split_sentences: '1',
            preserve_formatting: '1'
        }).toString()
    });
    const deeplData = await deeplResponse.json();
    const translated = (deeplData && deeplData.translations && deeplData.translations[0] && deeplData.translations[0].text) ? deeplData.translations[0].text : '';
    return translated;
}

export async function fetchLLMMeaning(text) {
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
                return { reading: dbData.reading || reading, meaning: dbData.meaning };
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

        return { reading: reading, meaning: meaning };
    } else {
        // 문장: DeepL 번역 우선, 실패 시 LLM 폴백
        console.log(`문장 번역(DeepL) 시도: ${text}`);
        let meaning = '';
        try {
            meaning = await translateWithDeepL(text);
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
        return { reading: reading, meaning: meaning };
    }
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
            const [jishoResult, llmMeaningResult, kanjiResult] = await Promise.allSettled([
                fetchJishoData(text),
                fetchLLMMeaning(text), // settings 인자 제거
                fetchKanjiData(text)  // settings 인자 제거
            ]);

            console.log('API 요청 결과:', {
                jishoResult,
                llmMeaningResult,
                kanjiResult
            });

            wordInfo = {
                jisho: safeValue(jishoResult),
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