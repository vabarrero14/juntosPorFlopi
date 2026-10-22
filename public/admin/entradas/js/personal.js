import { requireEventAdmin } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { fetchEventStaff, addEventStaff, removeEventStaff } from "../../../js/event-staff-service.js";

const listEl = document.getElementById("staff-list");
const addForm = document.getElementById("add-staff-form");
const messageEl = document.getElementById("form-message");
const addBtn = document.getElementById("add-staff-btn");

const ROLE_LABEL = { vendedor: "Vendedor", puerta: "Puerta" };

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

function renderRow(staff) {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-main">
      <strong>${staff.email}</strong>
      <span class="category-tag">${ROLE_LABEL[staff.role] || staff.role}</span>
      ${staff.active === false ? '<span class="form-help">(inactivo)</span>' : ""}
    </div>
    <div class="admin-row-actions"></div>
  `;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-outline";
  removeBtn.textContent = "Quitar acceso";
  removeBtn.addEventListener("click", async () => {
    if (!window.confirm(`¿Quitar el acceso de ${staff.email}?`)) return;
    await removeEventStaff(staff.email);
    await loadStaff();
  });
  row.querySelector(".admin-row-actions").appendChild(removeBtn);

  return row;
}

async function loadStaff() {
  try {
    const staff = await fetchEventStaff();
    listEl.innerHTML = "";
    if (staff.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Todavía no agregaste a nadie.</div>`;
      return;
    }
    staff.forEach((s) => listEl.appendChild(renderRow(s)));
  } catch (error) {
    console.error("Error cargando el personal:", error);
    listEl.innerHTML = `<div class="empty-state">No pudimos cargar la lista.</div>`;
  }
}

async function init() {
  const ctx = await requireEventAdmin();
  renderEntradasNav({ ...ctx, activePage: "personal" });

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const email = addForm.email.value.trim().toLowerCase();
    const role = addForm.role.value;

    addBtn.disabled = true;
    addBtn.textContent = "Agregando…";

    try {
      await addEventStaff(email, role);
      addForm.reset();
      await loadStaff();
    } catch (error) {
      console.error("Error agregando personal:", error);
      showMessage("No pudimos agregar a esa persona. Probá de nuevo.", "error");
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Agregar";
    }
  });

  await loadStaff();
}

init();
