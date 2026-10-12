import {
  watchAuctionItems,
  watchBidsForItem,
  placeBid,
  ensureAuth,
} from "./auction-service.js";

const STATUS_LABEL = { upcoming: "Próximamente", live: "En vivo", closed: "Finalizada" };
const QUICK_STEPS = [0, 1, 2, 5];

const root = document.getElementById("auction-root");

let allItems = [];
let itemsError = null;
let currentView = "list"; // "list" | "detail"
let currentItemId = null;
let bidsForCurrentItem = [];
let unsubscribeBids = null;
let tickTimer = null;
let firstLoad = true;

const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function lsGet(k) {
  try {
    return localStorage.getItem(k) || "";
  } catch (e) {
    return "";
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* ignore */
  }
}

function deriveState(item) {
  if (item.status === "upcoming") return "upcoming";
  if (item.status === "closed") return "closed";
  if (item.endsAt != null && Date.now() >= item.endsAt) return "closed";
  return "live";
}

function fmtClock(ms) {
  ms = Math.max(0, ms);
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

// enterList()/enterDetail() construyen la vista desde cero (se usan solo
// al navegar). Las actualizaciones en vivo que llegan mientras ya
// estamos en una vista (onItemsChanged) NUNCA reconstruyen el HTML:
// solo actualizan los valores, para no perder lo que la persona ya
// escribió en el formulario de oferta ni el mensaje que acaba de ver.
function enterList() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  currentView = "list";
  currentItemId = null;
  stopBidsWatch();
  renderListShell();
}

function enterDetail(itemId) {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) {
    enterList();
    return;
  }
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  currentView = "detail";
  currentItemId = itemId;
  renderDetailShell(item);
  startBidsWatch(itemId);
  updateDetail();
  tickTimer = setInterval(updateDetail, 500);
}

// Se llama cada vez que cambia la colección de piezas (ofertas de otra
// persona, el moderador abriendo/cerrando, etc.). En la lista no hay
// estado que perder, así que se puede reconstruir entera; en el detalle
// se actualizan solo los valores con updateDetail().
function onItemsChanged() {
  if (currentView === "detail") {
    const item = allItems.find((i) => i.id === currentItemId);
    if (!item) {
      enterList();
      return;
    }
    updateDetail();
  } else {
    renderListShell();
  }
}

function renderListShell() {
  stopBidsWatch();
  root.innerHTML = `
    <div class="section-title">
      <h2>Subastas solidarias</h2>
      <p>Todo lo recaudado va para el tratamiento de Flopi. Elegí una pieza, mirá el precio actual y ofertá.</p>
    </div>
    <div id="auction-grid" class="cards-grid"></div>
  `;
  const grid = document.getElementById("auction-grid");

  if (itemsError) {
    grid.innerHTML = `<div class="empty-state">No pudimos cargar las subastas en este momento. Probá de nuevo más tarde.</div>`;
    return;
  }
  if (allItems.length === 0) {
    grid.innerHTML = `<div class="empty-state">Todavía no hay piezas cargadas para subastar.</div>`;
    return;
  }

  allItems.forEach((item) => {
    const state = deriveState(item);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card item";
    card.innerHTML = `
      ${item.photoBase64 ? `<img src="${item.photoBase64}" alt="${esc(item.name)}" class="auction-photo" />` : `<div class="auction-photo auction-photo-placeholder">📷</div>`}
      <span class="badge ${state}">${STATUS_LABEL[state]}</span>
      <h3 class="mt-0 mb-0">${esc(item.name)}</h3>
      <div class="mute" style="font-size:13px">${item.currentAmount != null ? "Oferta actual" : "Base"}</div>
      <div class="price">${gs(item.currentAmount != null ? item.currentAmount : item.base)}</div>
    `;
    card.addEventListener("click", () => enterDetail(item.id));
    grid.appendChild(card);
  });
}

