import { getTicketEvent } from "./ticket-events-service.js";
import { formatFullDate } from "./date-utils.js";
import { FLOPI_FEST_ID } from "./ticket-event-constants.js";

const root = document.getElementById("fest-root");
const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function init() {
  const event = await getTicketEvent(FLOPI_FEST_ID).catch(() => null);

  if (!event) {
    root.innerHTML = `<div class="empty-state">Todavía no publicamos los detalles de este evento. Volvé pronto.</div>`;
    return;
  }

  root.innerHTML = `
    <div class="card">
      <h2 class="mt-0">${esc(event.name)}</h2>
      <p class="form-help mt-0">${esc(event.venue)} · ${esc(formatFullDate(event.date))}</p>
      ${event.description ? `<p>${esc(event.description)}</p>` : ""}
      ${
        event.artists && event.artists.length
          ? `<p><strong>Artistas:</strong> ${event.artists.map(esc).join(", ")}</p>`
          : ""
      }
      <p class="form-help">A beneficio de Flopi.</p>
    </div>

    <div class="card">
      <h3 class="mt-0">Entradas</h3>
      <p>Anticipada: <strong>${gs(event.priceEarly)}</strong></p>
      <p>En puerta: <strong>${gs(event.priceDoor)}</strong></p>
      ${
        event.salesOpen === false
          ? `<p class="form-message">La venta anticipada está cerrada por ahora. Podés conseguir tu entrada en puerta.</p>`
          : `<p>Para conseguir tu entrada anticipada, escribinos por <a href="https://www.instagram.com/juntosporflopi" target="_blank" rel="noopener">Instagram</a> o por WhatsApp a algún organizador.</p>`
      }
    </div>
  `;
}

init();
