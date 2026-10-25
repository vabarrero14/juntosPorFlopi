// Acceso a la colección "orders" (pedidos). Ver PROMPT.md para el modelo
// de datos y la nota sobre por qué "aplicar" un pago al pedido es un paso
// aparte de crear el pago.
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

function toOrderObject(docSnap) {
  const data = docSnap.data();
  if (!data) return null;
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
  };
}

export async function createOrder({
  ticketEventId,
  buyerName,
  buyerPhone,
  quantity,
  channel,
  unitPrice,
  raffleQuantity,
  raffleUnitPrice,
  collaboration,
  sellerUid,
  sellerEmail,
  notes,
}) {
  const { db, collection, doc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(collection(db, "orders"));
  const raffleQty = raffleQuantity || 0;
  const raffleUnit = raffleUnitPrice || 0;
  const total = quantity * unitPrice + raffleQty * raffleUnit;
  await setDoc(ref, {
    ticketEventId,
    buyerName,
    buyerPhone,
    quantity,
    channel,
    unitPrice,
    raffleQuantity: raffleQty,
    raffleUnitPrice: raffleUnit,
    raffleNumbers: [],
    collaboration: Boolean(collaboration),
    total,
    sellerUid,
    sellerEmail,
    status: "reserved",
    amountConfirmedTotal: 0,
    appliedPaymentIds: [],
    notes: notes || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getOrder(id) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "orders", id));
  return snap.exists() ? toOrderObject(snap) : null;
}

export function watchOrder(id, onNext, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, doc, onSnapshot }) => {
    unsub = onSnapshot(
      doc(db, "orders", id),
      (snap) => onNext(snap.exists() ? toOrderObject(snap) : null),
      onError
    );
  });
  return () => unsub();
}

// Pedidos propios de un vendedor/puerta (lo que sus reglas de lectura
// permiten ver), más recientes primero.
export async function fetchMyOrders(sellerUid) {
  const { db, collection, query, where, orderBy, getDocs } = await loadFirestore();
  const q = query(collection(db, "orders"), where("sellerUid", "==", sellerUid), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toOrderObject);
}

// Todos los pedidos de un evento (uso admin, para reportes).
export async function fetchAllOrders(ticketEventId) {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(collection(db, "orders"), where("ticketEventId", "==", ticketEventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toOrderObject);
}

export async function cancelOrder(id) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "orders", id), { status: "cancelled" });
}

// Admin: borra el pedido definitivamente, junto con todas sus entradas
// (liberando el cupo de las que no estaban ya anuladas) y sus pagos. La
// búsqueda de entradas/pagos a borrar es una consulta aparte (las
// transacciones de Firestore no soportan queries, solo "get" por
// referencia puntual) -- por eso se resuelve antes de abrir la
// transacción, que es la que de verdad hace el borrado atómico.
export async function deleteOrderCascade(orderId) {
  const { db, doc, collection, query, where, getDocs, runTransaction } = await loadFirestore();
  const [ticketsSnap, paymentsSnap] = await Promise.all([
    getDocs(query(collection(db, "tickets"), where("orderId", "==", orderId))),
    getDocs(query(collection(db, "payments"), where("orderId", "==", orderId))),
  ]);
  const ticketRefs = ticketsSnap.docs.map((d) => d.ref);
  const paymentRefs = paymentsSnap.docs.map((d) => d.ref);

  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error("El pedido no existe.");
    const order = orderSnap.data();

    const ticketSnaps = await Promise.all(ticketRefs.map((ref) => tx.get(ref)));
    const nonVoidedCount = ticketSnaps.filter((s) => s.exists() && s.data().status !== "voided").length;

    let eventRef = null;
    let eventSnap = null;
    if (nonVoidedCount > 0) {
      eventRef = doc(db, "ticketEvents", order.ticketEventId);
      eventSnap = await tx.get(eventRef);
    }

    tx.delete(orderRef);
    ticketRefs.forEach((ref) => tx.delete(ref));
    paymentRefs.forEach((ref) => tx.delete(ref));
    if (eventSnap && eventSnap.exists()) {
      tx.update(eventRef, { issuedCount: Math.max(0, eventSnap.data().issuedCount - nonVoidedCount) });
    }
  });
}

