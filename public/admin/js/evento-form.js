import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import {
  EVENT_CATEGORIES,
  fetchEventById,
  createEventDirect,
  updateEvent,
} from "../../js/events-service.js";

const form = document.getElementById("event-form");
const formTitle = document.getElementById("form-title");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const categorySelect = document.getElementById("category");

EVENT_CATEGORIES.forEach((cat) => {
  const option = document.createElement("option");
  option.value = cat.value;
  option.textContent = cat.label;
  categorySelect.appendChild(option);
});

const eventId = new URLSearchParams(window.location.search).get("id");

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
  messageEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function prefillForm() {
  if (!eventId) return;
  formTitle.textContent = "Editar evento";
  try {
    const event = await fetchEventById(eventId);
    if (!event) {
      showMessage("No encontramos ese evento.", "error");
      return;
    }
    form.title.value = event.title;
    form.category.value = event.category;
    form.description.value = event.description;
    form.date.value = toDateInputValue(event.date);
    form.time.value = toTimeInputValue(event.date);
    form.address.value = event.location?.address ?? "";
    form.city.value = event.location?.city ?? "";
    form.mapsUrl.value = event.location?.mapsUrl ?? "";
    form.organizer.value = event.organizer;
    form.organizerContact.value = event.organizerContact ?? "";
    form.instagramUrl.value = event.instagramUrl ?? "";
  } catch (error) {
    console.error("Error cargando el evento:", error);
    showMessage("No pudimos cargar el evento para editarlo.", "error");
  }
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "eventos" });

  await prefillForm();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.hidden = true;

    const formData = new FormData(form);
    const eventDate = new Date(`${formData.get("date")}T${formData.get("time")}`);

    if (Number.isNaN(eventDate.getTime())) {
      showMessage("La fecha/hora ingresada no es válida.", "error");
      return;
    }

    const input = {
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      category: formData.get("category"),
      date: eventDate,
      address: formData.get("address").trim(),
      city: formData.get("city").trim(),
      mapsUrl: formData.get("mapsUrl").trim(),
      organizer: formData.get("organizer").trim(),
      organizerContact: formData.get("organizerContact").trim(),
      instagramUrl: formData.get("instagramUrl").trim(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      if (eventId) {
        await updateEvent(eventId, input);
      } else {
        await createEventDirect(input, user.email);
      }
      window.location.href = "eventos.html";
    } catch (error) {
      console.error("Error guardando el evento:", error);
      showMessage("No pudimos guardar el evento. Probá de nuevo.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar";
    }
  });
}

init();
