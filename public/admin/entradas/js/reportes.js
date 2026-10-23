import { requireEventAdmin } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { fetchAllOrders } from "../../../js/orders-service.js";
import { fetchPaymentsForEvent, markPaymentsSettled } from "../../../js/payments-service.js";
import { fetchTicketsForEvent } from "../../../js/tickets-service.js";
import { toCsv, downloadCsv } from "../../../js/csv-utils.js";
import { anonymizeEventData } from "../../../js/privacy-utils.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const root = document.getElementById("report-root");
const gs = (n) => "Gs. " + Number(n || 0).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let orders = [];
let payments = [];
let tickets = [];

function groupSum(items, keyFn, valueFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + valueFn(item));
  });
  return map;
}

function render() {
  const confirmedPayments = payments.filter((p) => p.status === "confirmed");
  const totalByMethod = groupSum(confirmedPayments, (p) => p.method, (p) => p.amount);
  const totalBySeller = groupSum(confirmedPayments, (p) => p.receivedByEmail, (p) => p.amount);
  const totalRecaudado = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);

  const pendingOrders = orders.filter((o) => o.status === "reserved" || o.status === "partial");
  const pendingTransfers = payments.filter((p) => p.status === "pending_confirm");

  const cashToSettle = confirmedPayments.filter((p) => p.method === "cash" && !p.settled);
  const cashToSettleBySeller = new Map();
  cashToSettle.forEach((p) => {
    const key = p.receivedByEmail;
    if (!cashToSettleBySeller.has(key)) cashToSettleBySeller.set(key, []);
    cashToSettleBySeller.get(key).push(p);
  });

  const validTickets = tickets.filter((t) => t.status !== "voided");
  const courtesyCount = validTickets.filter((t) => t.type === "courtesy").length;
  const checkedInCount = validTickets.filter((t) => t.status === "checked_in").length;
  const pendingEntryCount = validTickets.filter((t) => t.status === "issued").length;

  const paidOrders = orders.filter((o) => o.status === "paid");
  const raffleSold = paidOrders.reduce((sum, o) => sum + (o.raffleQuantity || 0), 0);
  const raffleRecaudado = paidOrders.reduce((sum, o) => sum + (o.raffleQuantity || 0) * (o.raffleUnitPrice || 0), 0);
  const collaborationCount = orders.filter((o) => o.collaboration && o.status !== "cancelled").length;

  root.innerHTML = `
    <div class="cards-grid">
      <div class="card">
        <h3 class="mt-0">Total recaudado</h3>
        <p style="font-size: 1.6rem; font-weight: 700;" class="mb-0">${gs(totalRecaudado)}</p>
      </div>
      <div class="card">
        <h3 class="mt-0">Entradas emitidas</h3>
        <p style="font-size: 1.6rem; font-weight: 700;" class="mb-0">${validTickets.length}</p>
        <p class="form-help mb-0">${courtesyCount} cortesías</p>
      </div>
      <div class="card">
        <h3 class="mt-0">Ingresaron</h3>
        <p style="font-size: 1.6rem; font-weight: 700;" class="mb-0">${checkedInCount} / ${validTickets.length}</p>
        <p class="form-help mb-0">${pendingEntryCount} todavía no entraron</p>
      </div>
      <div class="card">
        <h3 class="mt-0">Rifa</h3>
        <p style="font-size: 1.6rem; font-weight: 700;" class="mb-0">${raffleSold} número(s)</p>
        <p class="form-help mb-0">${gs(raffleRecaudado)} recaudado · ${collaborationCount} colaboración(es)</p>
      </div>
    </div>

    <div class="card">
      <h3 class="mt-0">Por método de pago</h3>
      ${[...totalByMethod.entries()].map(([method, amount]) => `<p class="mb-0">${method === "cash" ? "Efectivo" : "Transferencia"}: <strong>${gs(amount)}</strong></p>`).join("") || '<p class="mute">Sin pagos confirmados todavía.</p>'}
    </div>

    <div class="card">
      <h3 class="mt-0">Por vendedor</h3>
      ${[...totalBySeller.entries()].map(([email, amount]) => `<p class="mb-0">${esc(email)}: <strong>${gs(amount)}</strong></p>`).join("") || '<p class="mute">Sin pagos confirmados todavía.</p>'}
    </div>

    <div class="card">
      <h3 class="mt-0">Pedidos pendientes de cobro (${pendingOrders.length})</h3>
      ${
        pendingOrders.length === 0
          ? '<p class="mute">No hay pedidos pendientes.</p>'
          : pendingOrders
              .map(
                (o) => `<div class="entry-row"><div><strong>${esc(o.buyerName)}</strong> · ${gs(o.total - o.amountConfirmedTotal)} pendiente</div>
                <a class="btn btn-outline" href="pedido.html?id=${o.id}">Ver</a></div>`
              )
              .join("")
      }
    </div>

    <div class="card">
      <h3 class="mt-0">Transferencias por confirmar (${pendingTransfers.length})</h3>
      ${
        pendingTransfers.length === 0
          ? '<p class="mute">No hay transferencias pendientes.</p>'
          : pendingTransfers
              .map(
                (p) => `<div class="entry-row"><div>${gs(p.amount)} · ${esc(p.reference)} · ${esc(p.receivedByEmail)}</div>
                <a class="btn btn-outline" href="pedido.html?id=${p.orderId}">Ver pedido</a></div>`
              )
              .join("")
      }
    </div>

    <div class="card">
      <h3 class="mt-0">Efectivo por rendir</h3>
      ${
        cashToSettleBySeller.size === 0
          ? '<p class="mute">No hay efectivo pendiente de rendir.</p>'
          : [...cashToSettleBySeller.entries()]
              .map(([email, items]) => {
                const total = items.reduce((s, p) => s + p.amount, 0);
                return `<div class="entry-row">
                  <div><strong>${esc(email)}</strong> · ${gs(total)} (${items.length} pago(s))</div>
                  <button class="btn btn-primary settle-btn" data-email="${esc(email)}">Marcar rendido</button>
                </div>`;
              })
              .join("")
      }
    </div>
  `;

  root.querySelectorAll(".settle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      const ids = cashToSettleBySeller.get(email).map((p) => p.id);
      btn.disabled = true;
      try {
        await markPaymentsSettled(ids);
        await loadData();
      } catch (error) {
        console.error("Error marcando como rendido:", error);
        window.alert("No pudimos actualizar. Probá de nuevo.");
        btn.disabled = false;
      }
    });
  });
}

