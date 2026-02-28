// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: Replace with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyA_W3AnyT17siEgzqon65FjkgyTynFPJq4",
  authDomain: "ai-clinic-management-4acf5.firebaseapp.com",
  projectId: "ai-clinic-management-4acf5",
  storageBucket: "ai-clinic-management-4acf5.firebasestorage.app",
  messagingSenderId: "32883267644",
  appId: "1:32883267644:web:5695eb89de6ade5aa34b39"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
