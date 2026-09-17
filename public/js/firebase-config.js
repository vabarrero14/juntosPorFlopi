// Configuración de Firebase para "Juntos por Flopi".
//
// TODO: Reemplazar estos valores por los de tu proyecto real de Firebase.
// Se obtienen en: Firebase Console > Configuración del proyecto >
// "Tus apps" > app web > "Configuración del SDK".
//
// Este archivo se sube al repositorio porque la config de Firebase para
// apps web no es secreta (queda expuesta igual en el navegador); lo que
// protege los datos son las Firestore/Storage Security Rules
// (ver firestore.rules y storage.rules en la raíz del proyecto).
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};
