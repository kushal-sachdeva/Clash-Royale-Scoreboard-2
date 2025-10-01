import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, orderBy, onSnapshot, updateDoc, runTransaction, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5hdA4jTsKwHNUdODJCNRJiys8oEqF4Vs",
  authDomain: "clashscore2-1a7cf.firebaseapp.com",
  projectId: "clashscore2-1a7cf",
  storageBucket: "clashscore2-1a7cf.firebasestorage.app",
  messagingSenderId: "995999444049",
  appId: "1:995999444049:web:9b8758d8db338d909e9c70",
  measurementId: "G-0HS3YCNRW8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export {
  app, auth, db, provider,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  serverTimestamp, doc, setDoc, getDoc, collection, addDoc, getDocs,
  query, where, orderBy, onSnapshot, updateDoc, runTransaction, deleteDoc
};
