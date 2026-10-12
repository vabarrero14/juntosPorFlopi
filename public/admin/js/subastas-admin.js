import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  watchAuctionItems,
  openAuctionItem,
  closeAuctionItem,
  resetAuctionItem,
  deleteAuctionItem,
} from "../../js/auction-service.js";

const STATUS_LABEL = { upcoming: "Próximamente", live: "En vivo", closed: "Finalizada" };
const listEl = document.getElementById("items-list");

const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");

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

function renderRow(item) {
  const state = deriveState(item);
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-main">
      <span class="status-badge status-${state === "live" ? "approved" : state === "closed" ? "rejected" : "pending"}">${STATUS_LABEL[state]}</span>
      <strong>${item.name}</strong>
      <div class="form-help">
        ${item.currentAmount != null ? "Oferta actual: " + gs(item.currentAmount) : "Base: " + gs(item.base)}
        ${item.currentBidderName ? " · " + item.currentBidderName : ""}
      </div>
      ${state === "live" ? `<div class="form-help" data-timer="${item.id}">Tiempo restante: …</div>` : ""}
    </div>
    <div class="admin-row-actions"></div>
  `;

  const actions = row.querySelector(".admin-row-actions");

  if (state === "upcoming") {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn btn-primary";
    openBtn.textContent = "▶ Abrir (" + (item.durationMin || 20) + " min)";
    openBtn.addEventListener("click", async () => {
      openBtn.disabled = true;
      await openAuctionItem(item.id, item.durationMin);
    });
    actions.appendChild(openBtn);
  }

  if (state === "live") {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-outline";
    closeBtn.textContent = "■ Cerrar ahora";
    closeBtn.addEventListener("click", async () => {
      closeBtn.disabled = true;
      await closeAuctionItem(item.id);
    });
    actions.appendChild(closeBtn);
  }

  if (state !== "upcoming") {
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-outline";
    resetBtn.textContent = "↺ Reiniciar";
    resetBtn.addEventListener("click", async () => {
      if (!window.confirm(`¿Reiniciar "${item.name}"? Se anulan todas sus ofertas actuales.`)) return;
      resetBtn.disabled = true;
      await resetAuctionItem(item.id);
    });
    actions.appendChild(resetBtn);
  }

  const modLink = document.createElement("a");
  modLink.href = `subasta-moderar.html?id=${item.id}`;
  modLink.className = "btn btn-outline";
  modLink.textContent = "Moderar";
  actions.appendChild(modLink);

  const editLink = document.createElement("a");
  editLink.href = `subasta-form.html?id=${item.id}`;
  editLink.className = "btn btn-outline";
  editLink.textContent = "Editar";
  actions.appendChild(editLink);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-outline";
  deleteBtn.textContent = "Eliminar";
  deleteBtn.addEventListener("click", async () => {
    if (!window.confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteAuctionItem(item.id);
  });
  actions.appendChild(deleteBtn);

  return row;
}

let currentItems = [];

function render() {
  if (currentItems.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Todavía no cargaste ninguna pieza.</div>`;
    return;
  }
  listEl.innerHTML = "";
  currentItems.forEach((item) => listEl.appendChild(renderRow(item)));
}

function tickTimers() {
  currentItems.forEach((item) => {
    const el = document.querySelector(`[data-timer="${item.id}"]`);
    if (!el) return;
    const state = deriveState(item);
    if (state !== "live") return;
    el.textContent = "Tiempo restante: " + fmtClock(item.endsAt - Date.now());
  });
}
setInterval(tickTimers, 1000);

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "subastas" });

  watchAuctionItems(
    (items) => {
      currentItems = items;
      render();
    },
    (err) => {
      console.error("Error cargando subastas:", err);
      listEl.innerHTML = `<div class="empty-state">No pudimos cargar las subastas.</div>`;
    }
  );
}

init();
