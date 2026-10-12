// Acceso a las subastas (auctionItems, auctionBids, auctionContacts) en
// Firestore. Toda la validación de seguridad real (monto mínimo, que la
// pieza siga "live", extensión anti-sniping con la hora del servidor)
// vive en firestore.rules — este archivo arma las transacciones que
// cumplen esas reglas, pero nunca es la fuente de verdad: un cliente
// modificado no puede hacer trampa, las reglas lo van a rechazar.
let modulesPromise;
function loadFirestore() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("./firebase-init.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"),
    ]).then(([init, firestore, authMod]) => ({
      db: init.db,
      auth: init.auth,
      ...firestore,
      ...authMod,
    }));
  }
  return modulesPromise;
}

// Cualquiera que entra a ofertar necesita un uid, sin crear cuenta:
// Firebase Anonymous Auth se lo da en silencio. Si ya hay alguien
// logueado en esa pestaña (por ejemplo un admin con Google), se lo deja
// como está — nunca lo desconecta para reemplazarlo por uno anónimo.
export async function ensureAuth() {
  const { auth, signInAnonymously, onAuthStateChanged } = await loadFirestore();
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    // onAuthStateChanged puede disparar su callback de forma síncrona
    // (antes de que termine de asignarse "unsub" más abajo), así que
    // "unsubFn" se declara aparte para no pisar ese caso con un acceso
    // a una variable todavía no inicializada.
    let unsubFn = null;
    const handleUser = (user) => {
      if (unsubFn) unsubFn();
      if (user) {
        resolve(user);
        return;
      }
      signInAnonymously(auth).then((cred) => resolve(cred.user)).catch(reject);
    };
    unsubFn = onAuthStateChanged(auth, handleUser);
  });
}

export function watchAuctionItems(callback, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, collection, query, orderBy, onSnapshot }) => {
    const q = query(collection(db, "auctionItems"), orderBy("order", "asc"));
    unsub = onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => onError && onError(err)
    );
  }).catch((err) => onError && onError(err));
  return () => unsub();
}

export async function getAuctionItem(itemId) {
  const { db, doc, getDoc } = await loadFirestore();
  const snap = await getDoc(doc(db, "auctionItems", itemId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchAuctionItem(itemId, callback, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, doc, onSnapshot }) => {
    unsub = onSnapshot(
      doc(db, "auctionItems", itemId),
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => onError && onError(err)
    );
  }).catch((err) => onError && onError(err));
  return () => unsub();
}

export function watchBidsForItem(itemId, callback, onError) {
  let unsub = () => {};
  loadFirestore().then(({ db, collection, query, where, orderBy, onSnapshot }) => {
    const q = query(
      collection(db, "auctionBids"),
      where("itemId", "==", itemId),
      orderBy("at", "asc")
    );
    unsub = onSnapshot(
      q,
      (snap) =>
        callback(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              at: data.at?.toDate ? data.at.toDate() : new Date(data.at),
            };
          })
        ),
      (err) => onError && onError(err)
    );
  }).catch((err) => onError && onError(err));
  return () => unsub();
}

// Ofertar: transacción atómica que crea la oferta, actualiza el estado
// cacheado de la pieza (monto actual, próximo mínimo, reloj con
// extensión anti-sniping) y guarda el contacto. Las reglas de Firestore
// validan cada parte contra la hora real del servidor; si algo no
// cierra (alguien ofertó primero, la pieza ya cerró, etc.) la
// transacción entera se rechaza.
export async function placeBid({ itemId, name, phone, amount }) {
  const { db, doc, collection, runTransaction, serverTimestamp } = await loadFirestore();
  const user = await ensureAuth();
  const uid = user.uid;

  const itemRef = doc(db, "auctionItems", itemId);
  const bidRef = doc(collection(db, "auctionBids"));
  const contactRef = doc(db, "auctionContacts", uid, "bids", bidRef.id);

  return runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists()) throw new Error("La pieza no existe.");
    const item = itemSnap.data();

    if (item.status !== "live") throw new Error("Esta pieza no está abierta para ofertar.");
    const minNextBid = item.minNextBid ?? item.base;
    if (amount < minNextBid) {
      throw new Error("La oferta mínima ahora es " + minNextBid.toLocaleString("es-PY") + ".");
    }

    const now = Date.now();
    const extendMs = (item.extendMin ?? 2) * 60000;
    const newEndsAt = item.endsAt - now <= extendMs ? now + extendMs : item.endsAt;

    tx.set(bidRef, {
      itemId,
      name,
      amount,
      uid,
      at: serverTimestamp(),
      annulled: false,
      manual: false,
    });
    tx.update(itemRef, {
      currentAmount: amount,
      currentBidderName: name,
      currentBidderUid: uid,
      minNextBid: amount + item.inc,
      endsAt: newEndsAt,
      bidCount: (item.bidCount || 0) + 1,
      updatedAt: now,
    });
    tx.set(contactRef, { phone, name, itemId, amount });
  });
}

// ---- Admin ----

