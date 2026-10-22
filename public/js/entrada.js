import { getTicket } from "./tickets-service.js";
import { getTicketEvent } from "./ticket-events-service.js";
import { renderQrToCanvas } from "./qr-utils.js";
import { formatFullDate } from "./date-utils.js";

const root = document.getElementById("ticket-root");
const code = new URLSearchParams(window.location.search).get("c");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

async function init() {
  if (!code) {
    root.innerHTML = `<div class="empty-state">Falta el código de la entrada.</div>`;
    return;
  }

  let ticket;
  try {
    ticket = await getTicket(code);
  } catch (error) {
    console.error("Error cargando la entrada:", error);
    root.innerHTML = `<div class="empty-state">No pudimos cargar esta entrada. Probá de nuevo en unos segundos.</div>`;
    return;
  }

  if (!ticket) {
    root.innerHTML = `<div class="empty-state">No encontramos esta entrada. Revisá el link.</div>`;
    return;
  }

  const event = await getTicketEvent(ticket.ticketEventId).catch(() => null);

  let statusBanner = "";
  if (ticket.status === "voided") {
    statusBanner = `<div class="form-message error">Esta entrada fue anulada. Hablá con el organizador si creés que es un error.</div>`;
  } else if (ticket.status === "checked_in") {
    const when = ticket.checkedInAt ? `${pad(ticket.checkedInAt.getHours())}:${pad(ticket.checkedInAt.getMinutes())}` : "";
    statusBanner = `<div class="form-message success">Ya ingresaste${when ? " a las " + when : ""}. Si volvés a entrar, mostrale esta pantalla a la persona de la puerta.</div>`;
  }

  root.innerHTML = `
    <div class="card text-center">
      <h2 class="mt-0">${esc(ticket.holderName)}</h2>
      ${event ? `<p class="mb-0"><strong>${esc(event.name)}</strong></p>` : ""}
      ${event ? `<p class="form-help mt-0">${esc(event.venue)} · ${esc(formatFullDate(event.date))}</p>` : ""}
      ${statusBanner}
      <canvas id="qr-canvas" style="margin: 16px auto; display: block;"></canvas>
      <p class="form-help">Presentá este código en la puerta. Es personal e intransferible.</p>
      <button type="button" id="share-btn" class="btn btn-primary">Compartir por WhatsApp</button>
    </div>
  `;

  try {
    await renderQrToCanvas(document.getElementById("qr-canvas"), ticket.id);
  } catch (error) {
    console.error("Error generando el QR:", error);
    document.getElementById("qr-canvas").outerHTML = `<p class="form-message error">No pudimos generar el código QR. Mostrá este link en la puerta: ${esc(window.location.href)}</p>`;
  }

  document.getElementById("share-btn").addEventListener("click", () => {
    const text = `Mi entrada para ${event?.name || "Flopi Fest"}: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });
}

init();
