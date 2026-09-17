// Acceso a la colección "events" de Firestore.
//
// La carga del SDK de Firebase se hace con import() dinámico (en vez de un
// import estático arriba del archivo) para que, si el CDN de Firebase no
// está disponible (red caída, extensión que bloquea gstatic.com, etc.), el
// error se pueda capturar como una promesa rechazada normal y las páginas
// que llaman a estas funciones puedan mostrar su estado de error en vez de
// quedarse colgadas en "Cargando…".
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

export const EVENT_CATEGORIES = [
  { value: "rifa", label: "Rifa" },
  { value: "colecta_sangre", label: "Colecta de sangre" },
  { value: "feria", label: "Feria" },
  { value: "bono_contribucion", label: "Bono contribución" },
  { value: "otro", label: "Otro" },
];

export function categoryLabel(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.label ?? "Evento";
}

function toEventObject(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate() : null,
  };
}

function buildEventFields(input, Timestamp) {
  return {
    title: input.title,
    description: input.description,
    organizer: input.organizer,
    organizerContact: input.organizerContact || null,
    date: Timestamp.fromDate(input.date),
    endDate: null,
    location: {
      address: input.address,
      city: input.city || null,
      mapsUrl: input.mapsUrl || null,
    },
    category: input.category,
    imageUrl: null,
    instagramUrl: input.instagramUrl || null,
  };
}

// Trae todos los eventos aprobados, ordenados por fecha (uso público).
export async function fetchApprovedEvents() {
  const { db, collection, query, where, orderBy, getDocs } = await loadFirestore();
  const eventsRef = collection(db, "events");
  const q = query(
    eventsRef,
    where("status", "==", "approved"),
    orderBy("date", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toEventObject);
}

// Trae todos los eventos sin filtrar por estado (uso admin).
export async function fetchAllEvents() {
  const { db, collection, query, orderBy, getDocs } = await loadFirestore();
  const eventsRef = collection(db, "events");
  const q = query(eventsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toEventObject);
}

export async function fetchEventById(id) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "events", id));
  if (!snap.exists()) return null;
  return toEventObject(snap);
}

// Crea una propuesta de evento en estado "pending" (queda a la espera de
// aprobación desde el panel de administración). Uso público.
export async function submitEventProposal(input) {
  const { db, collection, addDoc, Timestamp } = await loadFirestore();
  const eventsRef = collection(db, "events");
  return addDoc(eventsRef, {
    ...buildEventFields(input, Timestamp),
    status: "pending",
    submittedBy: {
      name: input.submitterName,
      email: input.submitterEmail,
      phone: input.submitterPhone || null,
    },
    createdAt: Timestamp.now(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  });
}

// Crea un evento ya aprobado, cargado directamente por un admin.
export async function createEventDirect(input, adminEmail) {
  const { db, collection, addDoc, Timestamp } = await loadFirestore();
  const eventsRef = collection(db, "events");
  return addDoc(eventsRef, {
    ...buildEventFields(input, Timestamp),
    status: "approved",
    submittedBy: {
      name: adminEmail,
      email: adminEmail,
      phone: null,
    },
    createdAt: Timestamp.now(),
    reviewedAt: Timestamp.now(),
    reviewedBy: adminEmail,
    rejectionReason: null,
  });
}

// Actualiza los datos de un evento existente (uso admin).
export async function updateEvent(id, input) {
  const { db, doc, updateDoc, Timestamp } = await loadFirestore();
  return updateDoc(doc(db, "events", id), buildEventFields(input, Timestamp));
}

export async function approveEvent(id, adminEmail) {
  const { db, doc, updateDoc, Timestamp } = await loadFirestore();
  return updateDoc(doc(db, "events", id), {
    status: "approved",
    reviewedAt: Timestamp.now(),
    reviewedBy: adminEmail,
    rejectionReason: null,
  });
}

export async function rejectEvent(id, adminEmail, reason) {
  const { db, doc, updateDoc, Timestamp } = await loadFirestore();
  return updateDoc(doc(db, "events", id), {
    status: "rejected",
    reviewedAt: Timestamp.now(),
    reviewedBy: adminEmail,
    rejectionReason: reason || null,
  });
}

export async function deleteEvent(id) {
  const { db, doc, deleteDoc } = await loadFirestore();
  return deleteDoc(doc(db, "events", id));
}
