import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { getTicketEvent } from "../../../js/ticket-events-service.js";
import { createOrder, fetchMyOrders, fetchAllOrders } from "../../../js/orders-service.js";
import { issueCourtesyTicket, watchTicketsForEvent, updateTicketHolder, deleteTicket } from "../../../js/tickets-service.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const form = document.getElementById("order-form");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const pricePreview = document.getElementById("price-preview");
const capacityWarning = document.getElementById("capacity-warning");
const listEl = document.getElementById("orders-list");

const STATUS_LABEL = { reserved: "Reservado", partial: "Parcial", paid: "Pagado", cancelled: "Cancelado" };
const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");

let ticketEvent = null;
let ctx = null;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

function updatePricePreview() {
  if (!ticketEvent) return;
  const qty = Math.max(1, Math.round(Number(form.quantity.value) || 1));
  const unitPrice = form.channel.value === "puerta" ? ticketEvent.priceDoor : ticketEvent.priceEarly;
  const raffleQty = ticketEvent.raffleEnabled ? Math.max(0, Math.round(Number(form.raffleQuantity.value) || 0)) : 0;
  const rafflePrice = ticketEvent.rafflePrice || 0;
  const total = qty * unitPrice + raffleQty * rafflePrice;

  const parts = [`${qty} entrada(s) x ${gs(unitPrice)}`];
  if (raffleQty > 0) parts.push(`${raffleQty} número(s) de rifa x ${gs(rafflePrice)}`);
  pricePreview.textContent = `${parts.join(" + ")} = ${gs(total)}`;
}

function renderOrderRow(order) {
  const row = document.createElement("div");
  row.className = "entry-row";
  const bits = [];
  if (order.quantity > 0) bits.push(`${order.quantity} entrada(s)`);
  if (order.raffleQuantity > 0) bits.push(`${order.raffleQuantity} número(s) de rifa`);
  row.innerHTML = `
    <div>
      <strong>${order.buyerName}</strong>
      <span class="badge ${order.status}">${STATUS_LABEL[order.status] || order.status}</span>
      ${order.collaboration ? '<span class="category-tag">Colaboración</span>' : ""}
      <div class="form-help">
        ${bits.join(" · ")} · ${gs(order.total)} · pagado ${gs(order.amountConfirmedTotal)}
        ${order.channel === "puerta" ? "· puerta" : ""}
      </div>
    </div>
  `;
  const link = document.createElement("a");
  link.href = `pedido.html?id=${order.id}`;
  link.className = "btn btn-outline";
  link.textContent = "Ver / Cobrar";
  row.appendChild(link);
  return row;
}

async function loadOrders() {
  listEl.innerHTML = `<p class="text-center">Cargando…</p>`;
  try {
    const orders = ctx.isAdmin ? await fetchAllOrders(FLOPI_FEST_ID) : await fetchMyOrders(ctx.user.uid);
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    listEl.innerHTML = "";
    if (orders.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Todavía no hay pedidos.</div>`;
      return;
    }
    orders.forEach((o) => listEl.appendChild(renderOrderRow(o)));
  } catch (error) {
    console.error("Error cargando pedidos:", error);
    listEl.innerHTML = `<div class="empty-state">No pudimos cargar los pedidos.</div>`;
  }
}

function renderCourtesyList(tickets) {
  const box = document.getElementById("courtesy-list");
  const courtesies = tickets.filter((t) => t.type === "courtesy");
  if (courtesies.length === 0) {
    box.innerHTML = `<p class="mute">Todavía no se emitió ninguna.</p>`;
    return;
  }
  box.innerHTML = "";
  courtesies.forEach((t) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    row.innerHTML = `
      <div>
        <strong>${t.holderName}</strong>
        <span class="badge ${t.status}">${t.status === "checked_in" ? "Ingresó" : t.status === "voided" ? "Anulada" : "Emitida"}</span>
        <div class="ticket-code">${t.shortCode}</div>
      </div>
    `;
    const actionsBox = document.createElement("div");
    actionsBox.className = "admin-row-actions";

    const link = document.createElement("a");
    link.href = `${window.location.origin}/entrada.html?c=${t.id}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn btn-outline";
    link.textContent = "Ver entrada";
    actionsBox.appendChild(link);

    if (ctx.isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-outline";
      editBtn.textContent = "Editar";
      editBtn.addEventListener("click", () => onEditCourtesyTicket(t));
      actionsBox.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-outline";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", () => onDeleteCourtesyTicket(t));
      actionsBox.appendChild(deleteBtn);
    }

    row.appendChild(actionsBox);
    box.appendChild(row);
  });
}

