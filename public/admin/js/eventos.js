import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  fetchAllEvents,
  approveEvent,
  rejectEvent,
  deleteEvent,
  categoryLabel,
} from "../../js/events-service.js";
import { formatFullDate } from "../../js/date-utils.js";

const tabsEl = document.getElementById("tabs");
const listEl = document.getElementById("events-list");

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
};

let allEvents = [];
let currentTab = new URLSearchParams(window.location.search).get("tab") || "pending";
let adminEmail = null;

function setActiveTab(tab) {
  currentTab = tab;
  tabsEl.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  render();
}

function getVisibleEvents() {
  if (currentTab === "all") return allEvents;
  return allEvents.filter((e) => e.status === currentTab);
}

function renderRow(event) {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-main">
      <span class="status-badge status-${event.status}">${STATUS_LABELS[event.status] ?? event.status}</span>
      <strong>${event.title}</strong>
      <span class="category-tag">${categoryLabel(event.category)}</span>
      <div class="form-help">${formatFullDate(event.date)} · ${event.location?.address ?? ""}</div>
      <div class="form-help">Organiza: ${event.organizer}${event.submittedBy?.email ? ` · Propuesto por: ${event.submittedBy.email}` : ""}</div>
      ${event.rejectionReason ? `<div class="form-help">Motivo de rechazo: ${event.rejectionReason}</div>` : ""}
    </div>
    <div class="admin-row-actions"></div>
  `;

  const actions = row.querySelector(".admin-row-actions");

  if (event.status !== "approved") {
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn btn-primary";
    approveBtn.textContent = "Aprobar";
    approveBtn.addEventListener("click", async () => {
      await approveEvent(event.id, adminEmail);
      await loadEvents();
    });
    actions.appendChild(approveBtn);
  }

  if (event.status === "pending") {
    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "btn btn-outline";
    rejectBtn.textContent = "Rechazar";
    rejectBtn.addEventListener("click", async () => {
      const reason = window.prompt("Motivo del rechazo (opcional):", "");
      if (reason === null) return;
      await rejectEvent(event.id, adminEmail, reason);
      await loadEvents();
    });
    actions.appendChild(rejectBtn);
  }

  const editLink = document.createElement("a");
  editLink.href = `evento-form.html?id=${event.id}`;
  editLink.className = "btn btn-outline";
  editLink.textContent = "Editar";
  actions.appendChild(editLink);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-outline";
  deleteBtn.textContent = "Eliminar";
  deleteBtn.addEventListener("click", async () => {
    if (!window.confirm(`¿Eliminar el evento "${event.title}"? Esta acción no se puede deshacer.`)) return;
    await deleteEvent(event.id);
    await loadEvents();
  });
  actions.appendChild(deleteBtn);

  return row;
}

function render() {
  const events = getVisibleEvents();
  if (events.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No hay eventos en esta categoría.</div>`;
    return;
  }
  listEl.innerHTML = "";
  events.forEach((event) => listEl.appendChild(renderRow(event)));
}

async function loadEvents() {
  try {
    allEvents = await fetchAllEvents();
    render();
  } catch (error) {
    console.error("Error cargando eventos:", error);
    listEl.innerHTML = `<div class="empty-state">No pudimos cargar los eventos.</div>`;
  }
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  adminEmail = user.email;
  renderAdminNav({ user, auth, signOut, activePage: "eventos" });

  tabsEl.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
  setActiveTab(currentTab);

  await loadEvents();
}

init();
