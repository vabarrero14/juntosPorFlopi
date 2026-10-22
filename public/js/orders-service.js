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

export async function createOrder({ ticketEventId, buyerName, buyerPhone, quantity, channel, unitPrice, sellerUid, sellerEmail, notes }) {
  const { db, collection, doc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(collection(db, "orders"));
  const total = quantity * unitPrice;
  await setDoc(ref, {
    ticketEventId,
    buyerName,
    buyerPhone,
    quantity,
    channel,
    unitPrice,
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
