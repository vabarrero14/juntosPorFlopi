import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  getAuctionItem,
  createAuctionItem,
  updateAuctionItemDetails,
} from "../../js/auction-service.js";
import { compressImageToDataUrl } from "../../js/image-utils.js";

const form = document.getElementById("item-form");
const formTitle = document.getElementById("form-title");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photo-preview");

const itemId = new URLSearchParams(window.location.search).get("id");
let photoBase64 = undefined; // undefined = sin cambios, null = sin foto, string = nueva foto

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
  messageEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    photoBase64 = await compressImageToDataUrl(file);
    photoPreview.src = photoBase64;
    photoPreview.style.display = "block";
  } catch (error) {
    showMessage(error.message, "error");
    photoInput.value = "";
  }
});

async function prefillForm() {
  if (!itemId) return;
  formTitle.textContent = "Editar pieza";
  try {
    const item = await getAuctionItem(itemId);
    if (!item) {
      showMessage("No encontramos esa pieza.", "error");
      return;
    }
    form.name.value = item.name;
    form.desc.value = item.desc || "";
    form.base.value = item.base;
    form.inc.value = item.inc;
    form.durationMin.value = item.durationMin || 20;
    form.extendMin.value = item.extendMin ?? 2;
    if (item.photoBase64) {
      photoPreview.src = item.photoBase64;
      photoPreview.style.display = "block";
    }
  } catch (error) {
    console.error("Error cargando la pieza:", error);
    showMessage("No pudimos cargar la pieza para editarla.", "error");
  }
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "subastas" });

  await prefillForm();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const input = {
      name: form.name.value.trim(),
      desc: form.desc.value.trim(),
      base: Number(form.base.value),
      inc: Number(form.inc.value),
      durationMin: Number(form.durationMin.value),
      extendMin: Number(form.extendMin.value),
    };
    if (photoBase64 !== undefined) input.photoBase64 = photoBase64;

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      if (itemId) {
        await updateAuctionItemDetails(itemId, input);
      } else {
        await createAuctionItem(input);
      }
      window.location.href = "subastas.html";
    } catch (error) {
      console.error("Error guardando la pieza:", error);
      showMessage("No pudimos guardar la pieza. Probá de nuevo.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
    }
  });
}

init();
