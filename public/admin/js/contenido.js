import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import { fetchSiteContent, saveSiteContent } from "../../js/site-content-service.js";

const CONTENT_ID = "historia";

const form = document.getElementById("content-form");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "contenido" });

  try {
    const content = await fetchSiteContent(CONTENT_ID);
    if (content) {
      form.title.value = content.title ?? "";
      form.body.value = content.body ?? "";
    }
  } catch (error) {
    console.error("Error cargando el contenido:", error);
    showMessage("No pudimos cargar el contenido actual.", "error");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      await saveSiteContent(CONTENT_ID, {
        title: form.title.value.trim(),
        body: form.body.value.trim(),
      });
      showMessage("Guardado.", "success");
    } catch (error) {
      console.error("Error guardando el contenido:", error);
      showMessage("No pudimos guardar. Probá de nuevo.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
    }
  });
}

init();
