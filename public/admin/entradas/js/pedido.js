import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { watchOrder, cancelOrder, updateRaffleNumbers, addRaffleToOrder, removeRaffleFromOrder, deleteOrderCascade } from "../../../js/orders-service.js";
import { getTicketEvent } from "../../../js/ticket-events-service.js";
import {
  registerCashPayment,
  registerTransferPayment,
  confirmTransferPayment,
  voidPayment,
  fetchPaymentsForOrder,
} from "../../../js/payments-service.js";
import { issueTicket, fetchTicketsByOrder, updateTicketHolder, deleteTicket } from "../../../js/tickets-service.js";

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

      <div id="raffle-remove-section" hidden style="margin-top: 8px;">
        <button type="button" class="btn btn-outline" id="remove-raffle-btn">Quitar rifa de este pedido</button>
      </div>

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
  document.getElementById("remove-raffle-btn").addEventListener("click", onRemoveRaffle);

  shellBuilt = true;
}

// Admin: borra el pedido completo, con todo lo que tenga atado --
// entradas emitidas (libera su cupo) y pagos registrados. Avisa con
// el detalle de lo que se va a perder antes de dejar confirmar.
async function onDeleteOrder() {
  const o = currentOrder;
  const bits = [];
  if (currentTickets.length > 0) bits.push(`${currentTickets.length} entrada(s) emitida(s)`);
  if (currentPayments.length > 0) bits.push(`${currentPayments.length} pago(s) registrado(s) (${gs(o.amountConfirmedTotal)} confirmado)`);
  const detail = bits.length > 0 ? `\n\nSe va a perder: ${bits.join(" y ")}.` : "";
  if (!window.confirm(`¿Eliminar definitivamente el pedido de ${o.buyerName}? No se puede deshacer.${detail}`)) return;

  try {
    await deleteOrderCascade(orderId);
    window.location.href = "pedidos.html";
  } catch (error) {
    console.error("Error eliminando el pedido:", error);
    window.alert("No pudimos eliminar el pedido.");
  }
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

// Sacar toda la rifa de un pedido (ej. se agregó por error). Vuelve
// raffleQuantity a 0, borra los números anotados y descuenta del total
// lo que esa rifa sumaba -- no toca las entradas ni los pagos.
async function onRemoveRaffle() {
  const o = currentOrder;
  const monto = (o.raffleQuantity || 0) * (o.raffleUnitPrice || 0);
  if (!window.confirm(`¿Quitar los ${o.raffleQuantity} número(s) de rifa de este pedido? El total baja ${gs(monto)}. No se puede deshacer.`)) {
    return;
  }
  try {
    await removeRaffleFromOrder(orderId);
  } catch (error) {
    console.error("Error quitando la rifa del pedido:", error);
    window.alert("No pudimos quitar la rifa.");
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
  const raffleRemoveSection = document.getElementById("raffle-remove-section");
  const raffleNumbersSection = document.getElementById("raffle-numbers-section");
  const hasRaffle = o.raffleQuantity > 0;
  // Igual que emitir la entrada: hasta que el pedido no esté 100% pagado,
  // no se anotan los números del talonario entregados (el papel físico se
  // entrega junto con la entrada, no antes). "Quitar rifa" es aparte --
  // corrige un error de carga, así que tiene que poder usarse en
  // cualquier momento, pago completo o no.
  const raffleReady = hasRaffle && o.status === "paid";
  // La tarjeta siempre está visible si el evento vende rifa (para poder
  // agregar, aunque este pedido todavía no tenga ninguna -- incluye
  // pedidos viejos cargados antes de que la rifa existiera); si no vende
  // rifa, directamente no tiene sentido mostrar nada de esto.
  raffleCard.hidden = !(ticketEvent && ticketEvent.raffleEnabled);
  raffleRemoveSection.hidden = !hasRaffle;
  raffleNumbersSection.hidden = !raffleReady;
  document.getElementById("raffle-info").textContent = !hasRaffle
    ? "Todavía no compró números de rifa."
    : raffleReady
      ? `Compró ${o.raffleQuantity} número(s) de rifa. Anotados ${(o.raffleNumbers || []).length} de ${o.raffleQuantity}.`
      : `Compró ${o.raffleQuantity} número(s) de rifa. Vas a poder anotar los números del talonario entregados cuando el pedido esté pagado.`;
  if (raffleReady) {
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
  if (ctx.isAdmin) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-outline";
    deleteBtn.textContent = "Eliminar pedido";
    deleteBtn.addEventListener("click", onDeleteOrder);
    actions.appendChild(deleteBtn);
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
    const actionsBox = document.createElement("div");
    actionsBox.className = "admin-row-actions";

    const link = document.createElement("a");
    link.href = ticketUrl(t.id);
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn btn-outline";
    link.textContent = "Ver entrada";
    actionsBox.appendChild(link);

    if (ctx.isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-outline";
      editBtn.textContent = "Editar";
      editBtn.addEventListener("click", () => onEditTicket(t));
      actionsBox.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-outline";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", () => onDeleteTicket(t));
      actionsBox.appendChild(deleteBtn);
    }

    row.appendChild(actionsBox);
    list.appendChild(row);
  });
}

// Admin: corrige nombre/teléfono de una entrada ya emitida.
async function onEditTicket(ticket) {
  const holderName = window.prompt("Nombre en la entrada:", ticket.holderName);
  if (holderName === null) return;
  const holderPhone = window.prompt("Celular:", ticket.holderPhone || "");
  if (holderPhone === null) return;
  if (!holderName.trim()) {
    window.alert("El nombre no puede quedar vacío.");
    return;
  }
  try {
    await updateTicketHolder(ticket.id, { holderName: holderName.trim(), holderPhone: holderPhone.trim() });
    await refreshTickets();
  } catch (error) {
    console.error("Error editando la entrada:", error);
    window.alert("No pudimos editar la entrada.");
  }
}

// Admin: borra una entrada ya emitida y libera el cupo si correspondía.
async function onDeleteTicket(ticket) {
  if (!window.confirm(`¿Eliminar la entrada de ${ticket.holderName}? No se puede deshacer.`)) return;
  try {
    await deleteTicket(ticket.id);
    await refreshTickets();
  } catch (error) {
    console.error("Error eliminando la entrada:", error);
    window.alert("No pudimos eliminar la entrada.");
  }
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
