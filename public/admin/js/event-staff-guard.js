// Guardia de acceso para el módulo de entradas. A diferencia de
// requireAdmin() (que exige estar en "admins"), acá alcanza con estar en
// "admins" (full access, rol "admin") O en "eventStaff" activo (rol
// "vendedor"/"puerta"). Igual que requireAdmin(), nunca rechaza: ante
// cualquier falla navega de vuelta al login.
import { loadAdminFirebase } from "./firebase-admin.js";

export function requireEventStaff() {
  return new Promise((resolve) => {
    loadAdminFirebase()
      .then((fb) => {
        const { auth, db, doc, getDoc, onAuthStateChanged } = fb;
        onAuthStateChanged(auth, async (user) => {
          if (!user) {
            window.location.href = "../index.html";
            return;
          }
          try {
            const adminSnap = await getDoc(doc(db, "admins", user.email));
            if (adminSnap.exists()) {
              resolve({
                user,
                role: "admin",
                isAdmin: true,
                staff: { email: user.email, ...adminSnap.data() },
                ...fb,
              });
              return;
            }
            const staffSnap = await getDoc(doc(db, "eventStaff", user.email));
            if (staffSnap.exists() && staffSnap.data().active) {
              resolve({
                user,
                role: staffSnap.data().role,
                isAdmin: false,
                staff: { email: user.email, ...staffSnap.data() },
                ...fb,
              });
              return;
            }
            window.location.href = "../index.html";
          } catch (error) {
            console.error("Error verificando acceso de staff:", error);
            window.location.href = "../index.html";
          }
        });
      })
      .catch((error) => {
        console.error("Error cargando Firebase en el panel:", error);
        window.location.href = "../index.html";
      });
  });
}

// Guardia estricta para las pantallas exclusivas de admin dentro del
// módulo (configuración, reportes, personal): si quien entra es
// vendedor/puerta, lo manda de vuelta al inicio del módulo en vez de
// deslogearlo.
export function requireEventAdmin() {
  return new Promise((resolve) => {
    requireEventStaff().then((ctx) => {
      if (!ctx.isAdmin) {
        window.location.href = "index.html";
        return;
      }
      resolve(ctx);
    });
  });
}
