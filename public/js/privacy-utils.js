// Borrado/anonimización masiva de datos personales (nombre, celular)
// de pedidos y entradas, para usar después del evento. Deja todo lo
// demás intacto (montos, estados, códigos) para que los reportes
// históricos sigan teniendo sentido.
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

const ANON_NAME = "Anonimizado";
const BATCH_SIZE = 450; // margen bajo el límite de 500 escrituras por batch de Firestore

export async function anonymizeEventData(orders, tickets) {
  const { db, doc, writeBatch } = await loadFirestore();

  const updates = [
    ...orders.map((o) => ({ ref: doc(db, "orders", o.id), data: { buyerName: ANON_NAME, buyerPhone: "" } })),
    ...tickets.map((t) => ({ ref: doc(db, "tickets", t.id), data: { holderName: ANON_NAME, holderPhone: "" } })),
  ];

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
}
