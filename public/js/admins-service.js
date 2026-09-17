// Acceso a la colección "admins" de Firestore (administradores del panel,
// identificados por su email). Ver PROMPT.md para el modelo de datos.
let firestoreModulesPromise;
function loadFirestore() {
  if (!firestoreModulesPromise) {
    firestoreModulesPromise = Promise.all([
      import("./firebase-init.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
    ]).then(([{ db }, firestore]) => ({ db, ...firestore }));
  }
  return firestoreModulesPromise;
}

export async function fetchAdmins() {
  const { db, collection, getDocs } = await loadFirestore();
  const snapshot = await getDocs(collection(db, "admins"));
  return snapshot.docs.map((docSnap) => ({ email: docSnap.id, ...docSnap.data() }));
}

export async function getAdmin(email) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "admins", email));
  return snap.exists() ? { email: snap.id, ...snap.data() } : null;
}

export async function addAdmin(email, role) {
  const { db, doc, setDoc } = await loadFirestore();
  return setDoc(doc(db, "admins", email), { email, role });
}

export async function removeAdmin(email) {
  const { db, doc, deleteDoc } = await loadFirestore();
  return deleteDoc(doc(db, "admins", email));
}
