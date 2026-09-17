import { FirebaseApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyBU3-cw0qcH02bMuzK8k5vtJHpSRft_VtQ',
  authDomain: 'crudpmovil.firebaseapp.com',
  databaseURL: 'https://crudpmovil-default-rtdb.firebaseio.com',
  projectId: 'crudpmovil',
  storageBucket: 'crudpmovil.firebasestorage.app',
  messagingSenderId: '902020735158',
  appId: '1:902020735158:web:45400a8e10ca7311c58617',
  measurementId: 'G-Y938NPMHDC'
};

export const firebaseApp: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
