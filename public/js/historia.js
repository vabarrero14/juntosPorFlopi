import { fetchSiteContent } from "./site-content-service.js";

const titleEl = document.getElementById("historia-title");
const bodyEl = document.getElementById("historia-body");

// Si no hay contenido cargado en Firestore (o falla la carga), se deja el
// texto placeholder que ya está en el HTML como fallback.
async function init() {
  try {
    const content = await fetchSiteContent("historia");
    if (!content || !content.body) return;

    if (content.title) titleEl.textContent = content.title;

    bodyEl.innerHTML = "";
    content.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((paragraph) => {
        const p = document.createElement("p");
        p.textContent = paragraph;
        bodyEl.appendChild(p);
      });
  } catch (error) {
    console.error("Error cargando la historia de Flopi:", error);
  }
}

init();
