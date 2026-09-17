import { loadAdminFirebase } from "./firebase-admin.js";
import { BOOTSTRAP_OWNER_EMAIL } from "./bootstrap-config.js";
import { addAdmin } from "../../js/admins-service.js";

const loadingSection = document.getElementById("loading-section");
const loginSection = document.getElementById("login-section");
const deniedSection = document.getElementById("denied-section");
const deniedEmail = document.getElementById("denied-email");
const deniedHelp = document.getElementById("denied-help");
const errorMessage = document.getElementById("login-error");
const googleBtn = document.getElementById("google-signin-btn");
const signOutBtn = document.getElementById("sign-out-btn");

const bootstrapSection = document.getElementById("bootstrap-section");
const bootstrapBtn = document.getElementById("bootstrap-btn");
const bootstrapError = document.getElementById("bootstrap-error");

function showOnly(section) {
  [loadingSection, loginSection, deniedSection].forEach((el) => {
    el.hidden = el !== section;
  });
}

function showDenied(user) {
  deniedEmail.textContent = user.email;
  const isBootstrapCandidate = user.email === BOOTSTRAP_OWNER_EMAIL;
  bootstrapSection.hidden = !isBootstrapCandidate;
  deniedHelp.hidden = isBootstrapCandidate;
  showOnly(deniedSection);
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

  bootstrapBtn.addEventListener("click", async () => {
    bootstrapError.hidden = true;
    bootstrapBtn.disabled = true;
    bootstrapBtn.textContent = "Registrando…";
    try {
      await addAdmin(BOOTSTRAP_OWNER_EMAIL, "owner");
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Error registrando el primer administrador:", error);
      bootstrapError.textContent = "No pudimos registrarte. Probá de nuevo en unos segundos.";
      bootstrapError.hidden = false;
      bootstrapBtn.disabled = false;
      bootstrapBtn.textContent = "Registrarme como administrador";
    }
  });

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
      showDenied(user);
    } catch (error) {
      console.error("Error verificando acceso:", error);
      showDenied(user);
    }
  });
}

init();
