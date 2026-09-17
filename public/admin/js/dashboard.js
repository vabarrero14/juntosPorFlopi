import { requireAdmin } from "./auth-guard.js";
import { renderAdminNav } from "./admin-nav.js";
import { fetchAllEvents } from "../../js/events-service.js";

const statsContainer = document.getElementById("dashboard-stats");

function renderStats(events) {
  const pending = events.filter((e) => e.status === "pending").length;
  const approved = events.filter((e) => e.status === "approved").length;
  const rejected = events.filter((e) => e.status === "rejected").length;
  const now = new Date();
  const upcoming = events.filter((e) => e.status === "approved" && e.date >= now).length;

  statsContainer.innerHTML = `
    <div class="card text-center">
      <h3 class="mt-0" style="font-size: 2rem;">${pending}</h3>
      <p class="mb-0">Pendientes de revisión</p>
    </div>
    <div class="card text-center">
      <h3 class="mt-0" style="font-size: 2rem;">${approved}</h3>
      <p class="mb-0">Eventos aprobados</p>
    </div>
    <div class="card text-center">
      <h3 class="mt-0" style="font-size: 2rem;">${upcoming}</h3>
      <p class="mb-0">Próximos (aprobados)</p>
    </div>
    <div class="card text-center">
      <h3 class="mt-0" style="font-size: 2rem;">${rejected}</h3>
      <p class="mb-0">Rechazados</p>
    </div>
  `;
}

async function init() {
  const { user, auth, signOut } = await requireAdmin();
  renderAdminNav({ user, auth, signOut, activePage: "dashboard" });

  try {
    const events = await fetchAllEvents();
    renderStats(events);
  } catch (error) {
    console.error("Error cargando estadísticas:", error);
    statsContainer.innerHTML = `<div class="empty-state">No pudimos cargar las estadísticas.</div>`;
  }
}

init();
