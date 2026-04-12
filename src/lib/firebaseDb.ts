import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { db } from './firebase';
import { Audit } from '../types';

const COLLECTION_NAME = 'audits';

export const saveAuditToFirebase = async (audit: Audit) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, audit.id);
    await setDoc(docRef, {
      ...audit,
      updatedAt: new Date().toISOString()
    });
    console.log('✅ Audit saved to Firestore:', audit.id);
  } catch (error) {
    console.error('❌ Error saving audit:', error);
    throw error;
  }
};

export const getAuditFromFirebase = async (id: string) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Audit;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting audit:', error);
    throw error;
  }
};

export const getUserAuditsFromFirebase = async (userId: string) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Audit);
  } catch (error) {
    console.error('❌ Error getting user audits:', error);
    throw error;
  }
};

export const deleteAuditFromFirebase = async (id: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    console.log('✅ Audit deleted from Firestore:', id);
  } catch (error) {
    console.error('❌ Error deleting audit:', error);
    throw error;
  }
};

// Connection test as per critical directive
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('✅ Firestore connection verified');
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("❌ Please check your Firebase configuration. The client is offline.");
    }
  }
}
