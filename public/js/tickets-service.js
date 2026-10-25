// Acceso a la colección "tickets" (entradas). El id del documento ES el
// código largo del QR (no un id autogenerado): así la página pública
// puede leer una entrada puntual con un simple "get" por id -- nunca
// necesita "listar", que las reglas reservan para el staff. Ver
// firestore.rules / PROMPT.md.
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

const SHORT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I, para que se lea fácil

function randomHex(byteLen) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomShortCode(len = 6) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SHORT_ALPHABET[b % SHORT_ALPHABET.length]).join("");
}

function toTicketObject(docSnap) {
  const data = docSnap.data();
  if (!data) return null;
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    checkedInAt: data.checkedInAt?.toDate ? data.checkedInAt.toDate() : null,
  };
}

async function issueTicketInternal({ ticketEventId, orderId, type, holderName, holderPhone, issuedByUid, issuedByEmail }) {
  const { db, doc, runTransaction, serverTimestamp } = await loadFirestore();
  const code = randomHex(20); // 160 bits
  const shortCode = randomShortCode(6);
  const ticketRef = doc(db, "tickets", code);
  const eventRef = doc(db, "ticketEvents", ticketEventId);

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error("El evento no existe.");
    const event = eventSnap.data();

    tx.set(ticketRef, {
      ticketEventId,
      orderId: orderId || null,
      code,
      shortCode,
      type,
      status: "issued",
      holderName,
      holderPhone: holderPhone || "",
      issuedByUid,
      issuedByEmail,
      reentryCount: 0,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef, { issuedCount: event.issuedCount + 1 });
  });

  return { code, shortCode };
}

// Entrada paga: requiere un pedido ya 'paid' (lo valida firestore.rules).
export async function issueTicket({ ticketEventId, orderId, holderName, holderPhone, issuedByUid, issuedByEmail }) {
  return issueTicketInternal({ ticketEventId, orderId, type: "paid", holderName, holderPhone, issuedByUid, issuedByEmail });
}

// Cortesía: sin pedido detrás, cualquiera del staff la puede cargar.
export async function issueCourtesyTicket({ ticketEventId, holderName, holderPhone, issuedByUid, issuedByEmail }) {
  return issueTicketInternal({ ticketEventId, orderId: null, type: "courtesy", holderName, holderPhone, issuedByUid, issuedByEmail });
}

export async function getTicket(code) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "tickets", code));
  return snap.exists() ? toTicketObject(snap) : null;
}

export function watchTicketsForEvent(ticketEventId, onNext, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, collection, query, where, onSnapshot }) => {
    const q = query(collection(db, "tickets"), where("ticketEventId", "==", ticketEventId));
    unsub = onSnapshot(
      q,
      (snapshot) => onNext(snapshot.docs.map(toTicketObject)),
      onError
    );
  });
  return () => unsub();
}

export async function fetchTicketsForEvent(ticketEventId) {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(collection(db, "tickets"), where("ticketEventId", "==", ticketEventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toTicketObject);
}

export async function fetchTicketsByOrder(orderId) {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(collection(db, "tickets"), where("orderId", "==", orderId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toTicketObject);
}

// Resultado de escanear un código: "ok" (recién ingresó), "already" (ya
// había ingresado -- antes.checkedInAt dice cuándo), "voided",
// "not_found". Nunca tira una excepción para estos casos esperables, así
// la pantalla de puerta puede mostrar el estado grande correspondiente
// sin lidiar con try/catch.
export async function checkInTicket(code, { byUid, byEmail }) {
  const { db, doc, runTransaction, serverTimestamp } = await loadFirestore();
  const ref = doc(db, "tickets", code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { result: "not_found" };
    const ticket = snap.data();
    if (ticket.status === "voided") return { result: "voided", ticket: { ...ticket, id: code } };
    if (ticket.status === "checked_in") return { result: "already", ticket: { ...ticket, id: code } };

    tx.update(ref, {
      status: "checked_in",
      checkedInAt: serverTimestamp(),
      checkedInByUid: byUid,
      checkedInByEmail: byEmail,
    });
    return { result: "ok", ticket: { ...ticket, id: code, status: "checked_in" } };
  });
}

export async function authorizeReentry(code) {
  const { db, doc, runTransaction } = await loadFirestore();
  const ref = doc(db, "tickets", code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("La entrada no existe.");
    const ticket = snap.data();
    const reentryCount = (ticket.reentryCount || 0) + 1;
    tx.update(ref, { reentryCount });
    return { ...ticket, id: code, reentryCount };
  });
}

// Admin: corrige los datos del titular de una entrada ya emitida (p.ej.
// error de tipeo en el nombre o el teléfono).
export async function updateTicketHolder(code, { holderName, holderPhone }) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "tickets", code), { holderName, holderPhone: holderPhone || "" });
}

// Admin: borra la entrada definitivamente. Si no estaba ya anulada,
// libera el cupo (igual que voidTicket) para no descontarlo dos veces.
export async function deleteTicket(code) {
  const { db, doc, runTransaction } = await loadFirestore();
  const ticketRef = doc(db, "tickets", code);
  return runTransaction(db, async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists()) throw new Error("La entrada no existe.");
    const ticket = ticketSnap.data();
    const wasVoided = ticket.status === "voided";

    let eventRef = null;
    let eventSnap = null;
    if (!wasVoided) {
      eventRef = doc(db, "ticketEvents", ticket.ticketEventId);
      eventSnap = await tx.get(eventRef);
    }

    tx.delete(ticketRef);
    if (!wasVoided && eventSnap && eventSnap.exists()) {
      tx.update(eventRef, { issuedCount: Math.max(0, eventSnap.data().issuedCount - 1) });
    }
  });
}

// Admin: anula la entrada y libera el cupo.
export async function voidTicket(code) {
  const { db, doc, runTransaction } = await loadFirestore();
  const ticketRef = doc(db, "tickets", code);
  return runTransaction(db, async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists()) throw new Error("La entrada no existe.");
    const ticket = ticketSnap.data();
    if (ticket.status === "voided") return;

    const eventRef = doc(db, "ticketEvents", ticket.ticketEventId);
    const eventSnap = await tx.get(eventRef);

    tx.update(ticketRef, { status: "voided" });
    if (eventSnap.exists()) {
      tx.update(eventRef, { issuedCount: Math.max(0, eventSnap.data().issuedCount - 1) });
    }
  });
}
