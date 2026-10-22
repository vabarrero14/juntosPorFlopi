import { requireEventAdmin } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { fetchTicketsForEvent } from "../../../js/tickets-service.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const root = document.getElementById("backup-root");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATUS_LABEL = { issued: "Válida", checked_in: "Ya ingresó", voided: "Anulada" };

async function init() {
  const ctx = await requireEventAdmin();
  renderEntradasNav({ ...ctx, activePage: "" });

  document.getElementById("print-btn").addEventListener("click", () => window.print());

  const tickets = await fetchTicketsForEvent(FLOPI_FEST_ID);
  tickets.sort((a, b) => a.holderName.localeCompare(b.holderName, "es"));

  if (tickets.length === 0) {
    root.innerHTML = `<p class="empty-state">Todavía no hay entradas emitidas.</p>`;
    return;
  }

  root.innerHTML = `
    <table class="backup-table">
      <thead>
        <tr><th>Nombre</th><th>Celular</th><th>Código corto</th><th>Estado</th></tr>
      </thead>
      <tbody>
        ${tickets
          .map(
            (t) =>
              `<tr><td>${esc(t.holderName)}${t.type === "courtesy" ? " (cortesía)" : ""}</td><td>${esc(t.holderPhone)}</td><td>${t.shortCode}</td><td>${STATUS_LABEL[t.status] || t.status}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

init();
