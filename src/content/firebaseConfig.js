/**
 * 공통 Firebase 설정 및 초기화
 * 모든 사용자가 동일한 Firebase DB에 연결
 */

// Firebase SDK import (compat version for webpack v5)
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// 공통 Firebase 설정 (환경변수에서 가져옴)
const FIREBASE_CONFIG = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

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
        // Firebase 앱 초기화 (compat)
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        } else {
            firebaseApp = firebase.app(); // 이미 초기화된 경우 기존 앱 사용
        }
        db = firebaseApp.firestore();
        
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
