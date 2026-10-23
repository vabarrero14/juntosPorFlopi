import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { watchOrder, cancelOrder, updateRaffleNumbers, addRaffleToOrder } from "../../../js/orders-service.js";
import { getTicketEvent } from "../../../js/ticket-events-service.js";
import {
  registerCashPayment,
  registerTransferPayment,
  confirmTransferPayment,
  voidPayment,
  fetchPaymentsForOrder,
} from "../../../js/payments-service.js";
import { issueTicket, fetchTicketsByOrder } from "../../../js/tickets-service.js";

const STATUS_LABEL = { reserved: "Reservado", partial: "Parcial", paid: "Pagado", cancelled: "Cancelado" };
const PAYMENT_STATUS_LABEL = { pending_confirm: "Por confirmar", confirmed: "Confirmado", voided: "Anulado" };
const TICKET_STATUS_LABEL = { issued: "Emitida", checked_in: "Ingresó", voided: "Anulada" };
const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const orderId = new URLSearchParams(window.location.search).get("id");
const root = document.getElementById("order-root");

let ctx = null;
let currentOrder = null;
let currentPayments = [];
let currentTickets = [];
let shellBuilt = false;
let ticketEvent = null;

function buildShell() {
  root.innerHTML = `
    <div class="card">
      <span class="badge" id="p-status-badge"></span>
      <h2 class="mt-0" id="p-buyer"></h2>
      <div class="form-help" id="p-summary"></div>
      <div class="admin-row-actions" id="p-order-actions" style="margin-top: 10px;"></div>
    </div>

    <div class="card">
      <h3>Pagos</h3>
      <div id="p-payments-list"></div>
      <form id="payment-form" class="form" style="margin-top: 16px;">
        <div id="payment-message" class="form-message" hidden></div>
        <div class="form-row-group">
          <div class="form-row">
            <label for="pay-amount">Monto (Gs.)</label>
            <input id="pay-amount" type="number" min="1" step="1" required />
          </div>
          <div class="form-row">
            <label for="pay-method">Método</label>
            <select id="pay-method">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
          <div class="form-row" id="pay-reference-row" hidden>
            <label for="pay-reference">N° de comprobante / alias</label>
            <input id="pay-reference" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary" id="pay-submit-btn">Registrar pago</button>
      </form>
    </div>

    <div class="card" id="raffle-card" hidden>
      <h3 class="mt-0">Rifa</h3>
      <div class="form-help" id="raffle-info"></div>

      <div id="raffle-numbers-section" hidden>
        <div class="form-row">
          <label for="raffle-numbers-input">Números del talonario entregados</label>
          <textarea id="raffle-numbers-input" rows="2" placeholder="Ej: 14, 15, 16"></textarea>
        </div>
        <div id="raffle-numbers-message" class="form-message" hidden></div>
        <button type="button" class="btn btn-outline" id="raffle-numbers-btn" style="margin-top: 8px;">Guardar números</button>
      </div>

      <div class="form-row-group" style="margin-top: 16px; align-items: flex-end;">
        <div class="form-row">
          <label for="add-raffle-input">Agregar números de rifa</label>
          <input id="add-raffle-input" type="number" min="1" step="1" value="1" />
        </div>
        <button type="button" class="btn btn-primary" id="add-raffle-btn">Agregar</button>
      </div>
      <div id="add-raffle-message" class="form-message" hidden></div>
    </div>

    <div class="card" id="emit-card" hidden>
      <h3>Emitir entradas</h3>
      <div class="form-help" id="emit-info"></div>
      <div class="form-row-group">
        <div class="form-row">
          <label for="emit-name">Nombre en la entrada</label>
          <input id="emit-name" />
        </div>
        <div class="form-row">
          <label for="emit-phone">Celular</label>
          <input id="emit-phone" />
        </div>
      </div>
      <button type="button" class="btn btn-primary" id="emit-btn">Emitir entrada</button>
      <div id="emit-tickets-list" style="margin-top: 16px;"></div>
    </div>
  `;

  document.getElementById("pay-method").addEventListener("change", (e) => {
    document.getElementById("pay-reference-row").hidden = e.target.value !== "transfer";
  });
  document.getElementById("payment-form").addEventListener("submit", onSubmitPayment);
  document.getElementById("emit-btn").addEventListener("click", onEmitTicket);
  document.getElementById("raffle-numbers-btn").addEventListener("click", onSaveRaffleNumbers);
  document.getElementById("add-raffle-btn").addEventListener("click", onAddRaffle);

  shellBuilt = true;
}

