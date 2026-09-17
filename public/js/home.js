import { fetchApprovedEvents, categoryLabel } from "./events-service.js";
import { formatShortDate } from "./date-utils.js";

const container = document.getElementById("upcoming-events");

function renderEventCard(event) {
  const card = document.createElement("a");
  card.className = "event-card";
  card.href = "calendario.html";
  card.innerHTML = `
    <span class="event-date-badge">${formatShortDate(event.date)}</span>
    <h3 class="mt-0 mb-0">${event.title}</h3>
    <span class="category-tag">${categoryLabel(event.category)}</span>
    <p>${event.location?.address ?? ""}</p>
    <p class="form-help">Organiza: ${event.organizer}</p>
  `;
  return card;
}

function renderEmptyState() {
  container.innerHTML = `
    <div class="empty-state">
      <p>Todavía no hay eventos publicados.</p>
      <p><a href="proponer-evento.html">¡Sé el primero en proponer uno!</a></p>
    </div>
  `;
}

function renderErrorState() {
  container.innerHTML = `
    <div class="empty-state">
      <p>No pudimos cargar los eventos en este momento. Probá de nuevo más tarde.</p>
    </div>
  `;
}

async function init() {
  try {
    const events = await fetchApprovedEvents();
    const now = new Date();
    const upcoming = events.filter((e) => e.date >= now).slice(0, 4);

    if (upcoming.length === 0) {
      renderEmptyState();
      return;
    }

    container.innerHTML = "";
    upcoming.forEach((event) => container.appendChild(renderEventCard(event)));
  } catch (error) {
    console.error("Error cargando próximos eventos:", error);
    renderErrorState();
  }
}

init();
