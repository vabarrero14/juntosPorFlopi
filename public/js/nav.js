// Menú mobile (hamburguesa) y marcado del link activo, compartido por todas
// las páginas.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
    });

    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => links.classList.remove("open"));
    });
  }

  const currentPage = document.body.dataset.page;
  if (currentPage) {
    document.querySelectorAll(`.nav-links a[data-page="${currentPage}"]`).forEach((link) => {
      link.classList.add("active");
    });
  }
});