export async function createAuctionItem(input) {
  const { db, collection, addDoc } = await loadFirestore();
  return addDoc(collection(db, "auctionItems"), {
    name: input.name,
    desc: input.desc || "",
    photoBase64: input.photoBase64 || null,
    base: input.base,
    inc: input.inc,
    durationMin: input.durationMin ?? 20,
    extendMin: input.extendMin ?? 2,
    status: "upcoming",
    endsAt: null,
    closedAt: null,
    order: Date.now(),
    currentAmount: null,
    currentBidderName: null,
    currentBidderUid: null,
    minNextBid: input.base,
    bidCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function updateAuctionItemDetails(id, input) {
  const { db, doc, updateDoc } = await loadFirestore();
  const patch = {
    name: input.name,
    desc: input.desc || "",
    base: input.base,
    inc: input.inc,
    durationMin: input.durationMin ?? 20,
    extendMin: input.extendMin ?? 2,
    updatedAt: Date.now(),
  };
  if (input.photoBase64 !== undefined) patch.photoBase64 = input.photoBase64;
  return updateDoc(doc(db, "auctionItems", id), patch);
}

export async function deleteAuctionItem(id) {
  const { db, doc, deleteDoc } = await loadFirestore();
  return deleteDoc(doc(db, "auctionItems", id));
}

export async function openAuctionItem(id, durationMin) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "auctionItems", id), {
    status: "live",
    endsAt: Date.now() + (durationMin || 20) * 60000,
    closedAt: null,
    updatedAt: Date.now(),
  });
}

export async function closeAuctionItem(id) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "auctionItems", id), {
    status: "closed",
    closedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// Reinicia la pieza a "upcoming" y anula todas sus ofertas actuales.
export async function resetAuctionItem(id) {
  const { db, doc, collection, query, where, getDoc, getDocs, writeBatch } = await loadFirestore();
  const itemRef = doc(db, "auctionItems", id);
  const itemSnap = await getDoc(itemRef);
  const item = itemSnap.data();

  const bidsQ = query(collection(db, "auctionBids"), where("itemId", "==", id));
  const bidsSnap = await getDocs(bidsQ);

  const batch = writeBatch(db);
  bidsSnap.docs.forEach((d) => batch.update(d.ref, { annulled: true }));
  batch.update(itemRef, {
    status: "upcoming",
    endsAt: null,
    closedAt: null,
    currentAmount: null,
    currentBidderName: null,
    currentBidderUid: null,
    minNextBid: item.base,
    bidCount: 0,
    updatedAt: Date.now(),
  });
  return batch.commit();
}

export async function annulBid(bidId, annulled) {
  const { db, doc, updateDoc } = await loadFirestore();
  return updateDoc(doc(db, "auctionBids", bidId), { annulled });
}

// Carga una oferta a mano (alguien que ofertó por WhatsApp). Admin-only:
// las reglas lo permiten sin pasar por isValidPublicBidCreate(), pero
// igual validamos el mínimo acá para no cargar algo inconsistente sin
// querer.
export async function placeManualBid({ itemId, name, phone, amount }) {
  const { db, doc, collection, getDoc, writeBatch } = await loadFirestore();
  const itemRef = doc(db, "auctionItems", itemId);
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) throw new Error("La pieza no existe.");
  const item = itemSnap.data();
  const minNextBid = item.minNextBid ?? item.base;
  if (amount < minNextBid) {
    throw new Error("La oferta mínima ahora es " + minNextBid.toLocaleString("es-PY") + ".");
  }

  const bidRef = doc(collection(db, "auctionBids"));
  const now = Date.now();
  const extendMs = (item.extendMin ?? 2) * 60000;
  const newEndsAt = item.endsAt != null && item.endsAt - now <= extendMs ? now + extendMs : item.endsAt;

  const batch = writeBatch(db);
  batch.set(bidRef, {
    itemId,
    name,
    amount,
    uid: null,
    at: now,
    annulled: false,
    manual: true,
  });
  batch.update(itemRef, {
    currentAmount: amount,
    currentBidderName: name,
    currentBidderUid: null,
    minNextBid: amount + item.inc,
    endsAt: newEndsAt,
    bidCount: (item.bidCount || 0) + 1,
    updatedAt: now,
  });
  if (phone) {
    const contactRef = doc(db, "auctionContacts", "manual-" + bidRef.id, "bids", bidRef.id);
    batch.set(contactRef, { phone, name, itemId, amount });
  }
  return batch.commit();
}

// Las ofertas manuales (cargadas por el admin en nombre de alguien de
// WhatsApp) no tienen uid real, así que su contacto se guarda bajo un
// uid sintético derivado del propio id de la oferta.
export async function fetchContactForBid(bid) {
  const { db, doc, getDoc } = await loadFirestore();
  const contactUid = bid.manual ? "manual-" + bid.id : bid.uid;
  if (!contactUid) return null;
  const snap = await getDoc(doc(db, "auctionContacts", contactUid, "bids", bid.id));
  return snap.exists() ? snap.data() : null;
}
