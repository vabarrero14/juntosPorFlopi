import { requireEventStaff } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { getTicketEvent } from "../../../js/ticket-events-service.js";
import { createOrder } from "../../../js/orders-service.js";
import { registerCashPayment, registerTransferPayment } from "../../../js/payments-service.js";
import { issueTicket, checkInTicket } from "../../../js/tickets-service.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const form = document.getElementById("quick-form");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const pricePreview = document.getElementById("price-preview");
const capacityWarning = document.getElementById("capacity-warning");
const resultCard = document.getElementById("result-card");
const resultContent = document.getElementById("result-content");
const methodSelect = document.getElementById("method");
const referenceRow = document.getElementById("reference-row");

const gs = (n) => "Gs. " + Number(n).toLocaleString("es-PY");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ctx = null;
let ticketEvent = null;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

function updatePricePreview() {
  if (!ticketEvent) return;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);
  pricePreview.textContent = `${qty} x ${gs(ticketEvent.priceDoor)} = ${gs(qty * ticketEvent.priceDoor)} (precio puerta)`;
}

async function init() {
  ctx = await requireEventStaff();
  renderEntradasNav({ ...ctx, activePage: "venta-puerta" });

  ticketEvent = await getTicketEvent(FLOPI_FEST_ID);
  if (!ticketEvent) {
    form.hidden = true;
    capacityWarning.textContent = "Todavía no se configuró el evento.";
    capacityWarning.className = "form-message error";
    capacityWarning.hidden = false;
    return;
  }

  if (ticketEvent.capacity - ticketEvent.issuedCount <= 10) {
    capacityWarning.textContent = `Quedan ${Math.max(0, ticketEvent.capacity - ticketEvent.issuedCount)} entradas de ${ticketEvent.capacity}.`;
    capacityWarning.className = "form-message error";
    capacityWarning.hidden = false;
  }

  document.getElementById("quantity").addEventListener("input", updatePricePreview);
  updatePricePreview();

  methodSelect.addEventListener("change", () => {
    referenceRow.hidden = methodSelect.value !== "transfer";
  });

  form.addEventListener("submit", onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  messageEl.hidden = true;
  resultCard.hidden = true;

  const buyerName = document.getElementById("buyerName").value.trim();
  const buyerPhone = document.getElementById("buyerPhone").value.trim();
  const quantity = Math.max(1, Math.round(Number(document.getElementById("quantity").value)));
  const method = methodSelect.value;
  const reference = document.getElementById("reference").value.trim();

  if (method === "transfer" && !reference) {
    showMessage("Para una transferencia hace falta el n° de comprobante o alias.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Procesando…";

  try {
    const total = quantity * ticketEvent.priceDoor;
    const orderId = await createOrder({
      ticketEventId: FLOPI_FEST_ID,
      buyerName,
      buyerPhone,
      quantity,
      channel: "puerta",
      unitPrice: ticketEvent.priceDoor,
      sellerUid: ctx.user.uid,
      sellerEmail: ctx.user.email,
    });

    if (method === "cash") {
      await registerCashPayment({ orderId, ticketEventId: FLOPI_FEST_ID, amount: total, receivedByUid: ctx.user.uid, receivedByEmail: ctx.user.email });

      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const t = await issueTicket({
          ticketEventId: FLOPI_FEST_ID,
          orderId,
          holderName: buyerName,
          holderPhone: buyerPhone,
          issuedByUid: ctx.user.uid,
          issuedByEmail: ctx.user.email,
        });
        await checkInTicket(t.code, { byUid: ctx.user.uid, byEmail: ctx.user.email });
        tickets.push(t);
      }

      resultCard.hidden = false;
      resultContent.innerHTML = `
        <div class="form-message success">¡Listo! ${esc(buyerName)} ya puede entrar — ${quantity} entrada(s) cobradas e ingresadas.</div>
        ${tickets
          .map(
            (t) => `<div class="entry-row"><span class="ticket-code">${t.shortCode}</span>
              <a class="btn btn-outline" href="${window.location.origin}/entrada.html?c=${t.code}" target="_blank" rel="noopener">Ver entrada</a></div>`
          )
          .join("")}
      `;
      ticketEvent.issuedCount += quantity;
    } else {
      await registerTransferPayment({ orderId, ticketEventId: FLOPI_FEST_ID, amount: total, reference, receivedByUid: ctx.user.uid, receivedByEmail: ctx.user.email });
      resultCard.hidden = false;
      resultContent.innerHTML = `
        <div class="form-message">Pedido cargado por ${gs(total)}, transferencia pendiente de confirmación.
        Una vez que un admin la confirme, emití la entrada desde <a href="pedido.html?id=${orderId}">este pedido</a>.</div>
      `;
    }

    form.reset();
    updatePricePreview();
    referenceRow.hidden = true;
  } catch (error) {
    console.error("Error en la venta en puerta:", error);
    showMessage("Algo falló. Revisá el pedido en 'Pedidos' antes de reintentar para no cobrar doble.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Cobrar e ingresar";
  }
}

init();
