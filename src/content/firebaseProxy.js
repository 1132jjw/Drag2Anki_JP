/**
 * Firebase Proxy API 클라이언트
 * Firebase에 직접 접근하는 대신 proxy 서버를 통해 접근
 */

// Proxy 서버 URL 설정
// Railway 배포 URL
const PROXY_BASE_URL = 'https://drag2ankijpproxy-production.up.railway.app';

// 로컬 개발용으로 변경하려면 아래 주석을 해제하세요
// const PROXY_BASE_URL = 'http://localhost:3001';

/**
 * 한자 정보를 proxy를 통해 조회
 * @param {string} character - 조회할 한자 문자
 * @returns {Promise<Object|null>} 한자 정보 또는 null
 */
export async function getKanjiFromDB(character) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/kanji/${encodeURIComponent(character)}`);
        const result = await response.json();
        
        if (result.success) {
            if (result.data) {
                console.log(`한자 DB에서 조회 성공: ${character}`);
                return result.data;
            } else {
                console.log(`한자 DB에 없음: ${character}`);
                return null;
            }
        } else {
            console.error('한자 DB 조회 오류:', result.error);
            return null;
        }
    } catch (error) {
        console.error('한자 DB 조회 네트워크 오류:', error);
        return null;
    }
}

/**
 * 한자 정보를 proxy를 통해 저장
 * @param {string} character - 저장할 한자 문자
 * @param {Object} info - 저장할 한자 정보
 * @returns {Promise<boolean>} 저장 성공 여부
 */
export async function setKanjiToDB(character, info) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/kanji`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                character: character,
                info: info
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`한자 DB에 저장 성공: ${character}`);
            return true;
        } else {
            console.error('한자 DB 저장 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('한자 DB 저장 네트워크 오류:', error);
        return false;
    }
}

/**
 * 한자가 DB에 존재하는지 proxy를 통해 확인
 * @param {string} character - 확인할 한자 문자
 * @returns {Promise<boolean>} 존재 여부
 */
export async function hasKanjiInDB(character) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/kanji/${encodeURIComponent(character)}/exists`);
        const result = await response.json();
        
        if (result.success) {
            return result.exists;
        } else {
            console.error('한자 DB 존재 확인 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('한자 DB 존재 확인 네트워크 오류:', error);
        return false;
    }
}

/**
 * 여러 한자의 정보를 proxy를 통해 한 번에 조회
 * @param {string[]} characters - 조회할 한자 문자 배열
 * @returns {Promise<Object>} 한자별 정보 객체
 */
export async function getMultipleKanjiFromDB(characters) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/kanji/multiple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characters: characters
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            console.error('여러 한자 DB 조회 오류:', result.error);
            return {};
        }
    } catch (error) {
        console.error('여러 한자 DB 조회 네트워크 오류:', error);
        return {};
    }
}

/**
 * 단어 정보를 proxy를 통해 조회
 * @param {string} word - 조회할 단어
 * @returns {Promise<Object|null>} 단어 정보 또는 null
 */
export async function getWordFromDB(word) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/words/${encodeURIComponent(word)}`);
        const result = await response.json();
        
        if (result.success) {
            if (result.data) {
                console.log(`단어 DB에서 조회 성공: ${word}`);
                return result.data;
            } else {
                console.log(`단어 DB에 없음: ${word}`);
                return null;
            }
        } else {
            console.error('단어 DB 조회 오류:', result.error);
            return null;
        }
    } catch (error) {
        console.error('단어 DB 조회 네트워크 오류:', error);
        return null;
    }
}

/**
 * 단어 정보를 proxy를 통해 저장
 * @param {string} word - 저장할 단어
 * @param {Object} info - 저장할 단어 정보
 * @returns {Promise<boolean>} 저장 성공 여부
 */
export async function setWordToDB(word, info) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/words`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                word: word,
                info: info
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`단어 DB에 저장 성공: ${word}`);
            return true;
        } else {
            console.error('단어 DB 저장 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('단어 DB 저장 네트워크 오류:', error);
        return false;
    }
}

/**
 * 단어가 DB에 존재하는지 proxy를 통해 확인
 * @param {string} word - 확인할 단어
 * @returns {Promise<boolean>} 존재 여부
 */
export async function hasWordInDB(word) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/words/${encodeURIComponent(word)}/exists`);
        const result = await response.json();
        
        if (result.success) {
            return result.exists;
        } else {
            console.error('단어 DB 존재 확인 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('단어 DB 존재 확인 네트워크 오류:', error);
        return false;
    }
}

/**
 * 영어 단어 정보를 proxy를 통해 조회
 * @param {string} word - 조회할 영어 단어
 * @returns {Promise<Object|null>} 영어 단어 정보 또는 null
 */
export async function getEnglishWordFromDB(word) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/english-words/${encodeURIComponent(word)}`);
        const result = await response.json();
        
        if (result.success) {
            if (result.data) {
                console.log(`영어 단어 DB에서 조회 성공: ${word}`);
                return result.data;
            } else {
                console.log(`영어 단어 DB에 없음: ${word}`);
                return null;
            }
        } else {
            console.error('영어 단어 DB 조회 오류:', result.error);
            return null;
        }
    } catch (error) {
        console.error('영어 단어 DB 조회 네트워크 오류:', error);
        return null;
    }
}

/**
 * 영어 단어 정보를 proxy를 통해 저장
 * @param {string} word - 저장할 영어 단어
 * @param {Object} info - 저장할 영어 단어 정보
 * @returns {Promise<boolean>} 저장 성공 여부
 */
export async function setEnglishWordToDB(word, info) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/english-words`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                word: word,
                info: info
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`영어 단어 DB에 저장 성공: ${word}`);
            return true;
        } else {
            console.error('영어 단어 DB 저장 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('영어 단어 DB 저장 네트워크 오류:', error);
        return false;
    }
}

/**
 * 영어 단어가 DB에 존재하는지 proxy를 통해 확인
 * @param {string} word - 확인할 영어 단어
 * @returns {Promise<boolean>} 존재 여부
 */
export async function hasEnglishWordInDB(word) {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/english-words/${encodeURIComponent(word)}/exists`);
        const result = await response.json();
        
        if (result.success) {
            return result.exists;
        } else {
            console.error('영어 단어 DB 존재 확인 오류:', result.error);
            return false;
        }
    } catch (error) {
        console.error('영어 단어 DB 존재 확인 네트워크 오류:', error);
        return false;
    }
}

/**
 * DB 연결 테스트를 proxy를 통해 수행
 * @returns {Promise<boolean>} 연결 성공 여부
 */
export async function testDBConnection() {
    try {
        const response = await fetch(`${PROXY_BASE_URL}/firebase/test`);
        const result = await response.json();
        
        if (result.success) {
            console.log('Firebase DB 연결 테스트 성공 (via proxy)');
            return true;
        } else {
            console.error('Firebase DB 연결 테스트 실패 (via proxy):', result.error);
            return false;
        }
    } catch (error) {
        console.error('Firebase DB 연결 테스트 네트워크 오류:', error);
        return false;
    }
}