function renderDetailShell(item) {
  root.innerHTML = `
    <button class="back" id="back">← Todas las piezas</button>
    <div class="card">
      ${item.photoBase64 ? `<img src="${item.photoBase64}" alt="${esc(item.name)}" class="auction-photo auction-photo-lg" />` : `<div class="auction-photo auction-photo-lg auction-photo-placeholder">📷</div>`}
      <span class="badge" id="a-badge"></span>
      <h2 class="mt-0">${esc(item.name)}</h2>
      <p class="mute" style="margin:0">${esc(item.desc || "")}</p>
      <div class="mute" style="font-size:13px" id="a-plabel"></div>
      <div class="price big" id="a-price"></div>
      <div class="mute" id="a-who"></div>
      <div>
        <div class="mute" style="font-size:13px" id="a-tlabel"></div>
        <div class="auction-timer" id="a-timer"></div>
      </div>
    </div>

    <div class="card" id="a-bidbox">
      <h3>Ofertar</h3>
      <div id="a-bid-msg" class="form-message" hidden></div>
      <div class="form-row-group">
        <div class="form-row">
          <label for="a-name">Tu nombre</label>
          <input id="a-name" value="${esc(lsGet("jpf-bidder-name"))}" />
        </div>
        <div class="form-row">
          <label for="a-phone">Tu celular</label>
          <input id="a-phone" inputmode="tel" value="${esc(lsGet("jpf-bidder-phone"))}" />
        </div>
      </div>
      <div class="quick" id="a-quick"></div>
      <div class="form-row">
        <label for="a-amount">Otro monto (Gs.)</label>
        <input id="a-amount" type="number" inputmode="numeric" />
      </div>
      <button class="btn btn-primary" id="a-go">Ofrezco</button>
      <p class="form-help">Tu celular solo lo ve el moderador, para contactarte si ganás.</p>
    </div>

    <div class="card" id="a-winbox" hidden></div>

    <div class="card">
      <h3>Historial de ofertas</h3>
      <ul class="hist" id="a-hist"></ul>
    </div>

    <div class="card">
      <h3>Reglas</h3>
      <ul class="rules" id="a-rules"></ul>
    </div>
  `;

  document.getElementById("back").addEventListener("click", enterList);
  document.getElementById("a-go").addEventListener("click", () => submitBid(item.id));
}

function updateDetail() {
  const item = allItems.find((i) => i.id === currentItemId);
  if (!item) return;
  const state = deriveState(item);
  const inc = item.inc || 10000;
  const minNext = item.minNextBid ?? item.base;

  const q = (id) => document.getElementById(id);
  if (!q("a-price")) return;

  q("a-badge").className = "badge " + state;
  q("a-badge").textContent = STATUS_LABEL[state];
  q("a-plabel").textContent = item.currentAmount != null ? "Oferta actual" : "Precio base";
  q("a-price").textContent = gs(item.currentAmount != null ? item.currentAmount : item.base);
  q("a-who").textContent = item.currentBidderName ? "de " + item.currentBidderName : "Todavía nadie ofertó";
  q("a-bidbox").hidden = state !== "live";
  q("a-winbox").hidden = state !== "closed";

  if (state === "closed") {
    q("a-winbox").innerHTML = item.currentAmount != null
      ? `<h3 class="mt-0">¡Pieza adjudicada!</h3>
         <div class="winner"><b>${esc(item.currentBidderName)}</b> ganó con ${gs(item.currentAmount)}.
         Gracias a todos por sumarse.<br>
         <span class="mute">Pago por transferencia o efectivo · entrega a coordinar con el moderador.</span></div>`
      : `<h3 class="mt-0">Subasta finalizada</h3><p class="mute" style="margin:0">Esta pieza no recibió ofertas.</p>`;
  }

  if (state === "live") {
    q("a-quick").innerHTML = QUICK_STEPS.map((n) => {
      const a = minNext + inc * n;
      return `<button type="button" class="btn btn-outline" data-a="${a}">${gs(a)}</button>`;
    }).join("");
    q("a-quick").querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => (q("a-amount").value = b.dataset.a));
    });
    q("a-amount").placeholder = "mín. " + minNext;
  }

  const validBids = bidsForCurrentItem.filter((b) => !b.annulled);
  q("a-hist").innerHTML =
    validBids
      .slice()
      .reverse()
      .map(
        (b) => `<li><span>${esc(b.name)}</span><span>${gs(b.amount)} <span class="mute">· ${b.at.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></span></li>`
      )
      .join("") || `<li class="mute">Sin ofertas todavía.</li>`;

  q("a-rules").innerHTML = [
    `Base ${gs(item.base)}, cada oferta sube mínimo ${gs(inc)}.`,
    `Dura ${item.durationMin || 20} min desde que el moderador la abre.`,
    `Si entra una oferta en el último tramo, se extiende ${item.extendMin ?? 2} min.`,
    `Pago por transferencia o efectivo. Entrega a coordinar.`,
  ]
    .map((t) => `<li>${esc(t)}</li>`)
    .join("");

  tick(item, state);
}

