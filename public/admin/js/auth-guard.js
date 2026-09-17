// Guardia de acceso para las páginas internas del panel (todo salvo el
// login). Si no hay sesión, el email no está en la colección "admins", o
// directamente no se pudo cargar Firebase, redirige al login (que ya sabe
// mostrar el estado de error correspondiente). Si todo está bien, resuelve
// con { user, admin, ...fb }.
//
// La promesa deliberadamente nunca rechaza: cualquier falla navega de
// vuelta a index.html en vez de dejar a quien llama con un error sin
// manejar (evita que la página quede rota/en blanco si el CDN de Firebase
// no está disponible).
import { loadAdminFirebase } from "./firebase-admin.js";

export function requireAdmin() {
  return new Promise((resolve) => {
    loadAdminFirebase()
      .then((fb) => {
        const { auth, db, doc, getDoc, onAuthStateChanged } = fb;
        onAuthStateChanged(auth, async (user) => {
          if (!user) {
            window.location.href = "index.html";
            return;
          }
          try {
            const snap = await getDoc(doc(db, "admins", user.email));
            if (!snap.exists()) {
              window.location.href = "index.html";
              return;
            }
            resolve({ user, admin: { email: user.email, ...snap.data() }, ...fb });
          } catch (error) {
            console.error("Error verificando acceso de administrador:", error);
            window.location.href = "index.html";
          }
        });
      })
      .catch((error) => {
        console.error("Error cargando Firebase en el panel:", error);
        window.location.href = "index.html";
      });
  });
}
