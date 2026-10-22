// Acceso a la colección "payments" (pagos). Un pago en efectivo se crea
// ya confirmado y se aplica al pedido al instante; una transferencia
// queda "por confirmar" hasta que un admin la valida contra el banco (y
// recién ahí se aplica). Ver firestore.rules / PROMPT.md para el porqué
// de la coreografía en dos pasos.
import { applyPaymentToOrder } from "./orders-service.js";

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

function toPaymentObject(docSnap) {
  const data = docSnap.data();
  if (!data) return null;
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    confirmedAt: data.confirmedAt?.toDate ? data.confirmedAt.toDate() : null,
  };
}

// Efectivo: queda confirmado al instante (quien lo recibe lo tiene en la
// mano) y se aplica al pedido en el mismo paso.
export async function registerCashPayment({ orderId, ticketEventId, amount, receivedByUid, receivedByEmail }) {
  const { db, collection, doc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(collection(db, "payments"));
  await setDoc(ref, {
    orderId,
    ticketEventId,
    amount,
    method: "cash",
    reference: "",
    receivedByUid,
    receivedByEmail,
    status: "confirmed",
    settled: false,
    createdAt: serverTimestamp(),
  });
  const order = await applyPaymentToOrder(orderId, ref.id);
  return { paymentId: ref.id, order };
}

// Transferencia: queda "por confirmar" -- no se aplica al pedido hasta
// que un admin la confirma contra el banco.
export async function registerTransferPayment({ orderId, ticketEventId, amount, reference, receivedByUid, receivedByEmail }) {
  const { db, collection, doc, setDoc, serverTimestamp } = await loadFirestore();
  const ref = doc(collection(db, "payments"));
  await setDoc(ref, {
    orderId,
    ticketEventId,
    amount,
    method: "transfer",
    reference,
    receivedByUid,
    receivedByEmail,
    status: "pending_confirm",
    settled: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Admin confirma una transferencia contra el banco: pasa a "confirmed" y
// recién ahí se aplica al pedido.
export async function confirmTransferPayment(paymentId, confirmedByEmail) {
  const { db, doc, getDoc, updateDoc, serverTimestamp } = await loadFirestore();
  const snap = await getDoc(doc(db, "payments", paymentId));
  if (!snap.exists()) throw new Error("El pago no existe.");
  const { orderId } = snap.data();
  await updateDoc(doc(db, "payments", paymentId), {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
    confirmedBy: confirmedByEmail,
  });
  return applyPaymentToOrder(orderId, paymentId);
}

// Admin anula un pago. Si ya estaba aplicado al pedido, revierte el
// monto y recalcula el status.
export async function voidPayment(paymentId, voidReason) {
  const { db, doc, runTransaction } = await loadFirestore();
  return runTransaction(db, async (tx) => {
    // Todas las lecturas antes que cualquier escritura -- Firestore no
    // permite leer después de escribir dentro de una misma transacción.
    const paymentRef = doc(db, "payments", paymentId);
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists()) throw new Error("El pago no existe.");
    const payment = paymentSnap.data();

    const orderRef = doc(db, "orders", payment.orderId);
    const orderSnap = await tx.get(orderRef);
    const order = orderSnap.exists() ? orderSnap.data() : null;
    const wasApplied = order && (order.appliedPaymentIds || []).includes(paymentId);

    tx.update(paymentRef, { status: "voided", voidReason: voidReason || null });

    if (wasApplied) {
      const newTotal = order.amountConfirmedTotal - payment.amount;
      const newStatus = newTotal >= order.total ? "paid" : newTotal > 0 ? "partial" : "reserved";
      tx.update(orderRef, {
        amountConfirmedTotal: newTotal,
        status: newStatus,
        appliedPaymentIds: (order.appliedPaymentIds || []).filter((id) => id !== paymentId),
      });
    }
  });
}

export async function fetchPaymentsForOrder(orderId) {
  const { db, collection, query, where, orderBy, getDocs } = await loadFirestore();
  const q = query(collection(db, "payments"), where("orderId", "==", orderId), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toPaymentObject);
}

// Transferencias esperando confirmación de un admin.
export async function fetchPendingTransfers() {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(collection(db, "payments"), where("status", "==", "pending_confirm"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toPaymentObject);
}

// Todos los pagos de un evento (uso admin, para reportes).
export async function fetchPaymentsForEvent(ticketEventId) {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(collection(db, "payments"), where("ticketEventId", "==", ticketEventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toPaymentObject);
}

// Efectivo recibido por una persona, para el cierre de caja.
export async function fetchCashPaymentsByReceiver(uid) {
  const { db, collection, query, where, getDocs } = await loadFirestore();
  const q = query(
    collection(db, "payments"),
    where("receivedByUid", "==", uid),
    where("method", "==", "cash")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(toPaymentObject);
}

export async function markPaymentsSettled(paymentIds) {
  const { db, doc, writeBatch } = await loadFirestore();
  const batch = writeBatch(db);
  paymentIds.forEach((id) => batch.update(doc(db, "payments", id), { settled: true }));
  return batch.commit();
}