function tick(item, state) {
  const t = document.getElementById("a-timer");
  const l = document.getElementById("a-tlabel");
  if (!t) return;
  if (state === "upcoming") {
    l.textContent = "Duración";
    t.textContent = (item.durationMin || 20) + " min";
    t.className = "auction-timer";
  } else if (state === "live") {
    const remaining = item.endsAt - Date.now();
    l.textContent = "Tiempo restante";
    t.textContent = fmtClock(remaining);
    t.className = "auction-timer" + (remaining <= 120000 ? " hot" : "");
    if (remaining <= 0) updateDetail();
  } else {
    l.textContent = "";
    t.textContent = "Cerrada";
    t.className = "auction-timer";
  }
}

async function submitBid(itemId) {
  const item = allItems.find((i) => i.id === itemId);
  const msg = document.getElementById("a-bid-msg");
  const nameEl = document.getElementById("a-name");
  const phoneEl = document.getElementById("a-phone");
  const amountEl = document.getElementById("a-amount");
  const btn = document.getElementById("a-go");

  const showMsg = (text, type) => {
    msg.textContent = text;
    msg.className = "form-message " + type;
    msg.hidden = false;
  };

  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const amount = Math.round(Number(amountEl.value));

  if (deriveState(item) !== "live") {
    showMsg("Esta pieza no está abierta para ofertar.", "error");
    return;
  }
  if (!name || phone.length < 6) {
    showMsg("Completá tu nombre y celular.", "error");
    return;
  }
  const minNext = item.minNextBid ?? item.base;
  if (!amount || amount < minNext) {
    showMsg("La oferta mínima es " + gs(minNext) + ".", "error");
    return;
  }

  lsSet("jpf-bidder-name", name);
  lsSet("jpf-bidder-phone", phone);
  btn.disabled = true;
  btn.textContent = "Enviando…";

  try {
    await placeBid({ itemId, name, phone, amount });
    showMsg("¡Oferta enviada! Si alguien te supera, vas a verlo acá.", "success");
    amountEl.value = "";
  } catch (error) {
    console.error("Error al ofertar:", error);
    showMsg(error.message || "No se pudo enviar la oferta. Probá de nuevo.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Ofrezco";
  }
}

function startBidsWatch(itemId) {
  stopBidsWatch();
  unsubscribeBids = watchBidsForItem(
    itemId,
    (bids) => {
      bidsForCurrentItem = bids;
      updateDetail();
    },
    (err) => console.error("Error cargando historial de ofertas:", err)
  );
}

function stopBidsWatch() {
  if (unsubscribeBids) {
    unsubscribeBids();
    unsubscribeBids = null;
  }
  bidsForCurrentItem = [];
}

async function init() {
  try {
    await ensureAuth();
  } catch (error) {
    console.error("Error autenticando de forma anónima:", error);
  }
  watchAuctionItems(
    (items) => {
      allItems = items;
      itemsError = null;
      if (firstLoad) {
        firstLoad = false;
        enterList();
      } else {
        onItemsChanged();
      }
    },
    (err) => {
      console.error("Error cargando subastas:", err);
      itemsError = err;
      if (firstLoad) {
        firstLoad = false;
        enterList();
      } else if (currentView === "list") {
        renderListShell();
      }
    }
  );
}

init();
