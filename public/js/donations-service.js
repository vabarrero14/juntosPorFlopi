// Acceso a la colección "donations" de Firestore.
// Ver comentario en events-service.js sobre por qué el SDK se carga con
// import() dinámico en vez de un import estático.
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

export async function fetchActiveDonations() {
  const { db, collection, query, where, orderBy, getDocs } = await loadFirestore();
  const donationsRef = collection(db, "donations");
  const q = query(
    donationsRef,
    where("active", "==", true),
    orderBy("order", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
