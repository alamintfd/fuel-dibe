import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAcpbZta47s9rpqmge7znYHMWlAqVrmfE0",
  authDomain: "fuel-dibe.firebaseapp.com",
  projectId: "fuel-dibe",
  storageBucket: "fuel-dibe.firebasestorage.app",
  messagingSenderId: "508475473980",
  appId: "1:508475473980:web:3346ed10d44bf8185a8339",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);