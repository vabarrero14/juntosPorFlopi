// Acceso a la colección "eventStaff" de Firestore (vendedor/puerta del
// módulo de entradas, identificados por su email, igual patrón que
// "admins"). Ver PROMPT.md para el modelo de datos.
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

export async function fetchEventStaff() {
  const { db, collection, getDocs } = await loadFirestore();
  const snapshot = await getDocs(collection(db, "eventStaff"));
  return snapshot.docs.map((docSnap) => ({ email: docSnap.id, ...docSnap.data() }));
}

export async function getEventStaff(email) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "eventStaff", email));
  return snap.exists() ? { email: snap.id, ...snap.data() } : null;
}

export async function addEventStaff(email, role) {
  const { db, doc, setDoc, serverTimestamp } = await loadFirestore();
  return setDoc(doc(db, "eventStaff", email), { email, role, active: true, createdAt: serverTimestamp() });
}

export async function setEventStaffActive(email, active) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "eventStaff", email), { active });
}

export async function removeEventStaff(email) {
  const { db, doc, deleteDoc } = await loadFirestore();
  return deleteDoc(doc(db, "eventStaff", email));
}
