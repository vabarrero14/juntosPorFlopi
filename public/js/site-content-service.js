// Acceso a la colección "siteContent" de Firestore (textos editables del
// sitio, como la Historia de Flopi).
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

export async function fetchSiteContent(id) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "siteContent", id));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
  };
}

export async function saveSiteContent(id, { title, body }) {
  const { db, doc, setDoc, Timestamp } = await loadFirestore();
  return setDoc(doc(db, "siteContent", id), {
    title,
    body,
    updatedAt: Timestamp.now(),
  });
}
