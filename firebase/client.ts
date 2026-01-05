import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCyD7hmtMf8fma3Yrgg0NOUppbM9IZI478",
    authDomain: "preppilot-47e7e.firebaseapp.com",
    projectId: "preppilot-47e7e",
    storageBucket: "preppilot-47e7e.firebasestorage.app",
    messagingSenderId: "606455459592",
    appId: "1:606455459592:web:0040ac2cc683069a1fc6bd",
    measurementId: "G-NLVQ4D44ZQ",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
