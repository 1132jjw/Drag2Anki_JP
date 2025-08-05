/**
 * 공통 Firebase 설정 및 초기화
 * 모든 사용자가 동일한 Firebase DB에 연결
 */

// Firebase SDK import (npm 패키지에서)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 공통 Firebase 설정 (환경변수에서 가져옴)
const FIREBASE_CONFIG = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Firebase 프로젝트 설정 방법:
// 1. https://console.firebase.google.com/ 에서 새 프로젝트 생성
// 2. Firestore Database 활성화 (테스트 모드로 시작)
// 3. 웹 앱 추가하고 설정 정보 복사
// 4. 위의 FIREBASE_CONFIG 객체에 실제 값들 입력

let firebaseApp = null;
let db = null;

/**
 * Firebase 앱 초기화
 * @returns {Promise<Object>} Firebase 앱 인스턴스
 */
export async function initializeFirebase() {
    if (firebaseApp) {
        return firebaseApp;
    }

    try {
        // Firebase 앱 초기화 (정적 import 사용)
        firebaseApp = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(firebaseApp);
        
        console.log('Firebase 초기화 완료');
        return firebaseApp;
    } catch (error) {
        console.error('Firebase 초기화 실패:', error);
        throw error;
    }
}

/**
 * Firestore DB 인스턴스 반환
 * @returns {Promise<Object>} Firestore DB 인스턴스
 */
export async function getDB() {
    if (!db) {
        await initializeFirebase();
    }
    return db;
}

/**
 * Firebase 연결 상태 확인
 * @returns {boolean} 연결 상태
 */
export function isFirebaseInitialized() {
    return firebaseApp !== null && db !== null;
}
