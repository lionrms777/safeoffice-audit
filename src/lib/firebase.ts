import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
import { enableIndexedDbPersistence } from 'firebase/firestore';
// Using the config file provided by the system as the source of truth
console.log('✅ Initializing Firebase with provided config');

const app = initializeApp(firebaseConfig);


// Enable offline persistence for Firestore
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
          console.warn('⚠️ Multiple tabs open - offline persistence disabled');
    } else if (err.code === 'unimplemented') {
          console.warn('⚠️ Browser doesn\'t support offline persistence');
    } else {
          console.log('✅ Offline persistence enabled');
    }
});
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app);

// Enable offline persistence so writes queue locally and sync when back online.
enableMultiTabIndexedDbPersistence(db).catch((error) => {
	const code = typeof error === 'object' && error && 'code' in error
		? String((error as { code?: string }).code || '')
		: '';
	if (code === 'failed-precondition') {
		console.warn('⚠️ Firestore offline persistence not enabled: multiple tabs without shared persistence support.');
	} else if (code === 'unimplemented') {
		console.warn('⚠️ Firestore offline persistence is not available in this browser.');
	} else {
		console.warn('⚠️ Firestore offline persistence setup failed:', error);
	}
});

export default app;
