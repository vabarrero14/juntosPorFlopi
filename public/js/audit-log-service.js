// Acceso a la colección "auditLog" (quién, qué y cuándo). Create-only:
// nadie, ni un admin, puede editar o borrar un registro ya creado.
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

export async function logAction({ actorUid, actorEmail, action, entityType, entityId, details }) {
  const { db, collection, doc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(collection(db, "auditLog"));
  return setDoc(ref, {
    actorUid,
    actorEmail,
    action,
    entityType,
    entityId,
    details: details || null,
    at: serverTimestamp(),
  });
}

export async function fetchAuditLog() {
  const { db, collection, query, orderBy, limit, getDocs } = await loadFirestore();
  const q = query(collection(db, "auditLog"), orderBy("at", "desc"), limit(200));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, at: data.at?.toDate ? data.at.toDate() : null };
  });
}
