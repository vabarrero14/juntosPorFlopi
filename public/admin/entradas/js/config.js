import { requireEventAdmin } from "../../js/event-staff-guard.js";
import { renderEntradasNav } from "../../js/entradas-nav.js";
import { getTicketEvent, createTicketEvent, updateTicketEventConfig } from "../../../js/ticket-events-service.js";
import { FLOPI_FEST_ID } from "../../../js/ticket-event-constants.js";

const form = document.getElementById("config-form");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const issuedCountInfo = document.getElementById("issued-count-info");

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function toTimeInputValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
}

let existing = null;

async function prefill() {
  existing = await getTicketEvent(FLOPI_FEST_ID);
  if (!existing) return;

  form.name.value = existing.name || "";
  form.venue.value = existing.venue || "";
  form.artists.value = (existing.artists || []).join(", ");
  form.description.value = existing.description || "";
  if (existing.date) {
    form.date.value = toDateInputValue(existing.date);
    form.time.value = toTimeInputValue(existing.date);
  }
  form.doorsOpenTime.value = existing.doorsOpenTime || "";
  form.priceEarly.value = existing.priceEarly ?? "";
  form.priceDoor.value = existing.priceDoor ?? "";
  form.capacity.value = existing.capacity ?? "";
  form.salesOpen.checked = existing.salesOpen !== false;
  form.raffleEnabled.checked = Boolean(existing.raffleEnabled);
  form.raffleItemName.value = existing.raffleItemName || "";
  form.rafflePrice.value = existing.rafflePrice || "";

  if (typeof existing.issuedCount === "number") {
    issuedCountInfo.textContent = `Ya se emitieron ${existing.issuedCount} de ${existing.capacity} entradas. La capacidad no se puede bajar por debajo de ese número.`;
    issuedCountInfo.hidden = false;
  }
}

async function init() {
  const ctx = await requireEventAdmin();
  renderEntradasNav({ ...ctx, activePage: "config" });

  await prefill();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const formData = new FormData(form);
    const eventDate = new Date(`${formData.get("date")}T${formData.get("time")}`);
    if (Number.isNaN(eventDate.getTime())) {
      showMessage("La fecha/hora ingresada no es válida.", "error");
      return;
    }

    const capacity = Number(formData.get("capacity"));
    if (existing && typeof existing.issuedCount === "number" && capacity < existing.issuedCount) {
      showMessage(`La capacidad no puede ser menor a las ${existing.issuedCount} entradas que ya se emitieron.`, "error");
      return;
    }

    const input = {
      name: formData.get("name").trim(),
      venue: formData.get("venue").trim(),
      artists: formData.get("artists").split(",").map((a) => a.trim()).filter(Boolean),
      description: formData.get("description").trim(),
      date: eventDate,
      doorsOpenTime: formData.get("doorsOpenTime") || null,
      priceEarly: Number(formData.get("priceEarly")),
      priceDoor: Number(formData.get("priceDoor")),
      capacity,
      salesOpen: form.salesOpen.checked,
      raffleEnabled: form.raffleEnabled.checked,
      raffleItemName: formData.get("raffleItemName").trim(),
      rafflePrice: Number(formData.get("rafflePrice")) || 0,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      if (existing) {
        await updateTicketEventConfig(FLOPI_FEST_ID, input);
      } else {
        await createTicketEvent(FLOPI_FEST_ID, input);
      }
      showMessage("Guardado.", "success");
      await prefill();
    } catch (error) {
      console.error("Error guardando la configuración:", error);
      showMessage("No pudimos guardar. Probá de nuevo.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
    }
  });
}

init();
