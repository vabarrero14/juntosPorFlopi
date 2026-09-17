// Completa el email del usuario y engancha el botón de salir en el header
// compartido de las páginas internas del panel.
export function renderAdminNav({ user, auth, signOut, activePage }) {
  const emailEl = document.getElementById("admin-user-email");
  if (emailEl) emailEl.textContent = user.email;

  const logoutBtn = document.getElementById("admin-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut(auth));
  }

  if (activePage) {
    document
      .querySelectorAll(`.admin-nav-links a[data-page="${activePage}"]`)
      .forEach((a) => a.classList.add("active"));
  }
}
