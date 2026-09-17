// Loader perezoso del SDK de Firebase (Auth + Firestore) para el panel de
// administración. Igual patrón que en public/js/*-service.js: se usa
// import() dinámico para poder mostrar un error si el CDN no carga, en vez
// de que la página se quede colgada.
let modulesPromise;
export function loadAdminFirebase() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../../js/firebase-init.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
    ]).then(([init, authMod, firestoreMod]) => ({
      auth: init.auth,
      db: init.db,
      ...authMod,
      ...firestoreMod,
    }));
  }
  return modulesPromise;
}
