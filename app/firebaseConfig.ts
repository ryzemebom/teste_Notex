// firebaseConfig.ts (na RAIZ do projeto)
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBG7c7AVcv6QjNARDVtnfGOyRYI6AWyZOw",
  authDomain: "notex-ca7c8.firebaseapp.com",
  projectId: "notex-ca7c8",
  storageBucket: "notex-ca7c8.firebasestorage.app",
  messagingSenderId: "92828451541",
  appId: "1:92828451541:web:79fb9b623c0f7d5277d85c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { 
  auth, 
  db,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};