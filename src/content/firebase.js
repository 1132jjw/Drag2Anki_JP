/**
 * Firebase Firestore를 이용한 한자 정보 저장/조회 모듈 (compat version)
 * 공통 DB에 한자 character와 정보를 저장/조회
 */
import { getDB } from './firebaseConfig.js';

/**
 * 한자 정보를 Firestore에서 조회
 * @param {string} character - 조회할 한자 문자
 * @returns {Promise<Object|null>} 한자 정보 또는 null
 */
export async function getKanjiFromDB(character) {
    try {
        const db = await getDB();
        const docRef = db.collection('kanji').doc(character);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const data = docSnap.data();
            console.log(`한자 DB에서 조회 성공: ${character}`);
            return data.info; // 한자 정보 반환
        } else {
            console.log(`한자 DB에 없음: ${character}`);
            return null;
        }
    } catch (error) {
        console.error('한자 DB 조회 오류:', error);
        return null;
    }
}

/**
 * 한자 정보를 Firestore에 저장
 * @param {string} character - 저장할 한자 문자
 * @param {Object} info - 저장할 한자 정보
 * @returns {Promise<boolean>} 저장 성공 여부
 */
export async function setKanjiToDB(character, info) {
    try {
        const db = await getDB();
        const docRef = db.collection('kanji').doc(character);
        await docRef.set({
            character: character,
            info: info,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        console.log(`한자 DB에 저장 성공: ${character}`);
        return true;
    } catch (error) {
        console.error('한자 DB 저장 오류:', error);
        return false;
    }
}

/**
 * 한자가 DB에 존재하는지 확인
 * @param {string} character - 확인할 한자 문자
 * @returns {Promise<boolean>} 존재 여부
 */
export async function hasKanjiInDB(character) {
    try {
        const db = await getDB();
        const docRef = db.collection('kanji').doc(character);
        const docSnap = await docRef.get();
        return docSnap.exists;
    } catch (error) {
        console.error('한자 DB 존재 확인 오류:', error);
        return false;
    }
}

/**
 * 여러 한자의 정보를 한 번에 조회
 * @param {string[]} characters - 조회할 한자 문자 배열
 * @returns {Promise<Object>} 한자별 정보 객체
 */
export async function getMultipleKanjiFromDB(characters) {
    const results = {};
    try {
        const promises = characters.map(async (character) => {
            const info = await getKanjiFromDB(character);
            return { character, info };
        });
        const kanjiResults = await Promise.all(promises);
        kanjiResults.forEach(({ character, info }) => {
            results[character] = info;
        });
        return results;
    } catch (error) {
        console.error('여러 한자 DB 조회 오류:', error);
        return {};
    }
}

/**
 * DB 연결 테스트
 * @returns {Promise<boolean>} 연결 성공 여부
 */
export async function testDBConnection() {
    try {
        const db = await getDB();
        const testQuery = db.collection('kanji').limit(1);
        await testQuery.get();
        console.log('Firebase DB 연결 테스트 성공');
        return true;
    } catch (error) {
        console.error('Firebase DB 연결 테스트 실패:', error);
        return false;
    }
}

/**
 * 단어 정보를 Firestore에서 조회
 * @param {string} word - 조회할 단어
 * @returns {Promise<Object|null>} 단어 정보 또는 null
 */
export async function getWordFromDB(word) {
    try {
        const db = await getDB();
        const docRef = db.collection('words').doc(word);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const data = docSnap.data();
            console.log(`단어 DB에서 조회 성공: ${word}`);
            return data.info; // 단어 정보 반환
        } else {
            console.log(`단어 DB에 없음: ${word}`);
            return null;
        }
    } catch (error) {
        console.error('단어 DB 조회 오류:', error);
        return null;
    }
}

/**
 * 단어 정보를 Firestore에 저장
 * @param {string} word - 저장할 단어
 * @param {Object} info - 저장할 단어 정보
 * @returns {Promise<boolean>} 저장 성공 여부
 */
export async function setWordToDB(word, info) {
    try {
        const db = await getDB();
        const docRef = db.collection('words').doc(word);
        await docRef.set({
            word: word,
            info: info,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        console.log(`단어 DB에 저장 성공: ${word}`);
        return true;
    } catch (error) {
        console.error('단어 DB 저장 오류:', error);
        return false;
    }
}

/**
 * 단어가 DB에 존재하는지 확인
 * @param {string} word - 확인할 단어
 * @returns {Promise<boolean>} 존재 여부
 */
export async function hasWordInDB(word) {
    try {
        const db = await getDB();
        const docRef = db.collection('words').doc(word);
        const docSnap = await docRef.get();
        return docSnap.exists;
    } catch (error) {
        console.error('단어 DB 존재 확인 오류:', error);
        return false;
    }
}
