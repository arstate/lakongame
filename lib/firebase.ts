import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Inisialisasi Firebase App
const app = initializeApp(firebaseConfig);

// Inisialisasi Firestore Database
// Catatan: Menggunakan firestoreDatabaseId sesuai konfigurasi set_up_firebase
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Inisialisasi Firebase Auth
export const auth = getAuth(app);
