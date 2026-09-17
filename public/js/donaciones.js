import { fetchActiveDonations } from "./donations-service.js";

const container = document.getElementById("donations-list");

function renderDonationCard(donation) {
  const card = document.createElement("div");
  card.className = "card donation-card";
  card.innerHTML = `
    <div>
      <h3 class="mt-0 mb-0">${donation.title}</h3>
      <p class="donation-details">${donation.details}</p>
      ${donation.instagramUrl ? `<a href="${donation.instagramUrl}" target="_blank" rel="noopener">Ver posteo en Instagram</a>` : ""}
    </div>
    <button type="button" class="btn btn-outline copy-btn">Copiar</button>
  `;
  card.querySelector(".copy-btn").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(donation.details);
      e.target.textContent = "¡Copiado!";
      setTimeout(() => (e.target.textContent = "Copiar"), 1500);
    } catch (error) {
      console.error("No se pudo copiar:", error);
    }
  });
  return card;
}

function renderEmptyState() {
  container.innerHTML = `
    <div class="empty-state">
      <p>Todavía no cargamos las formas de donar acá. Mientras tanto, escribinos por
      Instagram y te pasamos los datos.</p>
    </div>
  `;
}

function renderErrorState() {
  container.innerHTML = `
    <div class="empty-state">
      <p>No pudimos cargar las formas de donar en este momento. Probá de nuevo más tarde.</p>
    </div>
  `;
}

async function init() {
  try {
    const donations = await fetchActiveDonations();
    if (donations.length === 0) {
      renderEmptyState();
      return;
    }
    container.innerHTML = "";
    donations.forEach((donation) => container.appendChild(renderDonationCard(donation)));
  } catch (error) {
    console.error("Error cargando donaciones:", error);
    renderErrorState();
  }
}

init();
