import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  watchAuctionItem,
  watchBidsForItem,
  openAuctionItem,
  closeAuctionItem,
  resetAuctionItem,
  annulBid,
  placeManualBid,
  fetchContactForBid,
} from "../../js/auction-service.js";

const STATUS_LABEL = { upcoming: "Próximamente", live: "En vivo", closed: "Finalizada" };
const itemId = new URLSearchParams(window.location.search).get("id");
const root = document.getElementById("mod-root");

const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let currentItem = null;
let currentBids = [];
let contacts = {}; // bidId -> { phone, name, itemId, amount } | null (not found)
let requestedContacts = new Set();
let shellBuilt = false;
let tickTimer = null;

function deriveState(item) {
  if (!item) return "upcoming";
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

function buildShell() {
  root.innerHTML = `
    <div class="card">
      <span class="badge" id="m-badge"></span>
      <h2 class="mt-0" id="m-name"></h2>
      <p class="mute" id="m-desc" style="margin:0"></p>
      <div class="mute" style="font-size:13px" id="m-plabel"></div>
      <div class="price big" id="m-price"></div>
      <div class="mute" id="m-who"></div>
      <div>
        <div class="mute" style="font-size:13px" id="m-tlabel"></div>
        <div class="auction-timer" id="m-timer"></div>
      </div>
      <div class="admin-row-actions" id="m-actions" style="margin-top: 12px;"></div>
    </div>

    <div class="card">
      <h3>Cargar oferta a mano (WhatsApp)</h3>
      <div id="m-manual-msg" class="form-message" hidden></div>
      <div class="form-row-group">
        <div class="form-row">
          <label for="m-name-in">Nombre</label>
          <input id="m-name-in" />
        </div>
        <div class="form-row">
          <label for="m-phone-in">Celular</label>
          <input id="m-phone-in" inputmode="tel" />
        </div>
        <div class="form-row">
          <label for="m-amount-in">Monto (Gs.)</label>
          <input id="m-amount-in" type="number" inputmode="numeric" />
        </div>
      </div>
      <button class="btn btn-primary" id="m-manual-go">Cargar oferta</button>
    </div>

    <div class="card">
      <h3>Ofertas (con celular)</h3>
      <div id="m-bids"></div>
    </div>
  `;

  document.getElementById("m-manual-go").addEventListener("click", submitManualBid);
  shellBuilt = true;
}

function renderActions() {
  const state = deriveState(currentItem);
  const box = document.getElementById("m-actions");
  box.innerHTML = "";

  if (state === "upcoming") {
    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = "▶ Abrir (" + (currentItem.durationMin || 20) + " min)";
    btn.addEventListener("click", () => openAuctionItem(itemId, currentItem.durationMin));
    box.appendChild(btn);
  }
  if (state === "live") {
    const btn = document.createElement("button");
    btn.className = "btn btn-outline";
    btn.textContent = "■ Cerrar ahora";
    btn.addEventListener("click", () => closeAuctionItem(itemId));
    box.appendChild(btn);
  }
  if (state !== "upcoming") {
    const btn = document.createElement("button");
    btn.className = "btn btn-outline";
    btn.textContent = "↺ Reiniciar";
    btn.addEventListener("click", async () => {
      if (!window.confirm("¿Reiniciar esta pieza? Se anulan todas sus ofertas actuales.")) return;
      await resetAuctionItem(itemId);
    });
    box.appendChild(btn);
  }
}

function updateView() {
  if (!currentItem) return;
  const justBuilt = !shellBuilt;
  if (!shellBuilt) buildShell();

  const state = deriveState(currentItem);
  const inc = currentItem.inc || 10000;

  document.getElementById("m-badge").className = "badge " + state;
  document.getElementById("m-badge").textContent = STATUS_LABEL[state];
  document.getElementById("m-name").textContent = currentItem.name;
  document.getElementById("m-desc").textContent = currentItem.desc || "";
  document.getElementById("m-plabel").textContent = currentItem.currentAmount != null ? "Oferta actual" : "Precio base";
  document.getElementById("m-price").textContent = gs(currentItem.currentAmount != null ? currentItem.currentAmount : currentItem.base);
  document.getElementById("m-who").textContent = currentItem.currentBidderName ? "de " + currentItem.currentBidderName : "Todavía nadie ofertó";

  renderActions();

  const t = document.getElementById("m-timer");
  const l = document.getElementById("m-tlabel");
  if (state === "upcoming") {
    l.textContent = "Duración";
    t.textContent = (currentItem.durationMin || 20) + " min";
    t.className = "auction-timer";
  } else if (state === "live") {
    const remaining = currentItem.endsAt - Date.now();
    l.textContent = "Tiempo restante";
    t.textContent = fmtClock(remaining);
    t.className = "auction-timer" + (remaining <= 120000 ? " hot" : "");
  } else {
    l.textContent = "";
    t.textContent = "Cerrada";
    t.className = "auction-timer";
  }

  if (justBuilt) renderBids();
}

function renderBids() {
  const box = document.getElementById("m-bids");
  if (!box) return;
  const sorted = currentBids.slice().sort((a, b) => b.at - a.at);

  sorted.forEach((b) => {
    if (requestedContacts.has(b.id)) return;
    requestedContacts.add(b.id);
    fetchContactForBid(b).then((c) => {
      contacts[b.id] = c;
      renderBids();
    });
  });

  if (sorted.length === 0) {
    box.innerHTML = `<p class="mute">Sin ofertas.</p>`;
    return;
  }

  box.innerHTML = "";
  sorted.forEach((b) => {
    const contact = contacts[b.id];
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main" style="${b.annulled ? "opacity:.55; text-decoration: line-through;" : ""}">
        <strong>${esc(b.name)}${b.manual ? " (manual)" : ""}</strong>
        <div class="form-help">${contact ? esc(contact.phone) : "—"}</div>
        <div class="form-help">${gs(b.amount)} · ${b.at.toLocaleTimeString("es-PY")}</div>
      </div>
      <div class="admin-row-actions"></div>
    `;
    const actions = row.querySelector(".admin-row-actions");
    const btn = document.createElement("button");
    btn.className = "btn btn-outline";
    btn.textContent = b.annulled ? "Restaurar" : "Anular";
    btn.addEventListener("click", () => annulBid(b.id, !b.annulled));
    actions.appendChild(btn);
    box.appendChild(row);
  });
}

async function submitManualBid() {
  const nameEl = document.getElementById("m-name-in");
  const phoneEl = document.getElementById("m-phone-in");
  const amountEl = document.getElementById("m-amount-in");
  const msg = document.getElementById("m-manual-msg");
  const btn = document.getElementById("m-manual-go");

  const showMsg = (text, type) => {
    msg.textContent = text;
    msg.className = "form-message " + type;
    msg.hidden = false;
  };

  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const amount = Math.round(Number(amountEl.value));

  if (!name || !amount) {
    showMsg("Completá nombre y monto.", "error");
    return;
  }

  btn.disabled = true;
  try {
    await placeManualBid({ itemId, name, phone, amount });
    showMsg("Oferta cargada.", "success");
    nameEl.value = "";
    phoneEl.value = "";
    amountEl.value = "";
  } catch (error) {
    console.error("Error cargando oferta manual:", error);
    showMsg(error.message || "No se pudo cargar la oferta.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  if (!itemId) {
    root.innerHTML = `<div class="empty-state">Falta indicar la pieza.</div>`;
    return;
  }
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "subastas" });

  watchAuctionItem(
    itemId,
    (item) => {
      if (!item) {
        root.innerHTML = `<div class="empty-state">Esta pieza ya no existe.</div>`;
        return;
      }
      currentItem = item;
      updateView();
    },
    (err) => {
      console.error("Error cargando la pieza:", err);
      root.innerHTML = `<div class="empty-state">No pudimos cargar la pieza.</div>`;
    }
  );

  watchBidsForItem(
    itemId,
    (bids) => {
      currentBids = bids;
      renderBids();
    },
    (err) => console.error("Error cargando ofertas:", err)
  );

  tickTimer = setInterval(() => {
    if (deriveState(currentItem) === "live") updateView();
  }, 1000);
}

init();
