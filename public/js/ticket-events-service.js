// Acceso a la colección "ticketEvents" (configuración de un evento con
// entradas, ej. "flopi-fest"). Ver PROMPT.md para el modelo de datos.
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

function toTicketEventObject(docSnap) {
  const data = docSnap.data();
  if (!data) return null;
  return {
    id: docSnap.id,
    ...data,
    date: data.date?.toDate ? data.date.toDate() : data.date ? new Date(data.date) : null,
  };
}

export async function getTicketEvent(id) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "ticketEvents", id));
  return snap.exists() ? toTicketEventObject(snap) : null;
}

export function watchTicketEvent(id, onNext, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, doc, onSnapshot }) => {
    unsub = onSnapshot(
      doc(db, "ticketEvents", id),
      (snap) => onNext(snap.exists() ? toTicketEventObject(snap) : null),
      onError
    );
  });
  return () => unsub();
}

// Crea el documento del evento la primera vez (id fijo, ej. "flopi-fest").
// Solo admin, según las reglas.
export async function createTicketEvent(id, input) {
  const { db, doc, setDoc, Timestamp } = await loadFirestore();
  return setDoc(doc(db, "ticketEvents", id), {
    name: input.name,
    venue: input.venue,
    artists: input.artists || [],
    description: input.description || null,
    date: Timestamp.fromDate(input.date),
    doorsOpenTime: input.doorsOpenTime || null,
    priceEarly: input.priceEarly,
    priceDoor: input.priceDoor,
    capacity: input.capacity,
    currency: "PYG",
    issuedCount: 0,
    salesOpen: input.salesOpen !== false,
  });
}

// Edita la config (hora, precios, capacidad, etc). Solo admin.
export async function updateTicketEventConfig(id, input) {
  const { db, doc, updateDoc, Timestamp } = await loadFirestore();
  return updateDoc(doc(db, "ticketEvents", id), {
    name: input.name,
    venue: input.venue,
    artists: input.artists || [],
    description: input.description || null,
    date: Timestamp.fromDate(input.date),
    doorsOpenTime: input.doorsOpenTime || null,
    priceEarly: input.priceEarly,
    priceDoor: input.priceDoor,
    capacity: input.capacity,
    salesOpen: input.salesOpen,
  });
}
