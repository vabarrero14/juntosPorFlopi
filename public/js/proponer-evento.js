import { submitEventProposal, EVENT_CATEGORIES } from "./events-service.js";

const form = document.getElementById("event-form");
const messageEl = document.getElementById("form-message");
const submitBtn = document.getElementById("submit-btn");
const categorySelect = document.getElementById("category");

EVENT_CATEGORIES.forEach((cat) => {
  const option = document.createElement("option");
  option.value = cat.value;
  option.textContent = cat.label;
  categorySelect.appendChild(option);
});

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.hidden = false;
  messageEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageEl.hidden = true;

  const formData = new FormData(form);
  const dateStr = formData.get("date");
  const timeStr = formData.get("time");
  const eventDate = new Date(`${dateStr}T${timeStr}`);

  if (Number.isNaN(eventDate.getTime())) {
    showMessage("La fecha/hora ingresada no es válida.", "error");
    return;
  }

  if (eventDate < new Date()) {
    showMessage("La fecha del evento no puede ser en el pasado.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando…";

  try {
    await submitEventProposal({
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      category: formData.get("category"),
      date: eventDate,
      address: formData.get("address").trim(),
      city: formData.get("city").trim(),
      mapsUrl: formData.get("mapsUrl").trim(),
      organizer: formData.get("organizer").trim(),
      organizerContact: formData.get("organizerContact").trim(),
      submitterName: formData.get("submitterName").trim(),
      submitterEmail: formData.get("submitterEmail").trim(),
      submitterPhone: formData.get("submitterPhone").trim(),
    });

    form.reset();
    showMessage(
      "¡Gracias! Tu evento fue enviado y va a publicarse en el calendario una vez que lo revisemos.",
      "success"
    );
  } catch (error) {
    console.error("Error al enviar la propuesta de evento:", error);
    showMessage(
      "No pudimos enviar tu propuesta. Probá de nuevo en unos minutos.",
      "error"
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar propuesta";
  }
});