// Admin: corrige nombre/teléfono de una cortesía ya emitida.
async function onEditCourtesyTicket(ticket) {
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
  } catch (error) {
    console.error("Error editando la cortesía:", error);
    window.alert("No pudimos editar la entrada.");
  }
}

// Admin: borra una cortesía ya emitida y libera el cupo si correspondía.
async function onDeleteCourtesyTicket(ticket) {
  if (!window.confirm(`¿Eliminar la cortesía de ${ticket.holderName}? No se puede deshacer.`)) return;
  try {
    await deleteTicket(ticket.id);
  } catch (error) {
    console.error("Error eliminando la cortesía:", error);
    window.alert("No pudimos eliminar la entrada.");
  }
}

async function init() {
  ctx = await requireEventStaff();
  renderEntradasNav({ ...ctx, activePage: "pedidos" });

  const courtesyForm = document.getElementById("courtesy-form");
  const courtesyMsg = document.getElementById("courtesy-message");
  const courtesyBtn = document.getElementById("courtesy-btn");
  courtesyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    courtesyMsg.hidden = true;
    courtesyBtn.disabled = true;
    courtesyBtn.textContent = "Emitiendo…";
    try {
      await issueCourtesyTicket({
        ticketEventId: FLOPI_FEST_ID,
        holderName: document.getElementById("courtesyName").value.trim(),
        holderPhone: document.getElementById("courtesyPhone").value.trim(),
        issuedByUid: ctx.user.uid,
        issuedByEmail: ctx.user.email,
      });
      courtesyForm.reset();
    } catch (error) {
      console.error("Error emitiendo cortesía:", error);
      courtesyMsg.textContent = "No pudimos emitir la cortesía (puede que ya no haya cupo).";
      courtesyMsg.className = "form-message error";
      courtesyMsg.hidden = false;
    } finally {
      courtesyBtn.disabled = false;
      courtesyBtn.textContent = "Emitir cortesía";
    }
  });
  watchTicketsForEvent(FLOPI_FEST_ID, renderCourtesyList, (error) => console.error("Error cargando cortesías:", error));

  ticketEvent = await getTicketEvent(FLOPI_FEST_ID);
  if (!ticketEvent) {
    form.hidden = true;
    listEl.innerHTML = "";
    capacityWarning.textContent = "Todavía no se configuró el evento. Pedile a un admin que lo haga en Configuración.";
    capacityWarning.className = "form-message error";
    capacityWarning.hidden = false;
    return;
  }

  if (ticketEvent.capacity - ticketEvent.issuedCount <= 10) {
    capacityWarning.textContent = `Quedan ${Math.max(0, ticketEvent.capacity - ticketEvent.issuedCount)} entradas de ${ticketEvent.capacity}. Avisale a un admin antes de seguir vendiendo de más.`;
    capacityWarning.className = "form-message error";
    capacityWarning.hidden = false;
  }

  document.getElementById("raffle-field-row").hidden = !ticketEvent.raffleEnabled;

  form.quantity.addEventListener("input", updatePricePreview);
  form.channel.addEventListener("change", updatePricePreview);
  form.raffleQuantity.addEventListener("input", updatePricePreview);
  updatePricePreview();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const channel = form.channel.value;
    const quantity = Math.max(1, Math.round(Number(form.quantity.value) || 1));
    const raffleQuantity = ticketEvent.raffleEnabled ? Math.max(0, Math.round(Number(form.raffleQuantity.value) || 0)) : 0;

    if (channel === "anticipada" && ticketEvent.salesOpen === false) {
      showMessage("La venta anticipada está cerrada. Usá el tipo 'Puerta' si corresponde.", "error");
      return;
    }

    const unitPrice = channel === "puerta" ? ticketEvent.priceDoor : ticketEvent.priceEarly;

    submitBtn.disabled = true;
    submitBtn.textContent = "Cargando…";

    try {
      const orderId = await createOrder({
        ticketEventId: FLOPI_FEST_ID,
        buyerName: form.buyerName.value.trim(),
        buyerPhone: form.buyerPhone.value.trim(),
        quantity,
        channel,
        unitPrice,
        raffleQuantity,
        raffleUnitPrice: ticketEvent.rafflePrice || 0,
        collaboration: form.collaboration.checked,
        sellerUid: ctx.user.uid,
        sellerEmail: ctx.user.email,
      });
      window.location.href = `pedido.html?id=${orderId}`;
    } catch (error) {
      console.error("Error cargando el pedido:", error);
      showMessage("No pudimos cargar el pedido. Probá de nuevo.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Cargar pedido";
    }
  });

  await loadOrders();
}

init();
