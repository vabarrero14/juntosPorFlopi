// Header compartido por las páginas del módulo de entradas. A diferencia
// de renderAdminNav() (menú general, solo para admins), este header lo
// usan también vendedor/puerta, así que oculta los links marcados
// data-admin-only cuando quien entró no es admin.
export function renderEntradasNav({ user, role, isAdmin, auth, signOut, activePage }) {
  const emailEl = document.getElementById("admin-user-email");
  if (emailEl) emailEl.textContent = user.email;

  const roleEl = document.getElementById("entradas-role-badge");
  if (roleEl) {
    const labels = { admin: "Administrador", vendedor: "Vendedor", puerta: "Puerta" };
    roleEl.textContent = labels[role] || role;
  }

  const logoutBtn = document.getElementById("admin-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut(auth));
  }

  if (!isAdmin) {
    document.querySelectorAll("[data-admin-only]").forEach((el) => {
      el.hidden = true;
    });
  }

  if (activePage) {
    document
      .querySelectorAll(`.admin-nav-links a[data-page="${activePage}"]`)
      .forEach((a) => a.classList.add("active"));
  }
}