async function onAddRaffle() {
  const input = document.getElementById("add-raffle-input");
  const msg = document.getElementById("add-raffle-message");
  const btn = document.getElementById("add-raffle-btn");
  const additionalQuantity = Math.round(Number(input.value));

  msg.hidden = true;
  if (!additionalQuantity || additionalQuantity <= 0) {
    msg.textContent = "Ingresá una cantidad válida.";
    msg.className = "form-message error";
    msg.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    await addRaffleToOrder(orderId, additionalQuantity);
    input.value = 1;
    msg.textContent = "Agregado. Revisá el saldo pendiente en Pagos.";
    msg.className = "form-message success";
    msg.hidden = false;
  } catch (error) {
    console.error("Error agregando rifa al pedido:", error);
    msg.textContent = "No pudimos agregar la rifa. Probá de nuevo.";
    msg.className = "form-message error";
    msg.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function onSaveRaffleNumbers() {
  const input = document.getElementById("raffle-numbers-input");
  const msg = document.getElementById("raffle-numbers-message");
  const btn = document.getElementById("raffle-numbers-btn");
  const numbers = input.value
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  btn.disabled = true;
  try {
    await updateRaffleNumbers(orderId, numbers);
    msg.textContent = "Guardado.";
    msg.className = "form-message success";
    msg.hidden = false;
  } catch (error) {
    console.error("Error guardando los números de rifa:", error);
    msg.textContent = "No pudimos guardar. Probá de nuevo.";
    msg.className = "form-message error";
    msg.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function renderOrderSummary() {
  const o = currentOrder;
  document.getElementById("p-status-badge").className = "badge " + o.status;
  document.getElementById("p-status-badge").textContent = STATUS_LABEL[o.status] || o.status;
  document.getElementById("p-buyer").textContent = o.buyerName + (o.collaboration ? " (colaboración)" : "");
  const saldo = o.total - o.amountConfirmedTotal;
  const bits = [];
  if (o.quantity > 0) bits.push(`${o.quantity} entrada(s) ${o.channel === "puerta" ? "(puerta)" : "(anticipada)"}`);
  if (o.raffleQuantity > 0) bits.push(`${o.raffleQuantity} número(s) de rifa`);
  document.getElementById("p-summary").innerHTML = `
    ${esc(o.buyerPhone)} · ${bits.join(" · ")}<br/>
    Total ${gs(o.total)} · Pagado ${gs(o.amountConfirmedTotal)} · Saldo ${gs(Math.max(0, saldo))}
    ${o.collaboration ? "<br/><strong>Colaboración: en principio no va a asistir. Si decide venir, se le puede emitir la entrada igual.</strong>" : ""}
  `;

  const raffleCard = document.getElementById("raffle-card");
  const raffleNumbersSection = document.getElementById("raffle-numbers-section");
  const hasRaffle = o.raffleQuantity > 0;
  // Siempre visible si el evento vende rifa (para poder agregar, aunque
  // este pedido todavía no tenga ninguna -- incluye pedidos viejos
  // cargados antes de que la rifa existiera como opción); si no vende
  // rifa, directamente no tiene sentido mostrar nada de esto.
  raffleCard.hidden = !(ticketEvent && ticketEvent.raffleEnabled);
  raffleNumbersSection.hidden = !hasRaffle;
  document.getElementById("raffle-info").textContent = hasRaffle
    ? `Compró ${o.raffleQuantity} número(s) de rifa.`
    : "Todavía no compró números de rifa.";
  if (hasRaffle) {
    const raffleInput = document.getElementById("raffle-numbers-input");
    if (document.activeElement !== raffleInput) {
      raffleInput.value = (o.raffleNumbers || []).join(", ");
    }
  }

  const actions = document.getElementById("p-order-actions");
  actions.innerHTML = "";
  if (ctx.isAdmin && o.status !== "cancelled" && currentTickets.length === 0) {
    const btn = document.createElement("button");
    btn.className = "btn btn-outline";
    btn.textContent = "Cancelar pedido";
    btn.addEventListener("click", async () => {
      if (!window.confirm("¿Cancelar este pedido? No se puede deshacer.")) return;
      await cancelOrder(orderId);
    });
    actions.appendChild(btn);
  }

  const payAmountInput = document.getElementById("pay-amount");
  if (document.activeElement !== payAmountInput && saldo > 0) {
    payAmountInput.value = saldo;
  }

  const payForm = document.getElementById("payment-form");
  payForm.hidden = o.status === "cancelled" || o.status === "paid";
}

function renderPayments() {
  const box = document.getElementById("p-payments-list");
  if (currentPayments.length === 0) {
    box.innerHTML = `<p class="mute">Todavía no se registró ningún pago.</p>`;
    return;
  }
  box.innerHTML = "";
  currentPayments.forEach((p) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `
      <div>
        <span class="badge ${p.status}">${PAYMENT_STATUS_LABEL[p.status] || p.status}</span>
        <strong>${gs(p.amount)}</strong> · ${p.method === "cash" ? "Efectivo" : "Transferencia"}
        ${p.reference ? " · " + esc(p.reference) : ""}
        <div class="form-help">Recibido por ${esc(p.receivedByEmail)}${p.settled ? " · rendido" : ""}</div>
      </div>
      <div class="admin-row-actions"></div>
    `;
    const actionsBox = row.querySelector(".admin-row-actions");
    if (ctx.isAdmin) {
      if (p.status === "pending_confirm") {
        const confirmBtn = document.createElement("button");
        confirmBtn.className = "btn btn-primary";
        confirmBtn.textContent = "Confirmar";
        confirmBtn.addEventListener("click", async () => {
          confirmBtn.disabled = true;
          try {
            await confirmTransferPayment(p.id, ctx.user.email);
            await refreshPayments();
          } catch (error) {
            console.error("Error confirmando transferencia:", error);
            window.alert("No pudimos confirmar el pago.");
            confirmBtn.disabled = false;
          }
        });
        actionsBox.appendChild(confirmBtn);
      }
      if (p.status !== "voided") {
        const voidBtn = document.createElement("button");
        voidBtn.className = "btn btn-outline";
        voidBtn.textContent = "Anular";
        voidBtn.addEventListener("click", async () => {
          const reason = window.prompt("Motivo de la anulación (opcional):") || "";
          try {
            await voidPayment(p.id, reason);
            await refreshPayments();
          } catch (error) {
            console.error("Error anulando pago:", error);
            window.alert("No pudimos anular el pago.");
          }
        });
        actionsBox.appendChild(voidBtn);
      }
    }
    box.appendChild(row);
  });
}

function ticketUrl(code) {
  return `${window.location.origin}/entrada.html?c=${code}`;
}

function renderTickets() {
  const emitCard = document.getElementById("emit-card");
  const emitRelevant = currentOrder.status === "paid" && currentOrder.quantity > 0;
  emitCard.hidden = !emitRelevant;
  if (!emitRelevant) return;

  const remaining = currentOrder.quantity - currentTickets.length;
  const collabNote = currentOrder.collaboration
    ? " Era una colaboración (no iba a asistir) -- si al final decide venir, emitile la entrada igual."
    : "";
  document.getElementById("emit-info").textContent =
    (remaining > 0
      ? `Emitidas ${currentTickets.length} de ${currentOrder.quantity}.`
      : `Ya se emitieron las ${currentOrder.quantity} entradas de este pedido.`) + collabNote;
  document.getElementById("emit-btn").hidden = remaining <= 0;

  if (!document.getElementById("emit-name").value) {
    document.getElementById("emit-name").value = currentOrder.buyerName;
    document.getElementById("emit-phone").value = currentOrder.buyerPhone;
  }

  const list = document.getElementById("emit-tickets-list");
  if (currentTickets.length === 0) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = "";
  currentTickets.forEach((t) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `
      <div>
        <strong>${esc(t.holderName)}</strong>
        <span class="badge ${t.status}">${TICKET_STATUS_LABEL[t.status] || t.status}</span>
        <div class="ticket-code">${t.shortCode}</div>
      </div>
    `;
    const link = document.createElement("a");
    link.href = ticketUrl(t.id);
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn btn-outline";
    link.textContent = "Ver entrada";
    row.appendChild(link);
    list.appendChild(row);
  });
}

async function refreshPayments() {
  currentPayments = await fetchPaymentsForOrder(orderId);
  renderPayments();
}

async function refreshTickets() {
  currentTickets = await fetchTicketsByOrder(orderId);
  renderTickets();
}

async function onSubmitPayment(e) {
  e.preventDefault();
  const msg = document.getElementById("payment-message");
  msg.hidden = true;
  const btn = document.getElementById("pay-submit-btn");
  const amount = Math.round(Number(document.getElementById("pay-amount").value));
  const method = document.getElementById("pay-method").value;
  const reference = document.getElementById("pay-reference").value.trim();

  if (!amount || amount <= 0) {
    msg.textContent = "Ingresá un monto válido.";
    msg.className = "form-message error";
    msg.hidden = false;
    return;
  }
  if (method === "transfer" && !reference) {
    msg.textContent = "Para una transferencia hace falta el n° de comprobante o alias.";
    msg.className = "form-message error";
    msg.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    if (method === "cash") {
      await registerCashPayment({ orderId, ticketEventId: currentOrder.ticketEventId, amount, receivedByUid: ctx.user.uid, receivedByEmail: ctx.user.email });
    } else {
      await registerTransferPayment({ orderId, ticketEventId: currentOrder.ticketEventId, amount, reference, receivedByUid: ctx.user.uid, receivedByEmail: ctx.user.email });
    }
    document.getElementById("pay-reference").value = "";
    await refreshPayments();
  } catch (error) {
    console.error("Error registrando el pago:", error);
    msg.textContent = "No pudimos registrar el pago. Probá de nuevo.";
    msg.className = "form-message error";
    msg.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar pago";
  }
}

async function onEmitTicket() {
  const btn = document.getElementById("emit-btn");
  const holderName = document.getElementById("emit-name").value.trim() || currentOrder.buyerName;
  const holderPhone = document.getElementById("emit-phone").value.trim() || currentOrder.buyerPhone;

  btn.disabled = true;
  btn.textContent = "Emitiendo…";
  try {
    await issueTicket({
      ticketEventId: currentOrder.ticketEventId,
      orderId,
      holderName,
      holderPhone,
      issuedByUid: ctx.user.uid,
      issuedByEmail: ctx.user.email,
    });
    await refreshTickets();
  } catch (error) {
    console.error("Error emitiendo la entrada:", error);
    window.alert("No pudimos emitir la entrada. Probá de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Emitir entrada";
  }
}

async function init() {
  if (!orderId) {
    root.innerHTML = `<div class="empty-state">Falta indicar el pedido.</div>`;
    return;
  }
  ctx = await requireEventStaff();
  renderEntradasNav({ ...ctx, activePage: "pedidos" });

  watchOrder(
    orderId,
    async (order) => {
      if (!order) {
        root.innerHTML = `<div class="empty-state">Este pedido ya no existe.</div>`;
        return;
      }
      const isFirstLoad = !shellBuilt;
      currentOrder = order;
      if (isFirstLoad) {
        ticketEvent = await getTicketEvent(order.ticketEventId).catch(() => null);
      }
      if (!shellBuilt) buildShell();
      renderOrderSummary();
      renderTickets();
      if (isFirstLoad) {
        await refreshPayments();
        await refreshTickets();
      }
    },
    (error) => {
      console.error("Error cargando el pedido:", error);
      root.innerHTML = `<div class="empty-state">No pudimos cargar este pedido.</div>`;
    }
  );
}

init();
