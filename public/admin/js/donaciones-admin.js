import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  DONATION_TYPES,
  fetchAllDonations,
  createDonation,
  updateDonation,
  deleteDonation,
} from "../../js/donations-service.js";

const listEl = document.getElementById("donations-list");
const newBtn = document.getElementById("new-donation-btn");

const modal = document.getElementById("donation-modal");
const modalTitle = document.getElementById("donation-modal-title");
const modalCloseBtn = document.getElementById("donation-modal-close");
const form = document.getElementById("donation-form");
const messageEl = document.getElementById("donation-form-message");
const submitBtn = document.getElementById("donation-submit-btn");
const typeSelect = document.getElementById("donation-type");

DONATION_TYPES.forEach((t) => {
  const option = document.createElement("option");
  option.value = t.value;
  option.textContent = t.label;
  typeSelect.appendChild(option);
});

let editingId = null;

function openModal(donation) {
  editingId = donation?.id ?? null;
  modalTitle.textContent = donation ? "Editar medio de donación" : "Nuevo medio de donación";
  messageEl.hidden = true;
  form.type.value = donation?.type ?? DONATION_TYPES[0].value;
  form.title.value = donation?.title ?? "";
  form.details.value = donation?.details ?? "";
  form.order.value = donation?.order ?? 0;
  form.active.checked = donation ? donation.active : true;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

modalCloseBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
newBtn.addEventListener("click", () => openModal(null));

function renderRow(donation) {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-main">
      <span class="status-badge ${donation.active ? "status-approved" : "status-rejected"}">
        ${donation.active ? "Visible" : "Oculto"}
      </span>
      <strong>${donation.title}</strong>
      <div class="form-help">${donation.details}</div>
      <div class="form-help">Orden: ${donation.order}</div>
    </div>
    <div class="admin-row-actions"></div>
  `;

  const actions = row.querySelector(".admin-row-actions");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-outline";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", () => openModal(donation));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-outline";
  deleteBtn.textContent = "Eliminar";
  deleteBtn.addEventListener("click", async () => {
    if (!window.confirm(`¿Eliminar "${donation.title}"?`)) return;
    await deleteDonation(donation.id);
    await loadDonations();
  });
  actions.appendChild(deleteBtn);

  return row;
}

async function loadDonations() {
  try {
    const donations = await fetchAllDonations();
    if (donations.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Todavía no cargaste ningún medio de donación.</div>`;
      return;
    }
    listEl.innerHTML = "";
    donations.forEach((donation) => listEl.appendChild(renderRow(donation)));
  } catch (error) {
    console.error("Error cargando donaciones:", error);
    listEl.innerHTML = `<div class="empty-state">No pudimos cargar las donaciones.</div>`;
  }
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "donaciones" });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const input = {
      type: form.type.value,
      title: form.title.value.trim(),
      details: form.details.value.trim(),
      order: Number(form.order.value) || 0,
      active: form.active.checked,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      if (editingId) {
        await updateDonation(editingId, input);
      } else {
        await createDonation(input);
      }
      closeModal();
      await loadDonations();
    } catch (error) {
      console.error("Error guardando la donación:", error);
      messageEl.textContent = "No pudimos guardar. Probá de nuevo.";
      messageEl.className = "form-message error";
      messageEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
    }
  });

  await loadDonations();
}

init();
