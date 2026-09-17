import { loadAdminFirebase } from "./firebase-admin.js";

const loadingSection = document.getElementById("loading-section");
const loginSection = document.getElementById("login-section");
const deniedSection = document.getElementById("denied-section");
const deniedEmail = document.getElementById("denied-email");
const errorMessage = document.getElementById("login-error");
const googleBtn = document.getElementById("google-signin-btn");
const signOutBtn = document.getElementById("sign-out-btn");

function showOnly(section) {
  [loadingSection, loginSection, deniedSection].forEach((el) => {
    el.hidden = el !== section;
  });
}

async function init() {
  let fb;
  try {
    fb = await loadAdminFirebase();
  } catch (error) {
    console.error("Error cargando Firebase:", error);
    errorMessage.textContent = "No pudimos cargar Firebase. Revisá tu conexión e intentá de nuevo.";
    errorMessage.hidden = false;
    showOnly(loginSection);
    return;
  }

  const {
    auth,
    db,
    doc,
    getDoc,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
  } = fb;

  googleBtn.addEventListener("click", async () => {
    errorMessage.hidden = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Error al iniciar sesión con Google:", error);
      errorMessage.textContent = "No pudimos iniciar sesión. Probá de nuevo.";
      errorMessage.hidden = false;
    }
  });

  signOutBtn.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showOnly(loginSection);
      return;
    }
    showOnly(loadingSection);
    try {
      const snap = await getDoc(doc(db, "admins", user.email));
      if (snap.exists()) {
        window.location.href = "dashboard.html";
        return;
      }
      deniedEmail.textContent = user.email;
      showOnly(deniedSection);
    } catch (error) {
      console.error("Error verificando acceso:", error);
      deniedEmail.textContent = user.email;
      showOnly(deniedSection);
    }
  });
}

init();
