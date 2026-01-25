// 1. Importamos las librerías de Firebase desde la web
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; // Para usuarios
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // Para base de datos

// 2. Tu configuración (Copia esto de la consola de Firebase, Paso 2)
// REEMPLAZA ESTOS VALORES CON LOS TUYOS:
  const firebaseConfig = {
    apiKey: "AIzaSyD4k7F1jLKYukV_HuQqCVx2GnYBOxVRbeI",
    authDomain: "pawi11.firebaseapp.com",
    projectId: "pawi11",
    storageBucket: "pawi11.firebasestorage.app",
    messagingSenderId: "734635675020",
    appId: "1:734635675020:web:cef106a0d1c45682655aa9",
    measurementId: "G-YN98G82JHL"
  };

// 3. Inicializar Firebase
const app = initializeApp(firebaseConfig);

// 4. Exportamos las herramientas para usarlas en main.js
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("Firebase conectado exitosamente!");