async function loadData() {
  [orders, payments, tickets] = await Promise.all([
    fetchAllOrders(FLOPI_FEST_ID),
    fetchPaymentsForEvent(FLOPI_FEST_ID),
    fetchTicketsForEvent(FLOPI_FEST_ID),
  ]);
  render();
}

function setupExports() {
  document.getElementById("export-orders-btn").addEventListener("click", () => {
    const csv = toCsv(orders, [
      { label: "Comprador", value: (o) => o.buyerName },
      { label: "Celular", value: (o) => o.buyerPhone },
      { label: "Cantidad entradas", value: (o) => o.quantity },
      { label: "Canal", value: (o) => o.channel },
      { label: "Números de rifa", value: (o) => o.raffleQuantity || 0 },
      { label: "Rifa entregados", value: (o) => (o.raffleNumbers || []).join(" ") },
      { label: "Colaboración", value: (o) => (o.collaboration ? "sí" : "no") },
      { label: "Total", value: (o) => o.total },
      { label: "Pagado", value: (o) => o.amountConfirmedTotal },
      { label: "Estado", value: (o) => o.status },
      { label: "Vendedor", value: (o) => o.sellerEmail },
      { label: "Fecha", value: (o) => (o.createdAt ? o.createdAt.toISOString() : "") },
    ]);
    downloadCsv("pedidos-flopi-fest.csv", csv);
  });

  document.getElementById("export-tickets-btn").addEventListener("click", () => {
    const csv = toCsv(tickets, [
      { label: "Nombre", value: (t) => t.holderName },
      { label: "Celular", value: (t) => t.holderPhone },
      { label: "Código corto", value: (t) => t.shortCode },
      { label: "Tipo", value: (t) => (t.type === "courtesy" ? "Cortesía" : "Paga") },
      { label: "Estado", value: (t) => t.status },
      { label: "Ingresó a las", value: (t) => (t.checkedInAt ? t.checkedInAt.toISOString() : "") },
    ]);
    downloadCsv("entradas-flopi-fest.csv", csv);
  });
}

function setupAnonymize() {
  document.getElementById("anonymize-btn").addEventListener("click", async () => {
    if (
      !window.confirm(
        `¿Anonimizar nombres y celulares de ${orders.length} pedido(s) y ${tickets.length} entrada(s)? No se puede deshacer.`
      )
    ) {
      return;
    }
    const btn = document.getElementById("anonymize-btn");
    btn.disabled = true;
    btn.textContent = "Anonimizando…";
    try {
      await anonymizeEventData(orders, tickets);
      await loadData();
      window.alert("Listo. Se anonimizaron los nombres y celulares.");
    } catch (error) {
      console.error("Error anonimizando datos:", error);
      window.alert("No pudimos completar la anonimización. Probá de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Anonimizar nombres y celulares";
    }
  });
}

async function init() {
  const ctx = await requireEventAdmin();
  renderEntradasNav({ ...ctx, activePage: "reportes" });
  setupExports();
  setupAnonymize();
  await loadData();
}

init();
