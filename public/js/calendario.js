import { fetchApprovedEvents, EVENT_CATEGORIES, categoryLabel } from "./events-service.js";
import { formatFullDate, isSameDay } from "./date-utils.js";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
});
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_PILLS_VISIBLE = 3;

const grid = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("month-label");
const statusEl = document.getElementById("calendar-status");
const categoryFilter = document.getElementById("category-filter");

const modal = document.getElementById("event-modal");
const modalCloseBtn = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const modalCategory = document.getElementById("modal-category");
const modalDate = document.getElementById("modal-date");
const modalLocation = document.getElementById("modal-location");
const modalOrganizer = document.getElementById("modal-organizer");
const modalDescription = document.getElementById("modal-description");
const modalMapsLink = document.getElementById("modal-maps-link");
const modalInstagramLink = document.getElementById("modal-instagram-link");

let allEvents = [];
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function populateCategoryFilter() {
  EVENT_CATEGORIES.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.value;
    option.textContent = cat.label;
    categoryFilter.appendChild(option);
  });
}

function getFilteredEvents() {
  const selected = categoryFilter.value;
  return selected ? allEvents.filter((e) => e.category === selected) : allEvents;
}

function openModal(event) {
  modalTitle.textContent = event.title;
  modalCategory.textContent = categoryLabel(event.category);
  modalDate.textContent = formatFullDate(event.date);
  modalLocation.textContent = [event.location?.address, event.location?.city]
    .filter(Boolean)
    .join(", ");
  modalOrganizer.textContent = event.organizerContact
    ? `${event.organizer} (${event.organizerContact})`
    : event.organizer;
  modalDescription.textContent = event.description || "";

  if (event.location?.mapsUrl) {
    modalMapsLink.href = event.location.mapsUrl;
    modalMapsLink.hidden = false;
  } else {
    modalMapsLink.hidden = true;
  }

  if (event.instagramUrl) {
    modalInstagramLink.href = event.instagramUrl;
    modalInstagramLink.hidden = false;
  } else {
    modalInstagramLink.hidden = true;
  }

  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

modalCloseBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function buildDayCell(date, isOutsideMonth, eventsForDay) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";
  if (isOutsideMonth) cell.classList.add("is-outside");
  if (isSameDay(date, new Date())) cell.classList.add("is-today");

  const number = document.createElement("div");
  number.className = "calendar-day-number";
  number.textContent = date.getDate();
  cell.appendChild(number);

  if (!isOutsideMonth) {
    const visibleEvents = eventsForDay.slice(0, MAX_PILLS_VISIBLE);
    const hiddenCount = eventsForDay.length - visibleEvents.length;

    visibleEvents.forEach((event) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "calendar-event-pill";
      pill.textContent = event.title;
      pill.title = event.title;
      pill.addEventListener("click", () => openModal(event));
      cell.appendChild(pill);
    });

    if (hiddenCount > 0) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "calendar-more";
      moreBtn.textContent = `+${hiddenCount} más`;
      moreBtn.addEventListener("click", () => {
        eventsForDay.slice(MAX_PILLS_VISIBLE).forEach((event) => {
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className = "calendar-event-pill";
          pill.textContent = event.title;
          pill.addEventListener("click", () => openModal(event));
          cell.insertBefore(pill, moreBtn);
        });
        moreBtn.remove();
      });
      cell.appendChild(moreBtn);
    }
  }

  return cell;
}

function renderCalendar() {
  const label = MONTH_LABEL_FORMATTER.format(currentMonth);
  monthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  grid.innerHTML = "";

  WEEKDAYS.forEach((day) => {
    const label = document.createElement("div");
    label.className = "calendar-weekday";
    label.textContent = day;
    grid.appendChild(label);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // Lunes = 0 ... Domingo = 6
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;

  const gridStart = new Date(year, month, 1 - firstWeekday);
  const filteredEvents = getFilteredEvents();

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const isOutsideMonth = cellDate.getMonth() !== month;
    const eventsForDay = filteredEvents
      .filter((e) => isSameDay(e.date, cellDate))
      .sort((a, b) => a.date - b.date);

    grid.appendChild(buildDayCell(cellDate, isOutsideMonth, eventsForDay));
  }
}

document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById("today-btn").addEventListener("click", () => {
  const now = new Date();
  currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
});

categoryFilter.addEventListener("change", renderCalendar);

async function init() {
  populateCategoryFilter();
  try {
    allEvents = await fetchApprovedEvents();
  } catch (error) {
    console.error("Error cargando eventos del calendario:", error);
    statusEl.innerHTML = `<div class="empty-state">No pudimos cargar los eventos. Probá de nuevo más tarde.</div>`;
  }
  renderCalendar();
}

init();