// Suma números de rifa a un pedido que ya existía (puede ser uno
// cargado antes de que la rifa fuera una opción, o uno que ya está
// pagado). Si el total nuevo supera lo ya confirmado, el pedido vuelve
// a quedar "partial" hasta que se registre el pago de la diferencia --
// eso no invalida ninguna entrada que ya se haya emitido.
export async function addRaffleToOrder(orderId, additionalQuantity) {
  const { db, doc, runTransaction } = await loadFirestore();
  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error("El pedido no existe.");
    const order = orderSnap.data();

    const eventRef = doc(db, "ticketEvents", order.ticketEventId);
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error("El evento no existe.");
    const rafflePrice = eventSnap.data().rafflePrice || 0;

    const newRaffleQuantity = (order.raffleQuantity || 0) + additionalQuantity;
    const newTotal = order.total + additionalQuantity * rafflePrice;
    const confirmed = order.amountConfirmedTotal || 0;
    const newStatus = confirmed >= newTotal ? "paid" : confirmed > 0 ? "partial" : "reserved";

    const update = {
      raffleQuantity: newRaffleQuantity,
      raffleUnitPrice: rafflePrice,
      total: newTotal,
      status: newStatus,
    };
    tx.update(orderRef, update);
    return { ...order, ...update, id: orderId };
  });
}

// Sacar toda la rifa de un pedido (ej. se cargó por error). Vuelve
// raffleQuantity a 0, borra los números anotados y descuenta del total
// lo que esa rifa sumaba, recalculando el status. No se puede sacar
// "una parte" -- es todo o nada (ver isValidRemoveRaffle en las reglas).
export async function removeRaffleFromOrder(orderId) {
  const { db, doc, runTransaction } = await loadFirestore();
  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error("El pedido no existe.");
    const order = orderSnap.data();

    const raffleQty = order.raffleQuantity || 0;
    const raffleUnit = order.raffleUnitPrice || 0;
    const newTotal = order.total - raffleQty * raffleUnit;
    const confirmed = order.amountConfirmedTotal || 0;
    const newStatus = confirmed >= newTotal ? "paid" : confirmed > 0 ? "partial" : "reserved";

    const update = {
      raffleQuantity: 0,
      raffleNumbers: [],
      total: newTotal,
      status: newStatus,
    };
    tx.update(orderRef, update);
    return { ...order, ...update, id: orderId };
  });
}

// Anota qué número(s) del talonario físico de rifa se le entregaron a
// quien compró. No mueve plata -- cualquiera del staff lo puede editar
// las veces que haga falta (se van entregando de a poco).
export async function updateRaffleNumbers(id, raffleNumbers) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "orders", id), { raffleNumbers });
}

// "Aplica" un pago ya confirmado al pedido: suma su monto a
// amountConfirmedTotal y recalcula el status (partial/paid). Es
// transaccional y se puede reintentar sin riesgo -- si el pago ya estaba
// aplicado, la propia regla de Firestore lo rechaza (ver firestore.rules).
// Devuelve el pedido actualizado.
export async function applyPaymentToOrder(orderId, paymentId) {
  const { db, doc, runTransaction } = await loadFirestore();
  return runTransaction(db, async (tx) => {
    const orderRef = doc(db, "orders", orderId);
    const paymentRef = doc(db, "payments", paymentId);
    const [orderSnap, paymentSnap] = await Promise.all([tx.get(orderRef), tx.get(paymentRef)]);
    if (!orderSnap.exists()) throw new Error("El pedido no existe.");
    if (!paymentSnap.exists()) throw new Error("El pago no existe.");

    const order = orderSnap.data();
    const payment = paymentSnap.data();

    if ((order.appliedPaymentIds || []).includes(paymentId)) {
      // Ya estaba aplicado (ej. un reintento) -- no hace falta tocar nada.
      return { ...order, id: orderId };
    }

    const newTotal = order.amountConfirmedTotal + payment.amount;
    const newStatus = newTotal >= order.total ? "paid" : "partial";
    const update = {
      amountConfirmedTotal: newTotal,
      status: newStatus,
      appliedPaymentIds: [...(order.appliedPaymentIds || []), paymentId],
    };
    tx.update(orderRef, update);
    return { ...order, ...update, id: orderId };
  });
}
