/**
 * Firebase Firestore를 이용한 한자 정보 저장/조회 모듈
 * 공통 DB에 한자 character와 정보를 저장/조회
 */

import { getDB } from './firebaseConfig.js';
import { doc, getDoc, setDoc, collection, limit, getDocs, query } from 'firebase/firestore';

/**
 * 한자 정보를 Firestore에서 조회
 * @param {string} character - 조회할 한자 문자
 * @returns {Promise<Object|null>} 한자 정보 또는 null
 */
export async function getKanjiFromDB(character) {
    try {
        const db = await getDB();
        
        // 'kanji' 컬렉션에서 해당 한자 문서 조회
        const docRef = doc(db, 'kanji', character);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
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
        
        // 'kanji' 컬렉션에 한자 정보 저장
        const docRef = doc(db, 'kanji', character);
        await setDoc(docRef, {
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
        
        const docRef = doc(db, 'kanji', character);
        const docSnap = await getDoc(docRef);
        
        return docSnap.exists();
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
        // 각 한자에 대해 개별 조회 (병렬 처리)
        const promises = characters.map(async (character) => {
            const info = await getKanjiFromDB(character);
            return { character, info };
        });
        
        const kanjiResults = await Promise.all(promises);
        
        // 결과를 객체로 변환
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
        
        // 간단한 테스트 쿼리 실행
        const testQuery = query(collection(db, 'kanji'), limit(1));
        await getDocs(testQuery);
        
        console.log('Firebase DB 연결 테스트 성공');
        return true;
    } catch (error) {
        console.error('Firebase DB 연결 테스트 실패:', error);
        return false;
    }
}
