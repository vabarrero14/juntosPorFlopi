import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import { fetchAdmins, addAdmin, removeAdmin } from "../../js/admins-service.js";

const listEl = document.getElementById("admins-list");
const addForm = document.getElementById("add-admin-form");
const messageEl = document.getElementById("form-message");
const addBtn = document.getElementById("add-admin-btn");
const ownerNotice = document.getElementById("owner-only-notice");

let isOwner = false;
let currentUserEmail = null;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

function renderRow(admin) {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.innerHTML = `
    <div class="admin-row-main">
      <strong>${admin.email}</strong>
      <span class="category-tag">${admin.role === "owner" ? "Owner" : "Editor"}</span>
      ${admin.email === currentUserEmail ? '<span class="form-help">(vos)</span>' : ""}
    </div>
    <div class="admin-row-actions"></div>
  `;

  if (isOwner && admin.email !== currentUserEmail) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-outline";
    removeBtn.textContent = "Quitar acceso";
    removeBtn.addEventListener("click", async () => {
      if (!window.confirm(`¿Quitar el acceso de ${admin.email}?`)) return;
      await removeAdmin(admin.email);
      await loadAdmins();
    });
    row.querySelector(".admin-row-actions").appendChild(removeBtn);
  }

  return row;
}

async function loadAdmins() {
  try {
    const admins = await fetchAdmins();
    listEl.innerHTML = "";
    admins.forEach((admin) => listEl.appendChild(renderRow(admin)));
  } catch (error) {
    console.error("Error cargando administradores:", error);
    listEl.innerHTML = `<div class="empty-state">No pudimos cargar la lista de administradores.</div>`;
  }
}

async function init() {
  const { user, auth, signOut, admin } = await requireAdmin();
  currentUserEmail = user.email;
  isOwner = admin.role === "owner";
  renderAdminNav({ user, auth, signOut, activePage: "administradores" });

  if (!isOwner) {
    addForm.hidden = true;
    ownerNotice.hidden = false;
  }

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const email = addForm.email.value.trim().toLowerCase();
    const role = addForm.role.value;

    addBtn.disabled = true;
    addBtn.textContent = "Agregando…";

    try {
      await addAdmin(email, role);
      addForm.reset();
      await loadAdmins();
    } catch (error) {
      console.error("Error agregando administrador:", error);
      showMessage("No pudimos agregar el administrador. Probá de nuevo.", "error");
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Agregar administrador";
    }
  });

  await loadAdmins();
}

init();
