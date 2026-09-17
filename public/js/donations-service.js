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

export const DONATION_TYPES = [
  { value: "banco", label: "Transferencia bancaria" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "alias", label: "Alias" },
  { value: "billetera", label: "Billetera virtual" },
  { value: "caja_chica", label: "Caja chica / efectivo" },
  { value: "otro", label: "Otro" },
];

// Uso público: solo los medios de donación activos.
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

// Uso admin: todos los medios de donación, activos e inactivos.
export async function fetchAllDonations() {
  const { db, collection, query, orderBy, getDocs } = await loadFirestore();
  const donationsRef = collection(db, "donations");
  const q = query(donationsRef, orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function createDonation(input) {
  const { db, collection, addDoc } = await loadFirestore();
  return addDoc(collection(db, "donations"), {
    type: input.type,
    title: input.title,
    details: input.details,
    active: input.active,
    order: input.order,
    instagramUrl: input.instagramUrl || null,
  });
}

export async function updateDonation(id, input) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "donations", id), {
    type: input.type,
    title: input.title,
    details: input.details,
    active: input.active,
    order: input.order,
    instagramUrl: input.instagramUrl || null,
  });
}

export async function deleteDonation(id) {
  const { db, doc, deleteDoc } = await loadFirestore();
  return deleteDoc(doc(db, "donations", id));
}
